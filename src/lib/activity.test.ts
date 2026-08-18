import { describe, expect, it } from 'vitest'
import type { PadelSlot } from '../types'
import {
  makeActivityEvent,
  mergeLegacySubstitutionEvents,
  slotViewDocumentId,
  type LocalActivityEvent,
} from './activity'

describe('activity helpers', () => {
  it('costruisce un evento slot con attore e dettagli utili', () => {
    expect(makeActivityEvent(
      'slot_rescheduled',
      { id: 'jury', displayName: 'Jury' },
      { id: 'poll-1', title: 'Padel' },
      { id: 'slot-1', startsAt: '2026-07-28T19:30' },
      { previousStartsAt: '2026-07-28T18:30' },
    )).toEqual({
      type: 'slot_rescheduled',
      actorId: 'jury',
      actorName: 'Jury',
      pollId: 'poll-1',
      pollTitle: 'Padel · 27 lug – 2 ago 2026',
      slotId: 'slot-1',
      slotStartsAt: '2026-07-28T19:30',
      details: { previousStartsAt: '2026-07-28T18:30' },
    })
  })

  it('genera un id stabile e senza slash per una visualizzazione', () => {
    expect(slotViewDocumentId('poll/1', 'slot/2', 'user/3'))
      .toBe('poll%2F1__slot%2F2__user%2F3')
  })

  it('recupera una sostituzione precedente all’audit dal dato persistito nello slot', () => {
    const substitutedAt = Date.UTC(2026, 6, 21, 13, 8, 19)
    const slot: PadelSlot = {
      id: 'slot-1',
      startsAt: '2026-07-27T18:30',
      durationMinutes: 90,
      venue: 'Oasi Boschetto',
      signups: [{
        id: 'signup-dade',
        userId: 'dade',
        displayName: 'Dade',
        joinedAt: substitutedAt,
        substitutedFor: {
          userId: 'tommy',
          displayName: 'Tommy',
          at: substitutedAt,
        },
      }],
    }

    expect(mergeLegacySubstitutionEvents(
      [],
      { id: 'poll-1', title: 'Padel' },
      slot,
    )).toEqual([{
      id: `legacy-substitution:${slot.id}:signup-dade:${substitutedAt}`,
      type: 'starter_substituted',
      actorId: 'tommy',
      actorName: 'Tommy',
      pollId: 'poll-1',
      pollTitle: 'Padel · 27 lug – 2 ago 2026',
      slotId: slot.id,
      slotStartsAt: slot.startsAt,
      occurredAt: substitutedAt,
      details: {
        outgoingUserId: 'tommy',
        outgoingName: 'Tommy',
        replacementUserId: 'dade',
        replacementName: 'Dade',
        recoveredFromSlot: true,
      },
    }])
  })

  it('non duplica una sostituzione già presente nel registro audit', () => {
    const substitutedAt = Date.UTC(2026, 6, 21, 13, 8, 19)
    const recordedEvent: LocalActivityEvent = {
      id: 'persisted-substitution',
      type: 'starter_substituted',
      actorId: 'tommy',
      actorName: 'Tommy',
      pollId: 'poll-1',
      pollTitle: 'Padel',
      slotId: 'slot-1',
      slotStartsAt: '2026-07-27T18:30',
      occurredAt: substitutedAt + 2_000,
      details: {
        outgoingUserId: 'tommy',
        outgoingName: 'Tommy',
        replacementUserId: 'dade',
        replacementName: 'Dade',
      },
    }
    const slot: PadelSlot = {
      id: 'slot-1',
      startsAt: '2026-07-27T18:30',
      durationMinutes: 90,
      venue: 'Oasi Boschetto',
      signups: [{
        id: 'signup-dade',
        userId: 'dade',
        displayName: 'Dade',
        joinedAt: substitutedAt,
        substitutedFor: {
          userId: 'tommy',
          displayName: 'Tommy',
          at: substitutedAt,
        },
      }],
    }

    expect(mergeLegacySubstitutionEvents(
      [recordedEvent],
      { id: 'poll-1', title: 'Padel' },
      slot,
    )).toEqual([recordedEvent])
  })
})
