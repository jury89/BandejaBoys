import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth'
import { deleteField, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
import type { MemberProfile, NotificationPreferences, SessionUser } from '../types'
import { firebaseAuth, firestore, hasRemoteBackend } from './firebase'
import { makeId, profileNameError } from './domain'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  normalizeNotificationPreferences,
} from './notificationPreferences'

interface LocalAccount extends MemberProfile {
  passwordHash: string
}

const ACCOUNTS_KEY = 'bandeja-boys:accounts'
const SESSION_KEY = 'bandeja-boys:session'
const AUTH_EVENT = 'bandeja-boys:auth'
export const USERS_EVENT = 'bandeja-boys:users'

function readAccounts(): LocalAccount[] {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? '[]') as LocalAccount[]
  } catch {
    return []
  }
}

function writeAccounts(accounts: LocalAccount[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
  window.dispatchEvent(new Event(USERS_EVENT))
}

function accountProfile(account: LocalAccount): MemberProfile {
  return {
    id: account.id,
    displayName: account.displayName,
    email: account.email,
    createdAt: account.createdAt,
    avatarDataUrl: account.avatarDataUrl,
    notificationPreferences: normalizeNotificationPreferences(account.notificationPreferences),
  }
}

async function hashPassword(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(password)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function currentLocalUser(): SessionUser | null {
  const id = localStorage.getItem(SESSION_KEY)
  const account = readAccounts().find((candidate) => candidate.id === id)
  if (!account) return null
  return accountProfile(account)
}

function emitAuthChange() {
  window.dispatchEvent(new Event(AUTH_EVENT))
}

export function getLocalProfiles(): MemberProfile[] {
  return readAccounts().map(accountProfile)
}

export function subscribeToSession(listener: (user: SessionUser | null) => void): () => void {
  if (hasRemoteBackend && firebaseAuth && firestore) {
    const db = firestore
    let stopProfile: (() => void) | null = null
    const stopAuth = onAuthStateChanged(firebaseAuth, (user) => {
      stopProfile?.()
      stopProfile = null
      if (!user) {
        listener(null)
        return
      }

      const fallback: SessionUser = {
        id: user.uid,
        displayName: user.displayName?.trim() || 'Giocatore',
        email: user.email ?? '',
        createdAt: Number(user.metadata.creationTime ? new Date(user.metadata.creationTime) : Date.now()),
        notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
      }

      stopProfile = onSnapshot(
        doc(db, 'users', user.uid),
        (snapshot) => {
          if (!snapshot.exists()) {
            listener(fallback)
            return
          }
          const profile = snapshot.data() as Partial<MemberProfile>
          listener({
            ...fallback,
            ...profile,
            id: user.uid,
            displayName: profile.displayName?.trim() || fallback.displayName,
            email: profile.email ?? fallback.email,
            notificationPreferences: normalizeNotificationPreferences(profile.notificationPreferences),
          })
        },
        () => listener(fallback),
      )
    })
    return () => {
      stopProfile?.()
      stopAuth()
    }
  }

  const notify = () => listener(currentLocalUser())
  window.addEventListener(AUTH_EVENT, notify)
  notify()
  return () => window.removeEventListener(AUTH_EVENT, notify)
}

export async function registerAccount(
  displayName: string,
  email: string,
  password: string,
): Promise<SessionUser> {
  const cleanName = displayName.trim()
  const cleanEmail = email.trim().toLowerCase()
  if (cleanName.length < 2) throw new Error('Inserisci il nome che vedranno gli amici.')
  if (password.length < 6) throw new Error('La password deve avere almeno 6 caratteri.')

  if (hasRemoteBackend && firebaseAuth && firestore) {
    const credential = await createUserWithEmailAndPassword(firebaseAuth, cleanEmail, password)
    await updateProfile(credential.user, { displayName: cleanName })
    const profile: MemberProfile = {
      id: credential.user.uid,
      displayName: cleanName,
      email: cleanEmail,
      createdAt: Date.now(),
      notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
    }
    await setDoc(doc(firestore, 'users', profile.id), profile)
    return profile
  }

  const accounts = readAccounts()
  if (accounts.some((account) => account.email === cleanEmail)) {
    throw new Error('Esiste già un account con questa email.')
  }
  const account: LocalAccount = {
    id: makeId('member'),
    displayName: cleanName,
    email: cleanEmail,
    createdAt: Date.now(),
    notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
    passwordHash: await hashPassword(password),
  }
  writeAccounts([...accounts, account])
  localStorage.setItem(SESSION_KEY, account.id)
  emitAuthChange()
  return accountProfile(account)
}

export async function updateAccountProfile(
  current: SessionUser,
  displayName: string,
  avatarDataUrl?: string,
  notificationPreferences?: NotificationPreferences,
): Promise<SessionUser> {
  const cleanName = displayName.trim()
  const error = profileNameError(cleanName)
  if (error) throw new Error(error)

  const nextProfile: SessionUser = {
    ...current,
    displayName: cleanName,
    avatarDataUrl: avatarDataUrl || undefined,
    notificationPreferences: normalizeNotificationPreferences(notificationPreferences),
  }

  if (hasRemoteBackend && firebaseAuth?.currentUser && firestore) {
    if (firebaseAuth.currentUser.uid !== current.id) throw new Error('Profilo non disponibile.')
    await updateDoc(doc(firestore, 'users', current.id), {
      displayName: cleanName,
      avatarDataUrl: avatarDataUrl || deleteField(),
      notificationPreferences: nextProfile.notificationPreferences,
    })
    await updateProfile(firebaseAuth.currentUser, { displayName: cleanName })
    return nextProfile
  }

  const accounts = readAccounts()
  const accountIndex = accounts.findIndex((account) => account.id === current.id)
  if (accountIndex < 0) throw new Error('Profilo non trovato.')
  accounts[accountIndex] = {
    ...accounts[accountIndex],
    displayName: cleanName,
    avatarDataUrl: avatarDataUrl || undefined,
    notificationPreferences: nextProfile.notificationPreferences,
  }
  writeAccounts(accounts)
  emitAuthChange()
  return nextProfile
}

export async function signIn(email: string, password: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase()
  if (hasRemoteBackend && firebaseAuth) {
    await signInWithEmailAndPassword(firebaseAuth, cleanEmail, password)
    return
  }

  const passwordHash = await hashPassword(password)
  const account = readAccounts().find(
    (candidate) => candidate.email === cleanEmail && candidate.passwordHash === passwordHash,
  )
  if (!account) throw new Error('Email o password non corretti.')
  localStorage.setItem(SESSION_KEY, account.id)
  emitAuthChange()
}

export async function signOut(): Promise<void> {
  if (hasRemoteBackend && firebaseAuth) {
    await firebaseSignOut(firebaseAuth)
    return
  }
  localStorage.removeItem(SESSION_KEY)
  emitAuthChange()
}

export async function resetPassword(email: string): Promise<void> {
  if (!hasRemoteBackend || !firebaseAuth) {
    throw new Error('Il recupero password è disponibile dopo il collegamento a Firebase.')
  }
  await sendPasswordResetEmail(firebaseAuth, email.trim().toLowerCase())
}
