import { createHash } from 'node:crypto'
import { deleteApp, initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  terminate,
} from 'firebase/firestore'
import webpush, { type PushSubscription } from 'web-push'
import type {
  FantasyEntry,
  FantasyRound,
  MatchFeedbackResponse,
  MatchFeedbackSummary,
  MatchReport,
  MemberProfile,
  PadelPoll,
} from '../src/types'
import { reconcileFantasyRounds } from '../src/lib/domain'
import {
  MONDAY_MOTIVATIONAL_CATALOG_VERSION,
  normalizeMotherNamesByUserId,
  resolveMotivationalCatalog,
} from '../src/lib/motivationalMessages'
import {
  collectScheduledNotifications,
  collectFantasyNotifications,
  createNotificationDelivery,
  createNotificationPushPayload,
  createTestNotification,
  isNotificationKindEnabled,
} from '../src/lib/notificationSchedule'
import {
  FANTASY_BANDEJA_WRITES_ENABLED,
  isProductNotificationEnabled,
  MATCH_FEEDBACK_ENABLED,
} from '../src/lib/productFeatures'

interface StoredPushSubscription extends PushSubscription {
  userId: string
  createdAt: number
  updatedAt: number
}

const projectId = process.env.FIREBASE_PROJECT_ID || 'bandeja-boys'
const apiKey = process.env.FIREBASE_API_KEY
const notifierEmail = process.env.FIREBASE_NOTIFIER_EMAIL
const notifierPassword = process.env.FIREBASE_NOTIFIER_PASSWORD
const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY
const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY
const testUserId = process.env.TEST_NOTIFICATION_USER_ID?.trim()
const testNotificationId = process.env.TEST_NOTIFICATION_ID?.trim()
const testNotificationTitle = process.env.TEST_NOTIFICATION_TITLE?.trim()
const testNotificationMessage = process.env.TEST_NOTIFICATION_MESSAGE?.trim()
const testNotificationUrl = process.env.TEST_NOTIFICATION_URL?.trim()
const testNotificationMode = ['feedback', 'mvp', 'pagelle'].includes(process.env.TEST_NOTIFICATION_MODE?.trim() ?? '')
  ? 'feedback' as const
  : 'standard' as const
const origin = 'https://bandeja-boys.web.app'

if (!apiKey || !notifierEmail || !notifierPassword) throw new Error('Credenziali Firebase notifier mancanti.')
if (!publicKey || !privateKey) throw new Error('VAPID keys mancanti.')
if (testNotificationMessage && !testUserId) throw new Error('Un messaggio manuale richiede il destinatario.')
if (testNotificationTitle && !testUserId) throw new Error('Un titolo manuale richiede il destinatario.')
if (testNotificationUrl && !testUserId) throw new Error('Un link manuale richiede il destinatario.')
if (testNotificationMode === 'feedback' && !testUserId) {
  throw new Error('Il collaudo dei giudizi richiede il destinatario.')
}
if (testNotificationMode === 'feedback' && !MATCH_FEEDBACK_ENABLED) {
  throw new Error('I giudizi post partita sono disattivati.')
}

const app = initializeApp({ apiKey, authDomain: `${projectId}.firebaseapp.com`, projectId })
await signInWithEmailAndPassword(getAuth(app), notifierEmail, notifierPassword)
const db = getFirestore(app)
webpush.setVapidDetails(origin, publicKey, privateKey)

