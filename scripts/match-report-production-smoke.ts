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
let pollId: string | undefined
let fantasyRoundId: string | undefined
let reportId: string | undefined
let responseId: string | undefined
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

  pollId = `qa-poll-${suffix}`
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

  stage = 'preparazione riallineamento atomico round fantasy'
  fantasyRoundId = `${pollId}__${slotId}`
  const locksAt = Date.now() + 24 * 60 * 60_000
  const slotStartsAt = new Date(locksAt).toISOString()
  const slotEndsAt = locksAt + 90 * 60_000
  const fantasyUpdatedAt = Date.now()
  const replacement = { userId: `qa-d-${suffix}`, displayName: 'Player D' }
  const replacementParticipants = [...participants.slice(0, 3), replacement]
  const replacementParticipantIds = replacementParticipants.map((participant) => participant.userId)
  const fantasyPoll = {
    id: pollId,
    createdBy: userId,
    createdByName: 'Codex QA',
    createdAt: fantasyUpdatedAt,
    updatedAt: fantasyUpdatedAt,
    status: 'open',
    slots: [{
      id: slotId,
      startsAt: slotStartsAt,
      durationMinutes: 90,
      venue: 'Oasi Boschetto',
      bookedAt: fantasyUpdatedAt,
      bookedBy: userId,
      bookedByName: 'Codex QA',
      signups: participants.map((participant, index) => ({
        id: `signup-${index}`,
        userId: participant.userId,
        displayName: participant.displayName,
        joinedAt: fantasyUpdatedAt + index,
        role: 'starter',
      })),
    }],
  }
  const fantasyRound = {
    id: fantasyRoundId,
    pollId,
    pollTitle: 'Padel · collaudo produzione',
    slotId,
    slotStartsAt,
    slotEndsAt,
    locksAt,
    settlesAt: slotEndsAt + 48 * 60 * 60_000,
    participantIds,
    participants,
    rosterKey: JSON.stringify(participantIds),
    status: 'open',
    createdAt: fantasyUpdatedAt,
    updatedAt: fantasyUpdatedAt,
  }
  await Promise.all([
    adminDb.doc(`polls/${pollId}`).set(fantasyPoll),
    adminDb.doc(`fantasyRounds/${fantasyRoundId}`).set(fantasyRound),
  ])

  stage = 'protezione del round fantasy senza modifica atomica dello slot'
  const fantasyRoundReference = doc(clientDb, 'fantasyRounds', fantasyRoundId)
  try {
    await runTransaction(clientDb, async (transaction) => {
      const roundSnapshot = await transaction.get(fantasyRoundReference)
      if (!roundSnapshot.exists()) throw new Error('Round fantasy temporaneo assente.')
      transaction.set(fantasyRoundReference, {
        ...roundSnapshot.data(),
        participantIds: replacementParticipantIds,
        participants: replacementParticipants,
        rosterKey: JSON.stringify(replacementParticipantIds),
        updatedAt: fantasyUpdatedAt + 1,
      })
    })
    throw new Error('Il round fantasy è stato modificato senza riallineare lo slot.')
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error
      ? String(error.code)
      : ''
    if (!code.includes('permission-denied')) throw error
  }

  stage = 'riallineamento atomico round fantasy'
  const pollReference = doc(clientDb, 'polls', pollId)
  const synchronizedAt = fantasyUpdatedAt + 1
  await runTransaction(clientDb, async (transaction) => {
    const [pollSnapshot, roundSnapshot] = await Promise.all([
      transaction.get(pollReference),
      transaction.get(fantasyRoundReference),
    ])
    if (!pollSnapshot.exists() || !roundSnapshot.exists()) {
      throw new Error('Poll o round fantasy temporaneo assente.')
    }
    const synchronizedSignups = replacementParticipants.map((participant, index) => ({
      id: `signup-${index}`,
      userId: participant.userId,
      displayName: participant.displayName,
      joinedAt: fantasyUpdatedAt + index,
      role: 'starter',
    }))
    transaction.update(pollReference, {
      slots: [{ ...pollSnapshot.data().slots[0], signups: synchronizedSignups }],
      updatedAt: synchronizedAt,
    })
    transaction.set(fantasyRoundReference, {
      ...roundSnapshot.data(),
      participantIds: replacementParticipantIds,
      participants: replacementParticipants,
      rosterKey: JSON.stringify(replacementParticipantIds),
      updatedAt: synchronizedAt,
    })
  })

  stage = 'verifica riallineamento atomico round fantasy'
  const synchronizedRound = await getDoc(fantasyRoundReference)
  if (
    !synchronizedRound.exists()
    || synchronizedRound.data().participantIds.join(',') !== replacementParticipantIds.join(',')
    || synchronizedRound.data().updatedAt !== synchronizedAt
  ) {
    throw new Error('Il round fantasy non è stato riallineato con lo slot.')
  }

  stage = 'creazione giudizio e risultato aggregato'
  responseId = `${pollId}__${slotId}__${userId}`
  summaryId = `${pollId}__${slotId}__${participants[1].userId}`
  const feedbackCreatedAt = Date.now()
  const feedbackBatch = writeBatch(clientDb)
  feedbackBatch.set(doc(clientDb, 'matchFeedbackResponses', responseId), {
    id: responseId,
    pollId,
    slotId,
    reviewerId: userId,
    status: 'submitted',
    ratings: [{
      playerId: participants[1].userId,
      playerName: participants[1].displayName,
      level: 4,
      scoreUnits: 15,
    }],
    closedAt: feedbackCreatedAt,
  })
  feedbackBatch.set(doc(clientDb, 'matchFeedbackSummaries', summaryId), {
    id: summaryId,
    pollId,
    slotId,
    playerId: participants[1].userId,
    scoreUnitsTotal: increment(15),
    ratingCount: increment(1),
    lastResponseId: responseId,
    updatedAt: feedbackCreatedAt,
  }, { merge: true })
  await feedbackBatch.commit()

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

  stage = 'lettura del giudizio aggregato'
  const sharedSummary = await getDoc(doc(clientDb, 'matchFeedbackSummaries', summaryId))
  if (
    !sharedSummary.exists()
    || sharedSummary.data().ratingCount !== 1
    || sharedSummary.data().scoreUnitsTotal !== 15
  ) {
    throw new Error('Il membro osservatore non vede il giudizio aggregato corretto.')
  }

  stage = 'protezione del giudizio individuale'
  try {
    await getDoc(doc(clientDb, 'matchFeedbackResponses', responseId))
    throw new Error('Il membro osservatore ha letto un giudizio individuale.')
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error
      ? String(error.code)
      : ''
    if (!code.includes('permission-denied')) throw error
  }

  console.log(
    'PASS: referto condiviso, round fantasy atomico e giudizi verificati in produzione.',
  )
} catch (error) {
  const code = typeof error === 'object' && error && 'code' in error
    ? String(error.code)
    : 'unknown'
  const message = error instanceof Error ? error.message : String(error)
  console.error(`FAIL allo stage "${stage}": ${code} — ${message}`)
  process.exitCode = 1
} finally {
  if (fantasyRoundId) {
    await adminDb.doc(`fantasyRounds/${fantasyRoundId}`).delete().catch(() => undefined)
  }
  if (pollId) await adminDb.doc(`polls/${pollId}`).delete().catch(() => undefined)
  if (reportId) await adminDb.doc(`matchReports/${reportId}`).delete().catch(() => undefined)
  if (summaryId) {
    await adminDb.doc(`matchFeedbackSummaries/${summaryId}`).delete().catch(() => undefined)
  }
  if (responseId) {
    await adminDb.doc(`matchFeedbackResponses/${responseId}`).delete().catch(() => undefined)
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
