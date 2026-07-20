import type { PadelPoll } from '../types'
import { DEFAULT_VENUE, getStarters } from './domain'

const HOUR_MS = 60 * 60 * 1000
const NEW_POLL_WINDOW_MS = 24 * HOUR_MS

export type NotificationKind = 'new-poll' | 'reminder-24h' | 'reminder-2h'

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
  }).format(new Date(startsAt))
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

export function collectScheduledNotifications(
  polls: PadelPoll[],
  now = Date.now(),
): ScheduledNotification[] {
  const notifications: ScheduledNotification[] = []

  for (const poll of polls) {
    if (poll.status === 'open' && poll.createdAt <= now && poll.createdAt >= now - NEW_POLL_WINDOW_MS) {
      notifications.push({
        id: `new-poll:${poll.id}:${poll.createdAt}`,
        kind: 'new-poll',
        title: 'Nuovo sondaggio in campo',
        body: `${poll.createdByName} ha pubblicato “${poll.title}”. Segna quando ci sei.`,
        url: `/?poll=${encodeURIComponent(poll.id)}`,
        tag: `new-poll-${poll.id}`,
        ttlSeconds: 24 * 60 * 60,
        recipientUserIds: null,
        excludedUserIds: [poll.createdBy],
      })
    }

    for (const slot of poll.slots) {
      if (!slot.bookedAt) continue
      const startsAt = new Date(slot.startsAt).getTime()
      const remaining = startsAt - now
      if (!Number.isFinite(startsAt) || remaining <= 0 || remaining > 24 * HOUR_MS) continue

      const recipientUserIds = Array.from(new Set(getStarters(slot).map((signup) => signup.userId)))
      if (recipientUserIds.length === 0) continue

      const isTwoHourReminder = remaining <= 2 * HOUR_MS
      const kind: NotificationKind = isTwoHourReminder ? 'reminder-2h' : 'reminder-24h'
      const timing = isTwoHourReminder ? '2h' : '24h'
      notifications.push({
        id: `${kind}:${poll.id}:${slot.id}:${slot.startsAt}`,
        kind,
        title: isTwoHourReminder ? 'Padel tra 2 ore' : 'Padel domani',
        body: `${formatSession(slot.startsAt)} · ${DEFAULT_VENUE}. Sei tra i titolari.`,
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
