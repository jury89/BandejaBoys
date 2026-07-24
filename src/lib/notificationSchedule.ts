import type {
  MatchRatingResponse,
  NotificationPreferences,
  PadelPoll,
  PadelSlot,
} from '../types'
import {
  DEFAULT_VENUE,
  MATCH_RATING_DELAY_MS,
  MAX_STARTERS,
  getMatchRatingDueAt,
  getMatchRatingResponseId,
  getStarters,
  padelDateTimeToTimestamp,
} from './domain'
import { pollWeekTitle } from './format'
import {
  type MotherNamesByRecipient,
  personalizeMotivationalMessage,
} from './motivationalMessages'
import { normalizeNotificationPreferences } from './notificationPreferences'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
export const NEW_SLOT_NOTIFICATION_WINDOW_MS = HOUR_MS
export const NEW_SLOT_QUIET_PERIOD_MS = 10 * 60 * 1000
export const SLOT_READY_NOTIFICATION_WINDOW_MS = DAY_MS
export const BOOKING_REMINDER_LEAD_MS = 7 * DAY_MS
export const BOOKING_REMINDER_WINDOW_MS = DAY_MS
export const MATCH_RATING_NOTIFICATION_WINDOW_MS = 30 * 60 * 1000
export const MONDAY_MOTIVATION_WINDOW_MS = HOUR_MS

export type NotificationKind = 'new-slots' | 'slot-ready' | 'booking-reminder-7d' | 'reminder-24h' | 'reminder-2h' | 'match-rating' | 'monday-motivation' | 'test'
export type TestNotificationMode = 'standard' | 'match-rating'

const NOTIFICATION_PREFERENCE_BY_KIND = {
  'new-slots': 'newSlots',
  'slot-ready': 'slotReady',
  'booking-reminder-7d': 'bookingReminder7d',
  'reminder-24h': 'reminder24h',
  'reminder-2h': 'reminder2h',
  'match-rating': 'matchRating',
  'monday-motivation': 'mondayMotivation',
} as const satisfies Record<Exclude<NotificationKind, 'test'>, keyof NotificationPreferences>

export function isNotificationKindEnabled(
  kind: NotificationKind,
  preferences?: Partial<NotificationPreferences>,
): boolean {
  if (kind === 'test') return true
  return normalizeNotificationPreferences(preferences)[NOTIFICATION_PREFERENCE_BY_KIND[kind]]
}

export interface MondayMotivationSchedule {
  messages: readonly string[]
  recipientUserIds: readonly string[]
  recipientDisplayNamesByUserId?: Readonly<Record<string, string>>
  motherNamesByRecipient?: MotherNamesByRecipient
}

export interface ScheduledNotification {
  id: string
  kind: NotificationKind
  title: string
  body: string
  url: string
  tag: string
  ttlSeconds: number
  recipientUserIds: string[] | null
  excludedUserIds: string[]
}

export interface NotificationDeliveryData {
  eventId: string
  kind: NotificationKind
  title: string
  body: string
  userId: string
  subscriptionId: string
}

export function createNotificationDelivery(
  notification: ScheduledNotification,
  userId: string,
  subscriptionId: string,
): NotificationDeliveryData {
  return {
    eventId: notification.id,
    kind: notification.kind,
    title: notification.title,
    body: notification.body,
    userId,
    subscriptionId,
  }
}

function formatSession(startsAt: string): string {
  const formatted = new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Rome',
  }).format(new Date(padelDateTimeToTimestamp(startsAt)))
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

function groupNewSlots(slots: PadelSlot[]): PadelSlot[][] {
  const ordered = [...slots].sort((left, right) => {
    const timeDifference = (left.createdAt ?? 0) - (right.createdAt ?? 0)
    return timeDifference || left.id.localeCompare(right.id)
  })

  return ordered.reduce<PadelSlot[][]>((groups, slot) => {
    const current = groups.at(-1)
    const previous = current?.at(-1)
    if (!current || !previous || (slot.createdAt ?? 0) - (previous.createdAt ?? 0) > NEW_SLOT_QUIET_PERIOD_MS) {
      groups.push([slot])
    } else {
      current.push(slot)
    }
    return groups
  }, [])
}

