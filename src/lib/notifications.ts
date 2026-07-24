import { deleteDoc, doc, setDoc } from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SessionUser } from '../types'
import { firestore, hasRemoteBackend } from './firebase'

const DISMISSAL_KEY_PREFIX = 'bandeja-boys:notification-prompt-dismissed:'
const VAPID_PUBLIC_KEY = import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY
const PERMISSION_TIMEOUT_MS = 15_000

export type PushNotificationState =
  | 'loading'
  | 'unsupported'
  | 'ios-install'
  | 'prompt'
  | 'enabled'
  | 'denied'

function isIosDevice(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
}

function supportsPush(): boolean {
  return hasRemoteBackend
    && window.isSecureContext
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

function dismissalKey(userId: string): string {
  return `${DISMISSAL_KEY_PREFIX}${userId}`
}

function isDismissed(userId: string): boolean {
  return localStorage.getItem(dismissalKey(userId)) === 'true'
    || sessionStorage.getItem(dismissalKey(userId)) === 'true'
}

function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

export async function requestNotificationPermission(
  timeoutMs = PERMISSION_TIMEOUT_MS,
): Promise<NotificationPermission> {
  let timeoutId: number | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(
      () => reject(new Error('Il browser non ha risposto. Riprova dalle impostazioni del sito.')),
      timeoutMs,
    )
  })

  try {
    return await Promise.race([Notification.requestPermission(), timeout])
  } finally {
    window.clearTimeout(timeoutId)
  }
}

async function subscriptionId(endpoint: string): Promise<string> {
  const bytes = new TextEncoder().encode(endpoint)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function registerNotificationWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return null
  const registration = await navigator.serviceWorker.register('/sw.js', {
    updateViaCache: 'none',
  })
  void registration.update().catch(() => undefined)
  return registration
}

async function readPushState(): Promise<PushNotificationState> {
  if (isIosDevice() && !isStandalone()) return 'ios-install'
  if (!supportsPush()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'prompt'

  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  return subscription ? 'enabled' : 'prompt'
}

async function persistSubscription(user: SessionUser, subscription: PushSubscription): Promise<void> {
  if (!firestore) throw new Error('Firebase non è configurato.')
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.auth || !json.keys.p256dh) {
    throw new Error('Il browser non ha restituito una sottoscrizione valida.')
  }

  const id = await subscriptionId(json.endpoint)
  const now = Date.now()
  await setDoc(doc(firestore, 'pushSubscriptions', id), {
    userId: user.id,
    endpoint: json.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: { auth: json.keys.auth, p256dh: json.keys.p256dh },
    createdAt: now,
    updatedAt: now,
  })
}

async function syncExistingSubscription(user: SessionUser): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (subscription) await persistSubscription(user, subscription)
}

async function enablePush(user: SessionUser): Promise<void> {
  if (isIosDevice() && !isStandalone()) {
    throw new Error('Su iPhone aggiungi prima Bandeja Boys alla schermata Home.')
  }
  if (!supportsPush()) throw new Error('Le notifiche push non sono supportate su questo dispositivo.')
  if (!VAPID_PUBLIC_KEY) throw new Error('Le notifiche non sono ancora configurate.')

  const permission = await requestNotificationPermission()
  if (permission !== 'granted') throw new Error('Permesso notifiche non concesso.')

  const registration = await registerNotificationWorker()
  if (!registration) throw new Error('Non è stato possibile preparare le notifiche.')
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY),
  })
  await persistSubscription(user, subscription)
}

async function disablePush(): Promise<void> {
  if (!firestore || !('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  const id = await subscriptionId(subscription.endpoint)
  await deleteDoc(doc(firestore, 'pushSubscriptions', id))
  await subscription.unsubscribe()
}

export function usePushNotifications(user: SessionUser | null) {
  const [state, setState] = useState<PushNotificationState>('loading')
  const [busy, setBusy] = useState(false)
  const [dismissalVersion, setDismissalVersion] = useState(0)
  const dismissed = useMemo(() => {
    void dismissalVersion
    return user ? isDismissed(user.id) : false
  }, [dismissalVersion, user])

  useEffect(() => {
    if (!user) return
    let active = true
    readPushState()
      .then(async (next) => {
        if (next === 'enabled') {
          try {
            await syncExistingSubscription(user)
          } catch {
            if (active) setState('prompt')
            return
          }
        }
        if (active) setState(next)
      })
      .catch(() => { if (active) setState('unsupported') })
    return () => { active = false }
  }, [user])

  const enable = useCallback(async () => {
    if (!user) return
    setBusy(true)
    try {
      await enablePush(user)
      localStorage.removeItem(dismissalKey(user.id))
      sessionStorage.removeItem(dismissalKey(user.id))
      setDismissalVersion((current) => current + 1)
      setState('enabled')
    } catch (error) {
      setState(await readPushState())
      throw error
    } finally {
      setBusy(false)
    }
  }, [user])

  const disable = useCallback(async () => {
    setBusy(true)
    try {
      await disablePush()
      setState(Notification.permission === 'denied' ? 'denied' : 'prompt')
    } finally {
      setBusy(false)
    }
  }, [])

  const dismiss = useCallback(() => {
    if (!user) return
    localStorage.setItem(dismissalKey(user.id), 'true')
    sessionStorage.removeItem(dismissalKey(user.id))
    setDismissalVersion((current) => current + 1)
  }, [user])

  return useMemo(() => ({
    state,
    busy,
    shouldPrompt: !dismissed && (state === 'prompt' || state === 'ios-install'),
    enable,
    disable,
    dismiss,
  }), [busy, dismiss, dismissed, disable, enable, state])
}

export function notificationStateLabel(state: PushNotificationState): string {
  if (state === 'enabled') return 'Attive'
  if (state === 'denied') return 'Bloccate'
  if (state === 'unsupported') return 'Non disponibili'
  if (state === 'ios-install') return 'Richiede app Home'
  if (state === 'loading') return 'Controllo…'
  return 'Da attivare'
}
