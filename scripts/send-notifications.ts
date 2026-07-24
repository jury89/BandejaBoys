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
import type { MatchRatingResponse, MemberProfile, PadelPoll } from '../src/types'
import {
  MONDAY_MOTIVATIONAL_CATALOG_VERSION,
  normalizeMotherNamesByRecipient,
  resolveMotivationalCatalog,
} from '../src/lib/motivationalMessages'
import {
  collectPollDisplayNamesByUserId,
  collectScheduledNotifications,
  createNotificationDelivery,
  createTestNotification,
  isNotificationKindEnabled,
} from '../src/lib/notificationSchedule'

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
const testNotificationMode = process.env.TEST_NOTIFICATION_MODE?.trim() === 'pagelle'
  ? 'match-rating' as const
  : 'standard' as const
const motherNamesByRecipientJson = process.env.MOTHER_NAMES_BY_RECIPIENT_JSON?.trim()
const origin = 'https://bandeja-boys.web.app'

if (!apiKey || !notifierEmail || !notifierPassword) throw new Error('Credenziali Firebase notifier mancanti.')
if (!publicKey || !privateKey) throw new Error('VAPID keys mancanti.')
if (testNotificationMessage && !testUserId) throw new Error('Un messaggio manuale richiede il destinatario.')
if (testNotificationTitle && !testUserId) throw new Error('Un titolo manuale richiede il destinatario.')
if (testNotificationMode === 'match-rating' && !testUserId) {
  throw new Error('Il collaudo pagelle richiede il destinatario.')
}

let motherNamesByRecipient: Record<string, string> = {}
if (motherNamesByRecipientJson) {
  let parsedDirectory: unknown
  try {
    parsedDirectory = JSON.parse(motherNamesByRecipientJson)
  } catch {
    throw new Error('Il secret MOTHER_NAMES_BY_RECIPIENT_JSON non contiene JSON valido.')
  }
  motherNamesByRecipient = normalizeMotherNamesByRecipient(parsedDirectory)
  if (Object.keys(motherNamesByRecipient).length === 0) {
    throw new Error('Il secret MOTHER_NAMES_BY_RECIPIENT_JSON non contiene associazioni valide.')
  }
}

const app = initializeApp({ apiKey, authDomain: `${projectId}.firebaseapp.com`, projectId })
await signInWithEmailAndPassword(getAuth(app), notifierEmail, notifierPassword)
const db = getFirestore(app)
webpush.setVapidDetails(origin, publicKey, privateKey)

const motivationReference = doc(db, 'notificationContent', 'mondayMotivation')
const [
  pollSnapshot,
  subscriptionSnapshot,
  ratingResponseSnapshot,
  motivationSnapshot,
  userSnapshot,
] = await Promise.all([
  getDocs(collection(db, 'polls')),
  getDocs(collection(db, 'pushSubscriptions')),
  getDocs(collection(db, 'matchRatingResponses')),
  getDoc(motivationReference),
  getDocs(collection(db, 'users')),
])

const polls = pollSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PadelPoll)
const subscriptions = subscriptionSnapshot.docs.map((item) => ({
  id: item.id,
  reference: item.ref,
  data: item.data() as StoredPushSubscription,
}))
const ratingResponses = ratingResponseSnapshot.docs.map((item) => ({
  id: item.id,
  ...item.data(),
}) as MatchRatingResponse)
const notificationPreferencesByUserId = new Map(
  userSnapshot.docs.map((item) => [
    item.id,
    (item.data() as Partial<MemberProfile>).notificationPreferences,
  ]),
)
const storedMotivationData = motivationSnapshot.exists()
  ? motivationSnapshot.data()
  : undefined
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
const recipientDisplayNamesByUserId = collectPollDisplayNamesByUserId(polls)
const notifications = testUserId
  ? [createTestNotification(
      testUserId,
      testNotificationId || String(Date.now()),
      testNotificationMessage,
      testNotificationMode,
      testNotificationTitle,
    )]
  : collectScheduledNotifications(polls, Date.now(), ratingResponses, {
      messages: motivationalMessages,
      recipientUserIds: motivationRecipientUserIds,
      recipientDisplayNamesByUserId,
      motherNamesByRecipient,
    })

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
      }, JSON.stringify({
        title: notification.title,
        body: notification.body,
        url: notification.url,
        tag: notification.tag,
      }), {
        TTL: notification.ttlSeconds,
        urgency: notification.kind === 'slot-ready'
          || notification.kind === 'reminder-2h'
          || notification.kind === 'match-rating'
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