const motivationReference = doc(db, 'notificationContent', 'mondayMotivation')
const motherNamesReference = doc(db, 'notificationContent', 'motherNames')
const [
  pollSnapshot,
  subscriptionSnapshot,
  feedbackResponseSnapshot,
  legacyMvpResponseSnapshot,
  legacyRatingResponseSnapshot,
  motivationSnapshot,
  motherNamesSnapshot,
  userSnapshot,
  fantasyRoundSnapshot,
  feedbackSummarySnapshot,
  matchReportSnapshot,
] = await Promise.all([
  getDocs(collection(db, 'polls')),
  getDocs(collection(db, 'pushSubscriptions')),
  getDocs(collection(db, 'matchFeedbackResponses')),
  getDocs(collection(db, 'matchMvpResponses')),
  getDocs(collection(db, 'matchRatingResponses')),
  getDoc(motivationReference),
  getDoc(motherNamesReference),
  getDocs(collection(db, 'users')),
  getDocs(collection(db, 'fantasyRounds')),
  getDocs(collection(db, 'matchFeedbackSummaries')),
  getDocs(collection(db, 'matchReports')),
])

const polls = pollSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PadelPoll)
const subscriptions = subscriptionSnapshot.docs.map((item) => ({
  id: item.id,
  reference: item.ref,
  data: item.data() as StoredPushSubscription,
}))
const currentFeedbackResponses = feedbackResponseSnapshot.docs.map((item) => ({
  id: item.id,
  ...item.data(),
}) as MatchFeedbackResponse)
const currentFeedbackResponseIds = new Set(currentFeedbackResponses.map((response) => response.id))
const legacyMvpClosedResponses = legacyMvpResponseSnapshot.docs.map((item) => {
  const data = item.data() as {
    pollId: string
    slotId: string
    voterId: string
    status: MatchFeedbackResponse['status']
    closedAt: number
  }
  return {
    id: item.id,
    pollId: data.pollId,
    slotId: data.slotId,
    reviewerId: data.voterId,
    status: data.status,
    closedAt: data.closedAt,
  } satisfies MatchFeedbackResponse
})
const legacyRatingClosedResponses = legacyRatingResponseSnapshot.docs.map((item) => {
    const data = item.data() as {
      pollId: string
      slotId: string
      reviewerId: string
      status: MatchFeedbackResponse['status']
      closedAt: number
    }
    return {
      id: item.id,
      pollId: data.pollId,
      slotId: data.slotId,
      reviewerId: data.reviewerId,
      status: data.status,
      closedAt: data.closedAt,
    } satisfies MatchFeedbackResponse
  })
const feedbackResponses = [
  ...[...legacyMvpClosedResponses, ...legacyRatingClosedResponses]
    .filter((response) => !currentFeedbackResponseIds.has(response.id)),
  ...currentFeedbackResponses,
]
const existingFantasyRounds = fantasyRoundSnapshot.docs.map((item) => ({
  id: item.id,
  ...item.data(),
}) as FantasyRound)
const fantasyEntries = (await Promise.all(existingFantasyRounds.map(async (round) => {
  const snapshot = await getDocs(collection(db, 'fantasyRounds', round.id, 'entries'))
  return snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  }) as FantasyEntry)
}))).flat()
const feedbackSummaries = feedbackSummarySnapshot.docs.map((item) => ({
  id: item.id,
  ...item.data(),
}) as MatchFeedbackSummary)
const matchReports = matchReportSnapshot.docs.map((item) => ({
  id: item.id,
  ...item.data(),
}) as MatchReport)
const notificationPreferencesByUserId = new Map(
  userSnapshot.docs.map((item) => [
    item.id,
    (item.data() as Partial<MemberProfile>).notificationPreferences,
  ]),
)
const storedMotivationData = motivationSnapshot.exists()
  ? motivationSnapshot.data()
  : undefined
