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
import type { MatchRatingResponse, PadelPoll } from '../src/types'
import { collectScheduledNotifications, createTestNotification } from '../src/lib/notificationSchedule'

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
const testNotificationMessage = process.env.TEST_NOTIFICATION_MESSAGE?.trim()
const testNotificationMode = process.env.TEST_NOTIFICATION_MODE?.trim() === 'pagelle'
  ? 'match-rating' as const
  : 'standard' as const
const origin = 'https://bandeja-boys.web.app'

if (!apiKey || !notifierEmail || !notifierPassword) throw new Error('Credenziali Firebase notifier mancanti.')
if (!publicKey || !privateKey) throw new Error('VAPID keys mancanti.')
if (testNotificationMessage && !testUserId) throw new Error('Un messaggio manuale richiede il destinatario.')
if (testNotificationMode === 'match-rating' && !testUserId) {
  throw new Error('Il collaudo pagelle richiede il destinatario.')
}

const app = initializeApp({ apiKey, authDomain: `${projectId}.firebaseapp.com`, projectId })
await signInWithEmailAndPassword(getAuth(app), notifierEmail, notifierPassword)
const db = getFirestore(app)
webpush.setVapidDetails(origin, publicKey, privateKey)

const [pollSnapshot, subscriptionSnapshot, ratingResponseSnapshot] = await Promise.all([
  getDocs(collection(db, 'polls')),
  getDocs(collection(db, 'pushSubscriptions')),
  getDocs(collection(db, 'matchRatingResponses')),
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
const notifications = testUserId
  ? [createTestNotification(
      testUserId,
      testNotificationId || String(Date.now()),
      testNotificationMessage,
      testNotificationMode,
    )]
  : collectScheduledNotifications(polls, Date.now(), ratingResponses)

let sent = 0
let skipped = 0
let removed = 0
let failed = 0

for (const notification of notifications) {
  for (const subscription of subscriptions) {
    const { userId } = subscription.data
    const included = notification.recipientUserIds === null || notification.recipientUserIds.includes(userId)
    if (!included || notification.excludedUserIds.includes(userId)) continue

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
        eventId: notification.id,
        kind: notification.kind,
        userId,
        subscriptionId: subscription.id,
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

console.log(`Notifiche: ${sent} inviate, ${skipped} già consegnate, ${removed} dispositivi rimossi, ${failed} errori.`)
await terminate(db)
await deleteApp(app)
if (failed > 0) process.exitCode = 1
