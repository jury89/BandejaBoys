import type { PadelPoll, PadelSlot } from '../types'
import { getSlotPhase, getStarters, isBookingCandidate, MAX_STARTERS } from './domain'

export type PollSlotFilter = 'all' | 'available' | 'joined' | 'booking' | 'booked'

/** Presentation filters only: never change signup order or booking facts. */
export function matchesSlotFilter(poll: PadelPoll, slot: PadelSlot, filter: PollSlotFilter, userId: string): boolean {
  switch (filter) {
    case 'available': return poll.status === 'open' && getStarters(slot).length < MAX_STARTERS
    case 'joined': return slot.signups.some((signup) => signup.userId === userId)
    case 'booking': return isBookingCandidate(slot)
    case 'booked': return getSlotPhase(slot) === 'booked'
    default: return true
  }
}
