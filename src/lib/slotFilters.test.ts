import { describe, expect, it } from 'vitest'
import { matchesSlotFilter } from './slotFilters'
import type { PadelPoll, PadelSlot } from '../types'

const slot: PadelSlot = {
  id: 'slot', startsAt: '2026-09-14T18:00', durationMinutes: 90, venue: '',
  signups: [{ id: 'one', userId: 'jury', displayName: 'Jury', joinedAt: 1, role: 'reserve' }],
}
const poll: PadelPoll = { id: 'poll', title: 'Padel', targetWeekStart: '2026-09-14', createdBy: 'jury', createdByName: 'Jury', createdAt: 1, updatedAt: 1, status: 'open', slots: [slot] }

describe('filtri bacheca', () => {
  it('include le riserve nelle proprie iscrizioni, senza contarle come titolari', () => {
    expect(matchesSlotFilter(poll, slot, 'joined', 'jury')).toBe(true)
    expect(matchesSlotFilter(poll, slot, 'joined', 'altro')).toBe(false)
    expect(matchesSlotFilter(poll, slot, 'available', 'jury')).toBe(true)
  })
  it('esclude dai posti liberi gli slot chiusi e quelli con quattro titolari', () => {
    const full = { ...slot, signups: Array.from({ length: 4 }, (_, i) => ({ id: String(i), userId: String(i), displayName: String(i), joinedAt: i })) }
    expect(matchesSlotFilter(poll, full, 'available', 'jury')).toBe(false)
    expect(matchesSlotFilter({ ...poll, status: 'closed' }, slot, 'available', 'jury')).toBe(false)
    expect(matchesSlotFilter(poll, full, 'booking', 'jury')).toBe(true)
    expect(matchesSlotFilter(poll, { ...full, bookedAt: 1 }, 'booking', 'jury')).toBe(false)
    expect(matchesSlotFilter(poll, { ...full, bookedAt: 1 }, 'booked', 'jury')).toBe(true)
  })
  it('non modifica né riordina le adesioni', () => {
    const before = JSON.stringify(slot)
    for (const filter of ['all', 'joined', 'booked', 'booking', 'available'] as const) matchesSlotFilter(poll, slot, filter, 'jury')
    expect(JSON.stringify(slot)).toBe(before)
  })
})
