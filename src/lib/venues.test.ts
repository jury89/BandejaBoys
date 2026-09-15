import type { MemberProfile, PadelSlot, VenueId } from '../types'
import { addSlotToPoll, hasExistingSlotAtDateTime, makePoll, rescheduleSlot, setSlotBooking } from './domain'
import { fixedSeatMatchingMembers } from './fixedSeat'
import { buildSlotCalendar } from './calendar'
import { matchesVenueFilter, normalizePreferredVenueIds, slotVenueId, slotVenueName, validatePreferredVenueIds } from './venues'

const player: MemberProfile = { id: 'jury', displayName: 'Jury', email: 'jury@example.test', createdAt: 1,
  fixedSeatPreference: { weekday: 2, startMinutes: 18 * 60, endMinutes: 20 * 60 } }
const input = { startsAt: '2026-09-15T18:00', durationMinutes: 90 }
const legacy: PadelSlot = { id: 'old', ...input, venue: '', signups: [] }

describe('circoli e preferenze', () => {
  it('legge gli slot storici come Oasi senza mutarli e conserva etichette sconosciute', () => {
    expect(slotVenueId(legacy)).toBe('oasi-boschetto')
    expect(slotVenueName(legacy)).toBe('Oasi Boschetto')
    expect(legacy).not.toHaveProperty('venueId')
    expect(slotVenueName({ venue: 'Circolo storico' })).toBe('Circolo storico')
    expect(slotVenueId({ venue: 'Sport City Mantova' })).toBe('sport-city-mantova')
  })

  it('valida i preferiti e permette sia più circoli sia tutti', () => {
    expect(normalizePreferredVenueIds(['invalid', 'sport-city-mantova', 'sport-city-mantova'])).toEqual(['sport-city-mantova'])
    for (const invalid of [null, 'sport-city-mantova', ['invalid'], ['sport-city-mantova', 'sport-city-mantova']]) {
      expect(() => validatePreferredVenueIds(invalid)).toThrow()
    }
    expect(validatePreferredVenueIds([])).toEqual([])
    expect(matchesVenueFilter(legacy, [])).toBe(true)
    expect(matchesVenueFilter(legacy, ['sport-city-mantova'])).toBe(false)
    expect(matchesVenueFilter({ venueId: 'sport-city-mantova' }, ['sport-city-mantova', 'tennis-club-mantova'])).toBe(true)
  })

  it('salva il campo proposto anche senza prenotazione e lo conserva annullando la conferma', () => {
    const poll = { id: 'new', ...makePoll({ slots: [{ ...input, venueId: 'tennis-club-mantova' }] }, player) }
    expect(poll.slots[0]).toMatchObject({ venueId: 'tennis-club-mantova', venue: '', signups: [] })
    const booked = setSlotBooking(poll.slots[0], player, 10)
    expect(booked.venue).toBe('Tennis Club Mantova')
    const unbooked = setSlotBooking(booked, null)
    expect(unbooked).toMatchObject({ venueId: 'tennis-club-mantova', venue: '' })
    expect(unbooked.bookedAt).toBeUndefined()
    expect(buildSlotCalendar(poll, unbooked)).toContain('LOCATION:Tennis Club Mantova')
    expect(() => makePoll({ slots: [{ ...input, venueId: 'invalid' as VenueId }] }, player)).toThrow('Scegli un campo valido')
  })

  it('considera duplicati solo gli slot nello stesso circolo, inclusi i legacy', () => {
    const poll = { id: 'new', ...makePoll({ slots: [input, { ...input, venueId: 'sport-city-mantova' }] }, player) }
    expect(poll.slots).toHaveLength(2)
    expect(hasExistingSlotAtDateTime(input.startsAt, [legacy], 'oasi-boschetto')).toBe(true)
    expect(hasExistingSlotAtDateTime(input.startsAt, [legacy], 'tennis-club-mantova')).toBe(false)
    expect(() => addSlotToPoll(poll, { ...input, venueId: 'tennis-club-mantova' }, player)).not.toThrow()
    expect(() => addSlotToPoll(poll, input, player)).toThrow('Esiste già')
    expect(() => rescheduleSlot(poll, poll.slots[0].id, input.startsAt)).not.toThrow()
  })

  it('limita il posto fisso ai preferiti, con fascia interamente inclusa e precedenza invariata', () => {
    const sport = { ...legacy, venueId: 'sport-city-mantova' as const }
    const onlyTennis = { ...player, id: 'tennis', preferredVenueIds: ['tennis-club-mantova' as const] }
    const both = { ...player, id: 'both', createdAt: 2, preferredVenueIds: ['sport-city-mantova' as const, 'tennis-club-mantova' as const] }
    expect(fixedSeatMatchingMembers(sport, [both, onlyTennis, player]).map((member) => member.id)).toEqual(['jury', 'both'])
    expect(fixedSeatMatchingMembers(legacy, [onlyTennis, both])).toEqual([])
    expect(fixedSeatMatchingMembers({ ...sport, startsAt: '2026-09-15T19:00' }, [player, both])).toEqual([])
    expect(fixedSeatMatchingMembers({ ...sport, startsAt: '2026-12-15T18:00' }, [both])).toEqual([both])
  })
})