function collectNewSlotNotifications(poll: PadelPoll, now: number): ScheduledNotification[] {
  if (poll.status !== 'open') return []

  const groups = groupNewSlots(poll.slots.filter((slot) => {
    const createdAt = slot.createdAt
    const startsAt = padelDateTimeToTimestamp(slot.startsAt)
    return typeof createdAt === 'number'
      && Number.isFinite(createdAt)
      && createdAt <= now
      && Number.isFinite(startsAt)
      && startsAt > now
  }))

  return groups.flatMap((group) => {
    const latestCreatedAt = Math.max(...group.map((slot) => slot.createdAt ?? 0))
    if (now - latestCreatedAt > NEW_SLOT_NOTIFICATION_WINDOW_MS) return []
    if (now - latestCreatedAt < NEW_SLOT_QUIET_PERIOD_MS) return []

    const first = group[0]
    const excludedUserIds = Array.from(new Set(
      group.map((slot) => slot.createdBy).filter((userId): userId is string => Boolean(userId)),
    ))
    const body = group.length === 1
      ? `C’è un nuovo slot disponibile: ${formatSession(first.startsAt)}. Segna se ci sei.`
      : `Ci sono ${group.length} nuovi slot disponibili per “${pollWeekTitle(poll.targetWeekStart)}”. Segna quando ci sei.`

    return [{
      id: `new-slots:${poll.id}:${first.id}`,
      kind: 'new-slots' as const,
      title: 'Sveglia fagianotto!',
      body,
      url: `/?poll=${encodeURIComponent(poll.id)}`,
      tag: `new-slots-${poll.id}-${first.id}`,
      ttlSeconds: 24 * 60 * 60,
      recipientUserIds: null,
      excludedUserIds,
    }]
  })
}

function romeDateTimeParts(now: number): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Europe/Rome',
  }).formatToParts(new Date(now)).map(({ type, value }) => [type, value]))
}

export function isMondayMotivationWindow(now = Date.now()): boolean {
  const parts = romeDateTimeParts(now)
  const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute)
  return parts.weekday === 'Mon'
    && minuteOfDay >= 8 * 60 + 30
    && minuteOfDay < 8 * 60 + 30 + MONDAY_MOTIVATION_WINDOW_MS / 60_000
}

function stableMessageIndex(seed: string, messageCount: number): number {
  let hash = 2_166_136_261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0) % messageCount
}

export function collectPollDisplayNamesByUserId(
  polls: readonly PadelPoll[],
): Record<string, string> {
  const names = new Map<string, { displayName: string; observedAt: number; order: number }>()
  let order = 0

  const remember = (
    userIdValue: string | undefined,
    displayNameValue: string | undefined,
    observedAtValue: number | undefined,
  ) => {
    const userId = userIdValue?.trim()
    const displayName = displayNameValue?.trim().replace(/\s+/g, ' ')
    if (!userId || !displayName) return

    const observedAt = typeof observedAtValue === 'number' && Number.isFinite(observedAtValue)
      ? observedAtValue
      : 0
    order += 1
    const current = names.get(userId)
    if (
      !current
      || observedAt > current.observedAt
      || (observedAt === current.observedAt && order > current.order)
    ) {
      names.set(userId, { displayName, observedAt, order })
    }
  }

  for (const poll of polls) {
    remember(poll.createdBy, poll.createdByName, poll.createdAt)

    for (const slot of poll.slots) {
      remember(slot.createdBy, slot.createdByName, slot.createdAt ?? poll.createdAt)
      remember(slot.bookedBy, slot.bookedByName, slot.bookedAt ?? slot.createdAt ?? poll.updatedAt)

      for (const signup of slot.signups) {
        remember(signup.userId, signup.displayName, signup.joinedAt)
        remember(
          signup.substitutedFor?.userId,
          signup.substitutedFor?.displayName,
          signup.substitutedFor?.at,
        )
      }
    }
  }

  return Object.fromEntries(Array.from(names, ([userId, value]) => [userId, value.displayName]))
}

