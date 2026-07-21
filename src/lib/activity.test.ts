import { describe, expect, it } from 'vitest'
import { makeActivityEvent, slotViewDocumentId } from './activity'

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
      pollTitle: 'Padel',
      slotId: 'slot-1',
      slotStartsAt: '2026-07-28T19:30',
      details: { previousStartsAt: '2026-07-28T18:30' },
    })
  })

  it('genera un id stabile e senza slash per una visualizzazione', () => {
    expect(slotViewDocumentId('poll/1', 'slot/2', 'user/3'))
      .toBe('poll%2F1__slot%2F2__user%2F3')
  })
})
