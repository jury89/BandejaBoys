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
  query,
  serverTimestamp,
  setDoc,
  terminate,
  where,
} from 'firebase/firestore'
import webpush, { type PushSubscription } from 'web-push'
import type {
  FantasyRound,
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
  isMondayMotivationWindow,
} from '../src/lib/notificationSchedule'
import { loadNotificationMatchData, type NotificationDataReader } from './notification-data'

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

const app = initializeApp({ apiKey, authDomain: `${projectId}.firebaseapp.com`, projectId })
await signInWithEmailAndPassword(getAuth(app), notifierEmail, notifierPassword)
const db = getFirestore(app)
webpush.setVapidDetails(origin, publicKey, privateKey)

const now = Date.now()
const readCounts = new Map<string, number>()
const countReads = (path: string, count: number) => {
  const name = path.split('/')[0]
  readCounts.set(name, (readCounts.get(name) ?? 0) + Math.max(1, count))
}
const reader: NotificationDataReader = {
  async list<T>(path: string, filter?: { field: string; values: string[] }): Promise<T[]> {
    const reference = collection(db, path)
    const snapshot = await getDocs(filter
      ? query(reference, where(filter.field, 'in', filter.values))
      : reference)
    countReads(path, snapshot.size)
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as T)
  },
}
const [subscriptionRows, users, polls, existingFantasyRounds] = await Promise.all([
  reader.list<StoredPushSubscription & { id: string }>('pushSubscriptions', testUserId
    ? { field: 'userId', values: [testUserId] } : undefined),
  testUserId
    ? getDoc(doc(db, 'users', testUserId)).then((snapshot) => {
        countReads('users', 1)
        return snapshot.exists() ? [{ id: snapshot.id, ...snapshot.data() } as MemberProfile] : []
      })
    : reader.list<MemberProfile>('users'),
  testUserId ? Promise.resolve([] as PadelPoll[]) : reader.list<PadelPoll>('polls'),
  testUserId ? Promise.resolve([] as FantasyRound[]) : reader.list<FantasyRound>('fantasyRounds'),
])
const subscriptions = subscriptionRows.map((data) => ({
  id: data.id,
  reference: doc(db, 'pushSubscriptions', data.id),
  data,
}))
const { feedbackResponses, feedbackSummaries, matchReports, fantasyEntries } = testUserId
  ? { feedbackResponses: [], feedbackSummaries: [], matchReports: [], fantasyEntries: [] }
  : await loadNotificationMatchData(reader, polls, existingFantasyRounds, now)
const notificationPreferencesByUserId = new Map(
  users.map((user) => [user.id, user.notificationPreferences]),
)
let motivationalMessages: string[] = []
let motherNamesByUserId = normalizeMotherNamesByUserId(undefined)
if (!testUserId && isMondayMotivationWindow(now)) {
  const motivationReference = doc(db, 'notificationContent', 'mondayMotivation')
  const [motivationSnapshot, motherNamesSnapshot] = await Promise.all([
    getDoc(motivationReference),
    getDoc(doc(db, 'notificationContent', 'motherNames')),
  ])
  countReads('notificationContent', 2)
  const storedMotivationData = motivationSnapshot.exists() ? motivationSnapshot.data() : undefined
  motherNamesByUserId = normalizeMotherNamesByUserId(motherNamesSnapshot.data()?.namesByUserId)
  const catalog = resolveMotivationalCatalog(storedMotivationData)
  motivationalMessages = catalog.messages
  if (motivationalMessages.length === 0) {
    throw new Error('Il documento notificationContent/mondayMotivation non contiene frasi valide.')
  }
  if (catalog.needsWrite) {
    await setDoc(motivationReference, {
      messages: motivationalMessages,
      catalogVersion: MONDAY_MOTIVATIONAL_CATALOG_VERSION,
      createdAt: storedMotivationData?.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }
}
const motivationRecipientUserIds = Array.from(new Set(
  subscriptions.map((subscription) => subscription.data.userId),
))
const fantasyRounds = reconcileFantasyRounds(
  polls,
  existingFantasyRounds,
  fantasyEntries,
  feedbackSummaries,
  feedbackResponses,
  matchReports,
  now,
)
const existingFantasyRoundsById = new Map(
  existingFantasyRounds.map((round) => [round.id, round]),
)
await Promise.all(fantasyRounds.map(async (round) => {
  const existing = existingFantasyRoundsById.get(round.id)
  if (existing && JSON.stringify(existing) === JSON.stringify(round)) return
  await setDoc(doc(db, 'fantasyRounds', round.id), round)
}))
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
      ...collectFantasyNotifications(fantasyRounds, fantasyEntries, now),
    ]

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
    countReads('notificationDeliveries', 1)
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
console.log(`Letture documenti (stima minima, escluse regole e indici): ${[...readCounts.values()].reduce((sum, count) => sum + count, 0)}; ${JSON.stringify(Object.fromEntries(readCounts))}`)
await terminate(db)
await deleteApp(app)
if (failed > 0) process.exitCode = 1