function collectMondayMotivationNotifications(
  now: number,
  schedule?: MondayMotivationSchedule,
): ScheduledNotification[] {
  if (!schedule || !isMondayMotivationWindow(now)) return []

  const messages = Array.from(new Set(schedule.messages.map((message) => message.trim()).filter(Boolean)))
  const recipientUserIds = Array.from(new Set(
    schedule.recipientUserIds.map((userId) => userId.trim()).filter(Boolean),
  )).sort()
  if (messages.length === 0 || recipientUserIds.length === 0) return []

  const parts = romeDateTimeParts(now)
  const mondayKey = `${parts.year}-${parts.month}-${parts.day}`

  return recipientUserIds.map((userId) => {
    const message = messages[stableMessageIndex(`${mondayKey}:${userId}`, messages.length)]
    return {
      id: `monday-motivation:${mondayKey}`,
      kind: 'monday-motivation',
      title: 'Buon lunedì, bestia!',
      body: personalizeMotivationalMessage(
        message,
        schedule.recipientDisplayNamesByUserId?.[userId],
        schedule.motherNamesByRecipient,
      ),
      url: '/',
      tag: `monday-motivation-${mondayKey}`,
      ttlSeconds: 12 * 60 * 60,
      recipientUserIds: [userId],
      excludedUserIds: [],
    }
  })
}

export function createTestNotification(
  userId: string,
  eventId: string,
  message?: string,
  mode: TestNotificationMode = 'standard',
  title?: string,
): ScheduledNotification {
  const recipient = userId.trim()
  const identifier = eventId.trim()
  const customBody = message?.trim()
  const customTitle = title?.trim()
  if (!recipient || !identifier) throw new Error('Destinatario o identificativo del test mancante.')
  if (customBody && customBody.length > 240) throw new Error('Il messaggio di test supera i 240 caratteri.')
  if (customTitle && customTitle.length > 80) throw new Error('Il titolo del test supera gli 80 caratteri.')

  const isMatchRatingTest = mode === 'match-rating'
  const refreshParameter = `_pushRefresh=${encodeURIComponent(identifier)}`

  return {
    id: `test:${identifier}`,
    kind: 'test',
    title: isMatchRatingTest
      ? 'TEST · È ora di dare i voti'
      : customTitle || (customBody ? 'Bandeja Boys' : 'Test notifiche Bandeja Boys'),
    body: customBody || (isMatchRatingTest
      ? 'Tocca per aprire la pagella di collaudo. Nessun voto verrà salvato.'
      : 'Se leggi questo messaggio, le notifiche funzionano correttamente.'),
    url: isMatchRatingTest
      ? `/?ratingTest=1&${refreshParameter}`
      : `/?${refreshParameter}`,
    tag: `${isMatchRatingTest ? 'test-rating' : 'test'}-${identifier}`,
    ttlSeconds: 10 * 60,
    recipientUserIds: [recipient],
    excludedUserIds: [],
  }
}

