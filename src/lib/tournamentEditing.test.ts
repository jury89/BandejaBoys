import { canEditTournament, editTournament, makeTournament, publishTournament, registerForTournament, saveTournamentGuest, startTournament, tournamentRegistrationsOpen, tournamentSettingsEditable } from './domain'
import { SLOT_ADMIN_USER_ID as admin } from './admin'
import type { Tournament, TournamentInput } from './tournamentTypes'

const now = Date.UTC(2026, 9, 1, 10), owner = 'organizer'
const input: TournamentInput = { title: 'Coppa modificabile', startsAt: now + 7_200_000, venueId: 'sport-city-mantova', format: 'americano', pairing: 'rotating', capacity: 8, courts: 2, rounds: 3, pointsPerMatch: 24, scoreAccess: 'players' }
function fixture(overrides: Partial<TournamentInput> = {}, count = 0): Tournament {
  let t = publishTournament(makeTournament('qa', { ...input, ...overrides }, owner, now), owner, now)
  for (let i = 0; i < count; i++) t = registerForTournament(t, { id: `p${i}`, displayName: `Player ${i}` }, null, now + i)
  return t
}
describe('safe tournament editing', () => {
  it.each(['americano', 'mexicano', 'round-robin', 'knockout'] as const)('supports published edits for %s without changing ownership', format => {
    const t = fixture({ format, pairing: ['americano', 'mexicano'].includes(format) ? 'rotating' : 'random-fixed' })
    for (const actor of [owner, admin]) {
      const edited = editTournament(t, { ...t, title: 'Nome corretto', venueId: 'tennis-club-mantova', capacity: 16 }, actor, now)
      expect(edited).toMatchObject({ title: 'Nome corretto', capacity: 16, venueId: 'tennis-club-mantova', createdBy: owner, status: 'open', published: true })
      expect(edited.registrations).toEqual(t.registrations)
      expect(edited.matches).toEqual(t.matches)
    }
    expect(canEditTournament(t, 'other', now)).toBe(false)
    expect(() => editTournament(t, t, 'other', now)).toThrow(/organizzatore/)
  })
  it('counts external participants and prevents capacity reductions from removing anyone', () => {
    const t = saveTournamentGuest(fixture({}, 4), 'guest:ciccio', 'Ciccio', null, owner, now)
    expect(() => editTournament(t, { ...t, capacity: 4 }, admin, now)).toThrow(/nessuno verrà rimosso/)
    const edited = editTournament(t, { ...t, capacity: 12 }, admin, now)
    expect(edited.registrations).toEqual(t.registrations)
    expect(Object.keys(edited.registrations)).toHaveLength(5)
  })
  it.each([{ format: 'mexicano' }, { pairing: 'chosen-fixed' }, { pointsPerMatch: 16 }] as Partial<TournamentInput>[])('locks enrolled players’ rules: %j', change => {
    const t = fixture({}, 1)
    expect(() => editTournament(t, { ...t, ...change }, owner, now)).toThrow(/già iscritti/)
    expect(() => editTournament(t, { ...t, ...change }, admin, now)).toThrow(/già iscritti/)
  })
  it.each([owner, admin])('%s can change duration before draw without losing members, guests or chosen pairs', actor => {
    let t = saveTournamentGuest(fixture({ format: 'round-robin', pairing: 'chosen-fixed', capacity: 10 }, 7), 'guest:ciccio', 'Ciccio', 'p0', owner, now)
    t = registerForTournament(t, { id: 'p0', displayName: 'Player 0' }, 'guest:ciccio', now)
    const timed = editTournament(t, { ...t, scoringMode: 'timed', totalMinutes: 90 }, actor, now)
    expect(timed).toMatchObject({ scoringMode: 'timed', totalMinutes: 90, matchMinutes: 15, createdBy: owner })
    expect(timed.registrations).toEqual(t.registrations)
    const standard = editTournament(timed, { ...timed, scoringMode: 'standard', totalMinutes: null, matchMinutes: 15 }, actor, now)
    expect(standard.scoringMode).toBe('standard')
    expect(standard.registrations).toEqual(t.registrations)
    expect(standard.matches).toEqual(t.matches)
  })
  it('keeps timing changes behind the creator cutoff and admin override', () => {
    const t = fixture({ format: 'round-robin', pairing: 'random-fixed' }, 8)
    const cutoff = t.startsAt - 3_600_000, change = { ...t, scoringMode: 'timed' as const, totalMinutes: 90 }
    expect(() => editTournament(t, change, owner, cutoff)).toThrow(/chiuse/)
    expect(editTournament(t, change, admin, cutoff).scoringMode).toBe('timed')
    expect(() => editTournament(t, change, 'other', now)).toThrow(/organizzatore/)
  })
  it('allows a new formula only before the first registration', () => {
    const t = fixture()
    expect(editTournament(t, { ...t, format: 'round-robin', pairing: 'chosen-fixed' }, owner, now).format).toBe('round-robin')
  })
  it('allows only the admin to edit an undrawn tournament at/after cutoff', () => {
    const t = fixture({}, 4), cutoff = t.startsAt - 3_600_000
    expect(canEditTournament(t, owner, cutoff - 1)).toBe(true)
    expect(canEditTournament(t, owner, cutoff)).toBe(false)
    expect(() => editTournament(t, { ...t, courts: 3 }, owner, cutoff)).toThrow(/chiuse/)
    for (const time of [cutoff, t.startsAt + 86_400_000]) {
      expect(tournamentSettingsEditable(t, admin, time)).toBe(true)
      const edited = editTournament(t, { ...t, courts: 3 }, admin, time)
      expect(edited.startsAt).toBe(t.startsAt)
      expect(edited.registrations).toEqual(t.registrations)
    }
  })
  it('recomputes signup cutoff on reschedule but rejects a newly backdated start', () => {
    const t = fixture({}, 4), time = t.startsAt
    const edited = editTournament(t, { ...t, startsAt: time + 7_200_000 }, admin, time)
    expect(tournamentRegistrationsOpen(edited, time)).toBe(true)
    expect(tournamentRegistrationsOpen(edited, time + 3_600_000)).toBe(false)
    expect(edited.registrations).toEqual(t.registrations)
    expect(() => editTournament(t, { ...t, startsAt: time - 1 }, admin, time)).toThrow()
    expect(() => editTournament(t, { ...t, startsAt: time + 3_600_000 }, admin, time)).toThrow()
  })
  it.each(['running', 'completed', 'cancelled'] as const)('allows only admin metadata corrections on %s without normalizing history', status => {
    const drawn = startTournament(fixture({}, 4), owner, 42, input.startsAt)
    const t = { ...drawn, status, roundStartedAt: input.startsAt }
    expect(canEditTournament(t, owner, input.startsAt)).toBe(false)
    expect(tournamentSettingsEditable(t, admin, input.startsAt)).toBe(false)
    const edited = editTournament(t, { ...t, title: 'Storico corretto', venueId: 'oasi-boschetto' }, admin, input.startsAt)
    expect(edited).toEqual({ ...t, title: 'Storico corretto', venueId: 'oasi-boschetto', updatedAt: input.startsAt })
    expect(() => editTournament(t, t, owner, input.startsAt)).toThrow(/chiuse/)
    for (const change of [{ startsAt: t.startsAt + 1000 }, { capacity: 12 }, { courts: 3 }, { scoreAccess: 'admin' }, { matchMinutes: 9 }, { scoringMode: 'timed', totalMinutes: 90 }]) {
      expect(() => editTournament(t, { ...t, ...change } as TournamentInput, admin, input.startsAt)).toThrow(/tabellone è protetto/)
    }
  })
  it('does not add missing legacy timer fields when correcting history', () => {
    const t = { ...fixture(), status: 'completed' as const }
    delete t.scoringMode; delete t.matchMinutes; delete t.totalMinutes
    const edited = editTournament(t, { ...t, title: 'Vecchio torneo corretto' }, admin, input.startsAt)
    expect(edited.scoringMode).toBeUndefined()
    expect(edited.matchMinutes).toBeUndefined()
    expect(edited.totalMinutes).toBeUndefined()
  })
})