const motherNamesByUserId = normalizeMotherNamesByUserId(
  motherNamesSnapshot.exists()
    ? motherNamesSnapshot.data().namesByUserId
    : undefined,
)
const {
  messages: motivationalMessages,
  needsWrite: motivationNeedsWrite,
} = resolveMotivationalCatalog(storedMotivationData)
if (motivationalMessages.length === 0) {
  throw new Error('Il documento notificationContent/mondayMotivation non contiene frasi valide.')
}
if (motivationNeedsWrite) {
  await setDoc(motivationReference, {
    messages: motivationalMessages,
    catalogVersion: MONDAY_MOTIVATIONAL_CATALOG_VERSION,
    createdAt: storedMotivationData?.createdAt ?? serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}
const motivationRecipientUserIds = Array.from(new Set(
  subscriptions.map((subscription) => subscription.data.userId),
))
const now = Date.now()
const fantasyRounds = FANTASY_BANDEJA_WRITES_ENABLED
  ? reconcileFantasyRounds(
      polls,
      existingFantasyRounds,
      fantasyEntries,
      feedbackSummaries,
      feedbackResponses,
      matchReports,
      now,
    )
  : existingFantasyRounds
const existingFantasyRoundsById = new Map(
  existingFantasyRounds.map((round) => [round.id, round]),
)
if (FANTASY_BANDEJA_WRITES_ENABLED) {
  await Promise.all(fantasyRounds.map(async (round) => {
    const existing = existingFantasyRoundsById.get(round.id)
    if (existing && JSON.stringify(existing) === JSON.stringify(round)) return
    await setDoc(doc(db, 'fantasyRounds', round.id), round)
  }))
}
const notifications = testUserId
  ? [createTestNotification(
      testUserId,
      testNotificationId || String(Date.now()),
      testNotificationMessage,
      testNotificationMode,
      testNotificationTitle,
      testNotificationUrl,
    )]
  : [
      ...collectScheduledNotifications(polls, now, feedbackResponses, {
        messages: motivationalMessages,
        recipientUserIds: motivationRecipientUserIds,
        motherNamesByUserId,
      }),
      ...(FANTASY_BANDEJA_WRITES_ENABLED
        ? collectFantasyNotifications(fantasyRounds, fantasyEntries, now)
        : []),
    ].filter((notification) => isProductNotificationEnabled(notification.kind))

let sent = 0
let skipped = 0
let disabled = 0
let removed = 0
let failed = 0

for (const notification of notifications) {
  for (const subscription of subscriptions) {
    const { userId } = subscription.data
    const included = notification.recipientUserIds === null || notification.recipientUserIds.includes(userId)
    if (!included || notification.excludedUserIds.includes(userId)) continue
    if (!isNotificationKindEnabled(
      notification.kind,
      notificationPreferencesByUserId.get(userId),
    )) {
      disabled += 1
      continue
    }

    const deliveryId = createHash('sha256')
      .update(`${notification.id}:${userId}:${subscription.id}`)
      .digest('hex')
    const deliveryReference = doc(db, 'notificationDeliveries', deliveryId)
    if ((await getDoc(deliveryReference)).exists()) {
      skipped += 1
      continue
    }

    try {
      await webpush.sendNotification({
        endpoint: subscription.data.endpoint,
        expirationTime: subscription.data.expirationTime,
        keys: subscription.data.keys,
      }, JSON.stringify(createNotificationPushPayload(notification)), {
        TTL: notification.ttlSeconds,
        urgency: notification.kind === 'slot-ready'
          || notification.kind === 'reminder-2h'
          || notification.kind === 'match-mvp'
          ? 'high'
          : 'normal',
      })
      await setDoc(deliveryReference, {
        ...createNotificationDelivery(notification, userId, subscription.id),
        sentAt: serverTimestamp(),
      })
      sent += 1
    } catch (error) {
      const statusCode = typeof error === 'object' && error && 'statusCode' in error
        ? Number(error.statusCode)
        : 0
      if (statusCode === 404 || statusCode === 410) {
        await deleteDoc(subscription.reference)
        removed += 1
      } else {
        failed += 1
        console.error(`Invio fallito per ${notification.kind} (${statusCode || 'errore sconosciuto'}).`)
      }
    }
  }
}

console.log(`Notifiche: ${sent} inviate, ${skipped} già consegnate, ${disabled} disattivate, ${removed} dispositivi rimossi, ${failed} errori.`)
await terminate(db)
await deleteApp(app)
if (failed > 0) process.exitCode = 1
