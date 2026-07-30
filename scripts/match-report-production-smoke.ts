import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Firestore as AdminFirestore } from '@google-cloud/firestore'
import { initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  increment,
  query,
  runTransaction,
  terminate,
  where,
  writeBatch,
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
const observerEmail = `codex-group-match-${suffix}@example.test`
const observerPassword = `Bb-${randomUUID()}-9!`
const app = initializeApp(config, `match-report-smoke-${suffix}`)
const auth = getAuth(app)
const clientDb = getFirestore(app)
const adminDb = new AdminFirestore({ projectId: config.projectId })

let userId: string | undefined
let observerUserId: string | undefined
let reportId: string | undefined
let responseId: string | undefined
let ratingId: string | undefined
let summaryId: string | undefined
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

  stage = 'creazione voto e media aggregata'
  responseId = `${pollId}__${slotId}__${userId}`
  ratingId = `${responseId}__${participants[1].userId}`
  summaryId = `${pollId}__${slotId}__${participants[1].userId}`
  const ratingCreatedAt = Date.now()
  const ratingBatch = writeBatch(clientDb)
  ratingBatch.set(doc(clientDb, 'matchRatings', ratingId), {
    id: ratingId,
    responseId,
    pollId,
    pollTitle: report.pollTitle,
    slotId,
    sessionStartsAt: report.sessionStartsAt,
    sessionEndedAt: ratingCreatedAt,
    reviewerId: userId,
    reviewerName: 'Codex QA',
    revieweeId: participants[1].userId,
    revieweeName: participants[1].displayName,
    score: 8,
    createdAt: ratingCreatedAt,
  })
  ratingBatch.set(doc(clientDb, 'matchRatingSummaries', summaryId), {
    id: summaryId,
    pollId,
    slotId,
    revieweeId: participants[1].userId,
    scoreTotal: increment(8),
    ratingCount: increment(1),
    lastRatingId: ratingId,
    updatedAt: ratingCreatedAt,
  }, { merge: true })
  ratingBatch.set(doc(clientDb, 'matchRatingResponses', responseId), {
    id: responseId,
    pollId,
    slotId,
    reviewerId: userId,
    status: 'submitted',
    closedAt: ratingCreatedAt,
  })
  await ratingBatch.commit()

  stage = 'creazione membro osservatore'
  const observerCredential = await createUserWithEmailAndPassword(
    auth,
    observerEmail,
    observerPassword,
  )
  observerUserId = observerCredential.user.uid
  await adminDb.doc(`users/${observerUserId}`).set({
    id: observerUserId,
    displayName: 'Codex Observer',
    email: observerEmail,
    createdAt: Date.now(),
  })

  stage = 'lettura condivisa del referto'
  const sharedReports = await getDocs(collection(clientDb, 'matchReports'))
  if (!sharedReports.docs.some((snapshot) => snapshot.id === reportId)) {
    throw new Error('Il membro osservatore non vede il referto condiviso.')
  }

  stage = 'lettura della media aggregata'
  const sharedSummary = await getDoc(doc(clientDb, 'matchRatingSummaries', summaryId))
  if (
    !sharedSummary.exists()
    || sharedSummary.data().scoreTotal !== 8
    || sharedSummary.data().ratingCount !== 1
  ) {
    throw new Error('Il membro osservatore non vede la media aggregata corretta.')
  }

  stage = 'protezione del voto individuale'
  try {
    await getDoc(doc(clientDb, 'matchRatings', ratingId))
    throw new Error('Il membro osservatore ha letto un voto individuale.')
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error
      ? String(error.code)
      : ''
    if (!code.includes('permission-denied')) throw error
  }

  console.log(
    'PASS: referto condiviso, media aggregata e riservatezza dei voti verificati in produzione.',
  )
} catch (error) {
  const code = typeof error === 'object' && error && 'code' in error
    ? String(error.code)
    : 'unknown'
  const message = error instanceof Error ? error.message : String(error)
  console.error(`FAIL allo stage "${stage}": ${code} — ${message}`)
  process.exitCode = 1
} finally {
  if (reportId) await adminDb.doc(`matchReports/${reportId}`).delete().catch(() => undefined)
  if (summaryId) {
    await adminDb.doc(`matchRatingSummaries/${summaryId}`).delete().catch(() => undefined)
  }
  if (ratingId) await adminDb.doc(`matchRatings/${ratingId}`).delete().catch(() => undefined)
  if (responseId) {
    await adminDb.doc(`matchRatingResponses/${responseId}`).delete().catch(() => undefined)
  }
  if (userId) await adminDb.doc(`users/${userId}`).delete().catch(() => undefined)
  if (observerUserId) {
    await adminDb.doc(`users/${observerUserId}`).delete().catch(() => undefined)
  }
  await signInWithEmailAndPassword(auth, observerEmail, observerPassword)
    .then((credential) => deleteUser(credential.user))
    .catch(() => undefined)
  await signInWithEmailAndPassword(auth, email, password)
    .then((credential) => deleteUser(credential.user))
    .catch(() => undefined)
  await terminate(clientDb).catch(() => undefined)
  await adminDb.terminate()
}