export function collectScheduledNotifications(
  polls: PadelPoll[],
  now = Date.now(),
  ratingResponses: MatchRatingResponse[] = [],
  mondayMotivation?: MondayMotivationSchedule,
): ScheduledNotification[] {
  const notifications = collectMondayMotivationNotifications(now, mondayMotivation)
  const closedRatingPromptIds = new Set(ratingResponses.map((response) => response.id))

  for (const poll of polls) {
    notifications.push(...collectNewSlotNotifications(poll, now))

    for (const slot of poll.slots) {
      const startsAt = padelDateTimeToTimestamp(slot.startsAt)
      const starters = getStarters(slot)
      const recipientUserIds = Array.from(new Set(starters.map((signup) => signup.userId)))
      const completedAt = starters.length === MAX_STARTERS && recipientUserIds.length === MAX_STARTERS
        ? starters[MAX_STARTERS - 1].joinedAt
        : undefined

      if (
        !slot.bookedAt
        && Number.isFinite(startsAt)
        && startsAt > now
        && typeof completedAt === 'number'
        && Number.isFinite(completedAt)
      ) {
        if (
          completedAt <= now
          && now < completedAt + SLOT_READY_NOTIFICATION_WINDOW_MS
        ) {
          notifications.push({
            id: `slot-ready:${poll.id}:${slot.id}:${completedAt}`,
            kind: 'slot-ready',
            title: 'Slot completo!',
            body: `Siete in quattro per ${formatSession(slot.startsAt)}. Il campo è ancora da prenotare: potete procedere.`,
            url: `/?poll=${encodeURIComponent(poll.id)}`,
            tag: `slot-ready-${poll.id}-${slot.id}`,
            ttlSeconds: Math.max(60, Math.floor(
              (completedAt + SLOT_READY_NOTIFICATION_WINDOW_MS - now) / 1000,
            )),
            recipientUserIds,
            excludedUserIds: [],
          })
        }

        const bookingReminderAt = startsAt - BOOKING_REMINDER_LEAD_MS
        if (
          completedAt < bookingReminderAt
          && now >= bookingReminderAt
          && now < bookingReminderAt + BOOKING_REMINDER_WINDOW_MS
        ) {
          notifications.push({
            id: `booking-reminder-7d:${poll.id}:${slot.id}:${slot.startsAt}`,
            kind: 'booking-reminder-7d',
            title: 'Manca solo una settimana!',
            body: `Siete in quattro per ${formatSession(slot.startsAt)}. Ricordatevi di prenotare il campo.`,
            url: `/?poll=${encodeURIComponent(poll.id)}`,
            tag: `booking-reminder-7d-${poll.id}-${slot.id}`,
            ttlSeconds: Math.max(60, Math.floor(
              (bookingReminderAt + BOOKING_REMINDER_WINDOW_MS - now) / 1000,
            )),
            recipientUserIds,
            excludedUserIds: [],
          })
        }
      }

      if (!slot.bookedAt) continue
      const pendingRatingRecipientUserIds = recipientUserIds.filter((userId) => !closedRatingPromptIds.has(
        getMatchRatingResponseId(poll.id, slot.id, userId),
      ))
      const ratingDueAt = getMatchRatingDueAt(slot)

      if (
        starters.length === MAX_STARTERS
        && pendingRatingRecipientUserIds.length > 0
        && now >= ratingDueAt
        && now < ratingDueAt + MATCH_RATING_NOTIFICATION_WINDOW_MS
      ) {
        notifications.push({
          id: `match-rating:${poll.id}:${slot.id}:${slot.startsAt}`,
          kind: 'match-rating',
          title: 'È ora di dare i voti',
          body: 'Com’è andata in campo? Valuta la prestazione dei tuoi tre compagni.',
          url: `/?ratePoll=${encodeURIComponent(poll.id)}&rateSlot=${encodeURIComponent(slot.id)}`,
          tag: `match-rating-${poll.id}-${slot.id}`,
          ttlSeconds: Math.floor((MATCH_RATING_NOTIFICATION_WINDOW_MS + MATCH_RATING_DELAY_MS) / 1000),
          recipientUserIds: pendingRatingRecipientUserIds,
          excludedUserIds: [],
        })
      }

      const remaining = startsAt - now
      if (!Number.isFinite(startsAt) || remaining <= 0 || remaining > 24 * HOUR_MS) continue

      if (recipientUserIds.length === 0) continue

      const isTwoHourReminder = remaining <= 2 * HOUR_MS
      const kind: NotificationKind = isTwoHourReminder ? 'reminder-2h' : 'reminder-24h'
      const timing = isTwoHourReminder ? '2h' : '24h'
      notifications.push({
        id: `${kind}:${poll.id}:${slot.id}:${slot.startsAt}`,
        kind,
        title: 'Sveglia fagianotto!',
        body: `${isTwoHourReminder ? 'Guarda che tra 2 ore giochi' : 'Guarda che domani giochi'}: ${formatSession(slot.startsAt)} · ${DEFAULT_VENUE}.`,
        url: `/?poll=${encodeURIComponent(poll.id)}`,
        tag: `${timing}-${poll.id}-${slot.id}`,
        ttlSeconds: Math.max(60, Math.floor(remaining / 1000)),
        recipientUserIds,
        excludedUserIds: [],
      })
    }
  }

  return notifications
}
