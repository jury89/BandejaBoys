import { advanceTournament, editTournamentOrganization, getAdaptiveTournamentRounds, getTimedTournamentPlan, getTournamentStandings, makeTournament, makeTournamentScore, publishTournament, registerForTournament, startTournament, startTournamentRound, validateTournamentInput } from './domain'
import { localTournamentRepository } from './tournamentRepository'
import type { TournamentInput, TournamentScore } from './tournamentTypes'

const now = Date.UTC(2026, 9, 1, 10), owner = 'organizer'
const user = (id: string) => ({ id, displayName: id, email: `${id}@example.test`, createdAt: 1 })
const input: TournamentInput = { title: 'Torneo flessibile', startsAt: now + 7_200_000, venueId: 'sport-city-mantova', format: 'round-robin', pairing: 'random-fixed', capacity: 12, courts: 2, rounds: 5, pointsPerMatch: 24, scoreAccess: 'players', scoringMode: 'timed', totalMinutes: 90, warmupMinutes: 5, changeoverMinutes: 2 }
function registered(count = 12) {
  let t = publishTournament(makeTournament('adaptive', input, owner, now), owner, now)
  for (let i = 0; i < count; i++) t = registerForTournament(t, user(`p${i}`), null, now + i)
  return t
}

describe('adaptive timed tournament planning', () => {
  it.each([
    [10, 2, 5, 15, 88], [12, 2, 8, 8, 83], [12, 3, 5, 15, 88], [10, 1, 10, 6, 83], [8, 2, 3, 27, 90],
  ])('%i players on %i courts fit into %i rounds of %i minutes', (capacity, courts, rounds, minutes, total) => {
    const plan = getTimedTournamentPlan({ ...input, capacity, courts })
    expect(plan).toMatchObject({ rounds, matchMinutes: minutes, totalMinutes: total, bufferMinutes: 90 - total, restRounds: rounds - (capacity / 2 - 1), feasible: true })
    expect(validateTournamentInput({ ...input, capacity, courts }, now).matchMinutes).toBe(minutes)
  })
  it('checks every supported team/court combination for complete, collision-free, balanced schedules', () => {
    for (let teams = 3; teams <= 16; teams++) for (let courts = 1; courts <= 8; courts++) {
      const rounds = getAdaptiveTournamentRounds(teams, courts)
      const matchCount = teams * (teams - 1) / 2
      expect(rounds).toHaveLength(Math.max(teams % 2 ? teams : teams - 1, Math.ceil(matchCount / courts)))
      const keys = rounds.flat().map(pair => [...pair].sort((a, b) => a - b).join(':'))
      expect(new Set(keys).size).toBe(matchCount)
      expect(keys).toHaveLength(matchCount)
      for (const round of rounds) {
        expect(round.length).toBeLessThanOrEqual(courts)
        expect(new Set(round.flat()).size).toBe(round.length * 2)
      }
      const loads = rounds.map(r => r.length)
      expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1)
      for (let team = 0; team < teams; team++) expect(rounds.flat().filter(p => p.includes(team))).toHaveLength(teams - 1)
      expect(getAdaptiveTournamentRounds(teams, courts)).toEqual(rounds)
    }
  })
  it('reports insufficient time without dropping matches or participants', () => {
    expect(getTimedTournamentPlan({ ...input, courts: 1 })).toMatchObject({ feasible: false, minimumMinutes: 108 })
    expect(() => validateTournamentInput({ ...input, courts: 1 }, now)).toThrow(/108/)
    for (const totalMinutes of [0, 14, 721, 90.5]) expect(() => validateTournamentInput({ ...input, totalMinutes }, now)).toThrow()
    expect(() => validateTournamentInput({ ...input, scoringMode: 'standard' }, now)).toThrow()
  })
  it('freezes an actual-count draw rather than the capacity estimate', () => {
    const twelve = startTournament(registered(), owner, 42, input.startsAt)
    expect(twelve).toMatchObject({ totalRounds: 8, matchMinutes: 8, totalMinutes: 90 })
    expect(Object.values(twelve.matches)).toHaveLength(15)
    expect(Object.values(twelve.matches).every(m => m.wave === 1 && m.court <= 2)).toBe(true)
    const ten = startTournament(registered(10), owner, 42, input.startsAt)
    expect(ten).toMatchObject({ totalRounds: 5, matchMinutes: 15, capacity: 12 })
    expect(Object.keys(ten.registrations)).toHaveLength(10)
    expect(() => startTournament(registered(11), owner, 42, input.startsAt)).toThrow()
    expect(() => editTournamentOrganization(ten, { capacity: 12, courts: 3, totalMinutes: 90 }, owner, now)).toThrow()
  })
  it('allows organization changes while open, preserving people and all unrelated settings', () => {
    const t = registered(10), settings = { capacity: 14, courts: 3, totalMinutes: 120, warmupMinutes: 5, changeoverMinutes: 2 }
    const edited = editTournamentOrganization(t, settings, owner, now)
    expect(edited).toMatchObject({ ...settings, registrations: t.registrations, matches: t.matches, startsAt: t.startsAt, pairing: t.pairing, status: 'open' })
    expect(() => editTournamentOrganization(t, settings, 'p0', now)).toThrow()
    expect(() => editTournamentOrganization(t, { ...settings, capacity: 8 }, owner, now)).toThrow()
    expect(() => editTournamentOrganization(t, settings, owner, input.startsAt - 3_600_000)).toThrow()
  })
  it('plays all eight adaptive rounds to completion with equal counted matches and no points for rests', () => {
    let t = startTournament(registered(), owner, 42, input.startsAt), at = input.startsAt
    const scores: TournamentScore[] = []
    while (t.status === 'running') {
      t = startTournamentRound(t, owner, at)
      for (const m of Object.values(t.matches).filter(m => m.round === t.currentRound)) scores.push(makeTournamentScore(t, m.id, 4, 4, owner, undefined, 0, at))
      at += t.matchMinutes! * 60_000
      t = advanceTournament(t, scores, owner, at)
      if (t.status === 'running') at += t.changeoverMinutes! * 60_000
    }
    expect(scores).toHaveLength(15)
    expect(t.currentRound).toBe(8)
    expect(getTournamentStandings(t, scores).map(r => [r.played, r.tablePoints, r.draws, r.rank])).toEqual(Array.from({ length: 6 }, () => [5, 5, 5, 1]))
    expect(at - input.startsAt + 5 * 60_000).toBe(83 * 60_000)
  })
  it('persists organization changes and recalculated draw via the local repository', async () => {
    const repo = localTournamentRepository(), t = registered(10)
    localStorage.setItem('bandeja-tournaments-v1', JSON.stringify({ tournaments: [t], scores: {} }))
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    let latest = t
    const stop = repo.subscribeTournaments(owner, list => { latest = list[0] }, vi.fn())
    try {
      await repo.editTournamentOrganization(t.id, { capacity: 14, courts: 2, totalMinutes: 120 }, user(owner))
      expect(latest.capacity).toBe(14)
      clock.mockReturnValue(input.startsAt)
      await repo.actOnTournament(t.id, 'start', user(owner))
      expect(latest).toMatchObject({ totalRounds: 5, matchMinutes: 21 })
    } finally { stop(); clock.mockRestore() }
  })
})
