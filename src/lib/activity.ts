import type { PadelPoll, PadelSlot, SessionUser } from '../types'

export const ACTIVITY_EVENT_TYPES = [
  'poll_created',
  'poll_archived',
  'poll_reopened',
  'poll_deleted',
  'slot_created',
  'slot_rescheduled',
  'slot_deleted',
  'signup_joined',
  'signup_left',
  'starter_substituted',
  'slot_booked',
  'slot_unbooked',
] as const

export type ActivityEventType = typeof ACTIVITY_EVENT_TYPES[number]
export type ActivityDetail = string | number | boolean | null

export interface ActivityEventInput {
  type: ActivityEventType
  actorId: string
  actorName: string
  pollId: string
  pollTitle: string
  slotId?: string
  slotStartsAt?: string
  details: Record<string, ActivityDetail>
}

export interface LocalActivityEvent extends ActivityEventInput {
  id: string
  occurredAt: number
}

export interface LocalSlotView {
  id: string
  pollId: string
  pollTitle: string
  slotId: string
  slotStartsAt: string
  viewerId: string
  viewerName: string
  firstViewedAt: number
  lastViewedAt: number
  viewCount: number
}

const LEGACY_SUBSTITUTION_MATCH_WINDOW_MS = 5 * 60 * 1000

export function makeActivityEvent(
  type: ActivityEventType,
  actor: Pick<SessionUser, 'id' | 'displayName'>,
  poll: Pick<PadelPoll, 'id' | 'title'>,
  slot?: Pick<PadelSlot, 'id' | 'startsAt'>,
  details: Record<string, ActivityDetail> = {},
): ActivityEventInput {
  return {
    type,
    actorId: actor.id,
    actorName: actor.displayName,
    pollId: poll.id,
    pollTitle: poll.title,
    ...(slot ? { slotId: slot.id, slotStartsAt: slot.startsAt } : {}),
    details,
  }
}

export function mergeLegacySubstitutionEvents(
  events: LocalActivityEvent[],
  poll: Pick<PadelPoll, 'id' | 'title'>,
  slot: PadelSlot,
): LocalActivityEvent[] {
  const recovered = slot.signups.flatMap((signup) => {
    const substitution = signup.substitutedFor
    if (!substitution) return []

    const alreadyRecorded = events.some((event) => (
      event.type === 'starter_substituted'
      && event.details.outgoingUserId === substitution.userId
      && event.details.replacementUserId === signup.userId
      && Math.abs(event.occurredAt - substitution.at) <= LEGACY_SUBSTITUTION_MATCH_WINDOW_MS
    ))
    if (alreadyRecorded) return []

    return [{
      id: `legacy-substitution:${slot.id}:${signup.id}:${substitution.at}`,
      type: 'starter_substituted' as const,
      actorId: substitution.userId,
      actorName: substitution.displayName,
      pollId: poll.id,
      pollTitle: poll.title,
      slotId: slot.id,
      slotStartsAt: slot.startsAt,
      occurredAt: substitution.at,
      details: {
        outgoingUserId: substitution.userId,
        outgoingName: substitution.displayName,
        replacementUserId: signup.userId,
        replacementName: signup.displayName,
        recoveredFromSlot: true,
      },
    }]
  })

  return [...events, ...recovered]
    .sort((left, right) => right.occurredAt - left.occurredAt || right.id.localeCompare(left.id))
}

export function slotViewDocumentId(pollId: string, slotId: string, userId: string): string {
  return [pollId, slotId, userId].map(encodeURIComponent).join('__')
}
