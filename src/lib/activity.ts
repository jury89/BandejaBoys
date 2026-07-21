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

export function slotViewDocumentId(pollId: string, slotId: string, userId: string): string {
  return [pollId, slotId, userId].map(encodeURIComponent).join('__')
}
