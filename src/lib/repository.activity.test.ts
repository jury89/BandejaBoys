import { beforeEach, describe, expect, it } from 'vitest'
import type { PadelPoll, SessionUser } from '../types'
import type { LocalActivityEvent, LocalSlotView } from './activity'
import { repository } from './repository'

const ACTIVITY_KEY = 'bandeja-boys:activity'
const POLLS_KEY = 'bandeja-boys:polls'

const user: SessionUser = {
  id: 'jury',
  displayName: 'Jury',
  email: 'jury@example.test',
  createdAt: 1,
}

function polls(): PadelPoll[] {
  return JSON.parse(localStorage.getItem(POLLS_KEY) ?? '[]') as PadelPoll[]
}

function activity(): { events: LocalActivityEvent[]; views: LocalSlotView[] } {
  return JSON.parse(localStorage.getItem(ACTIVITY_KEY) ?? '{"events":[],"views":[]}') as {
    events: LocalActivityEvent[]
    views: LocalSlotView[]
  }
}

describe('repository activity log in demo mode', () => {
  beforeEach(() => localStorage.clear())

  it('registra creazione, adesione, ritiro e modifica dello slot', async () => {
    await repository.createPoll({
      targetWeekStart: '2027-01-04',
      slots: [{ startsAt: '2027-01-05T19:30', durationMinutes: 90 }],
    }, user)
    const poll = polls()[0]
    const slot = poll.slots[0]

    await repository.joinSlot(poll.id, slot.id, user, 'starter')
    await repository.leaveSlot(poll.id, slot.id, user)
    await repository.rescheduleSlot(poll.id, slot.id, '2027-01-05T20:00', user)

    expect(activity().events.map((event) => event.type)).toEqual([
      'poll_created',
      'slot_created',
      'signup_joined',
      'signup_left',
      'slot_rescheduled',
    ])
    expect(activity().events.at(-1)).toMatchObject({
      actorId: 'jury',
      pollId: poll.id,
      slotId: slot.id,
      details: { previousStartsAt: '2027-01-05T18:30:00.000Z' },
    })
    expect(activity().events.every((event) => Number.isFinite(event.occurredAt))).toBe(true)
  })

  it('aggrega primo accesso, ultimo accesso e conteggio per utente e slot', async () => {
    await repository.createPoll({
      targetWeekStart: '2027-01-04',
      slots: [{ startsAt: '2027-01-06T19:30', durationMinutes: 90 }],
    }, user)
    const poll = polls()[0]
    const slot = poll.slots[0]

    await repository.recordSlotView(poll, slot, user)
    await repository.recordSlotView(poll, slot, { ...user, displayName: 'Jury aggiornato' })

    expect(activity().views).toHaveLength(1)
    expect(activity().views[0]).toMatchObject({
      pollId: poll.id,
      slotId: slot.id,
      viewerId: user.id,
      viewerName: 'Jury aggiornato',
      viewCount: 2,
    })
    expect(activity().views[0].lastViewedAt).toBeGreaterThanOrEqual(activity().views[0].firstViewedAt)
  })
})
