import type { MatchRatingResponse, PadelPoll, PadelSlot } from '../types'
import {
  DEFAULT_VENUE,
  MATCH_RATING_DELAY_MS,
  MAX_STARTERS,
  getMatchRatingDueAt,
  getMatchRatingResponseId,
  getStarters,
  padelDateTimeToTimestamp,
} from './domain'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const NEW_SLOT_WINDOW_MS = DAY_MS
export const NEW_SLOT_QUIET_PERIOD_MS = 10 * 60 * 1000
export const SLOT_READY_NOTIFICATION_WINDOW_MS = DAY_MS
export const BOOKING_REMINDER_LEAD_MS = 7 * DAY_MS
export const BOOKING_REMINDER_WINDOW_MS = DAY_MS
export const MATCH_RATING_NOTIFICATION_WINDOW_MS = 30 * 60 * 1000

export type NotificationKind = 'new-slots' | 'slot-ready' | 'booking-reminder-7d' | 'reminder-24h' | 'reminder-2h' | 'match-rating' | 'test'
export type TestNotificationMode = 'standard' | 'match-rating'

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

  const candidates = poll.slots.filter((slot) => {
    const createdAt = slot.createdAt
    const startsAt = padelDateTimeToTimestamp(slot.startsAt)
    return typeof createdAt === 'number'
      && Number.isFinite(createdAt)
      && createdAt <= now
      && createdAt >= now - NEW_SLOT_WINDOW_MS
      && Number.isFinite(startsAt)
      && startsAt > now
  })

  return groupNewSlots(candidates).flatMap((group) => {
    const latestCreatedAt = Math.max(...group.map((slot) => slot.createdAt ?? 0))
    if (now - latestCreatedAt < NEW_SLOT_QUIET_PERIOD_MS) return []

    const first = group[0]
    const excludedUserIds = Array.from(new Set(
      group.map((slot) => slot.createdBy).filter((userId): userId is string => Boolean(userId)),
    ))
    const body = group.length === 1
      ? `C’è un nuovo slot disponibile: ${formatSession(first.startsAt)}. Segna se ci sei.`
      : `Ci sono ${group.length} nuovi slot disponibili per “${poll.title}”. Segna quando ci sei.`

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

export function createTestNotification(
  userId: string,
  eventId: string,
  message?: string,
  mode: TestNotificationMode = 'standard',
): ScheduledNotification {
  const recipient = userId.trim()
  const identifier = eventId.trim()
  const customBody = message?.trim()
  if (!recipient || !identifier) throw new Error('Destinatario o identificativo del test mancante.')
  if (customBody && customBody.length > 240) throw new Error('Il messaggio di test supera i 240 caratteri.')

  const isMatchRatingTest = mode === 'match-rating'

  return {
    id: `test:${identifier}`,
    kind: 'test',
    title: isMatchRatingTest
      ? 'TEST · È ora di dare i voti'
      : customBody ? 'Bandeja Boys' : 'Test notifiche Bandeja Boys',
    body: customBody || (isMatchRatingTest
      ? 'Tocca per aprire la pagella di collaudo. Nessun voto verrà salvato.'
      : 'Se leggi questo messaggio, le notifiche funzionano correttamente.'),
    url: isMatchRatingTest ? '/?ratingTest=1' : '/',
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
): ScheduledNotification[] {
  const notifications: ScheduledNotification[] = []
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
