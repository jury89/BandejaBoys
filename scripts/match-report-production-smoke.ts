import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Firestore as AdminFirestore } from '@google-cloud/firestore'
import { initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
} from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  runTransaction,
  terminate,
  where,
} from 'firebase/firestore'

function readProductionConfig() {
  const values = Object.fromEntries(
    readFileSync('.env.production', 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  )

  return {
    apiKey: values.VITE_FIREBASE_API_KEY,
    authDomain: values.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: values.VITE_FIREBASE_PROJECT_ID,
    storageBucket: values.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: values.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: values.VITE_FIREBASE_APP_ID,
  }
}

const config = readProductionConfig()
const suffix = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
const email = `codex-match-report-${suffix}@example.test`
const password = `Bb-${randomUUID()}-9!`
const app = initializeApp(config, `match-report-smoke-${suffix}`)
const auth = getAuth(app)
const clientDb = getFirestore(app)
const adminDb = new AdminFirestore({ projectId: config.projectId })

let userId: string | undefined
let reportId: string | undefined
let stage = 'creazione utente'

try {
  const credential = await createUserWithEmailAndPassword(auth, email, password)
  userId = credential.user.uid

  stage = 'creazione profilo membro'
  await adminDb.doc(`users/${userId}`).set({
    id: userId,
    displayName: 'Codex QA',
    email,
    createdAt: Date.now(),
  })

  const pollId = `qa-poll-${suffix}`
  const slotId = `qa-slot-${suffix}`
  reportId = `${pollId}__${slotId}`
  const participants = [
    { userId, displayName: 'Codex QA' },
    { userId: `qa-a-${suffix}`, displayName: 'Player A' },
    { userId: `qa-b-${suffix}`, displayName: 'Player B' },
    { userId: `qa-c-${suffix}`, displayName: 'Player C' },
  ]
  const participantIds = participants.map((participant) => participant.userId)
  const createdAt = Date.now()
  const report = {
    id: reportId,
    pollId,
    pollTitle: 'Padel · collaudo produzione',
    slotId,
    sessionStartsAt: '2026-07-29T16:00:00.000Z',
    participantIds,
    participants,
    sets: Array.from({ length: 5 }, (_, index) => ({
      id: `set-${index + 1}`,
      teamA: [participants[0], participants[1]],
      teamB: [participants[2], participants[3]],
      scoreA: 6,
      scoreB: 4,
    })),
    createdBy: userId,
    createdByName: 'Codex QA',
    createdAt,
    updatedBy: userId,
    updatedByName: 'Codex QA',
    updatedAt: createdAt,
  }
  const reference = doc(clientDb, 'matchReports', reportId)

  stage = 'lettura del referto inesistente'
  const missing = await getDoc(reference)
  if (missing.exists()) throw new Error('Il referto temporaneo esiste già.')

  stage = 'transazione di creazione referto'
  await runTransaction(clientDb, async (transaction) => {
    const snapshot = await transaction.get(reference)
    if (snapshot.exists()) throw new Error('Il referto temporaneo esiste già.')
    transaction.set(reference, report)
  })

  stage = 'lettura referto'
  const created = await getDoc(reference)
  if (
    !created.exists()
    || created.data().sets.length !== 5
    || created.data().sets[0].scoreA !== 6
  ) {
    throw new Error('Il referto creato non è stato riletto correttamente.')
  }

  stage = 'query referti del partecipante'
  const result = await getDocs(query(
    collection(clientDb, 'matchReports'),
    where('participantIds', 'array-contains', userId),
  ))
  if (!result.docs.some((snapshot) => snapshot.id === reportId)) {
    throw new Error('La query non ha restituito il referto temporaneo.')
  }

  stage = 'transazione di modifica referto'
  await runTransaction(clientDb, async (transaction) => {
    const snapshot = await transaction.get(reference)
    if (!snapshot.exists()) throw new Error('Il referto temporaneo è scomparso.')
    transaction.set(reference, {
      ...snapshot.data(),
      participants: participants.map((participant, index) => (
        index === 0 ? { ...participant, displayName: 'Codex QA aggiornato' } : participant
      )),
      sets: report.sets.map((set, index) => ({
        ...set,
        ...(index === 0 ? {
          teamA: [
            { ...participants[0], displayName: 'Codex QA aggiornato' },
            participants[1],
          ],
          scoreA: 7,
          scoreB: 5,
        } : {}),
      })),
      updatedBy: userId,
      updatedByName: 'Codex QA aggiornato',
      updatedAt: Math.max(Date.now(), createdAt + 1),
    })
  })

  stage = 'verifica modifica'
  const updated = await getDoc(reference)
  if (
    !updated.exists()
    || updated.data().sets.length !== 5
    || updated.data().sets[0].scoreA !== 7
  ) {
    throw new Error('La modifica non è stata riletta correttamente.')
  }

  console.log('PASS: creazione, lettura, query e modifica del referto riuscite in produzione.')
} catch (error) {
  const code = typeof error === 'object' && error && 'code' in error
    ? String(error.code)
    : 'unknown'
  const message = error instanceof Error ? error.message : String(error)
  console.error(`FAIL allo stage "${stage}": ${code} — ${message}`)
  process.exitCode = 1
} finally {
  if (reportId) await adminDb.doc(`matchReports/${reportId}`).delete().catch(() => undefined)
  if (userId) await adminDb.doc(`users/${userId}`).delete().catch(() => undefined)
  if (auth.currentUser) await deleteUser(auth.currentUser).catch(() => undefined)
  await terminate(clientDb).catch(() => undefined)
  await adminDb.terminate()
}
