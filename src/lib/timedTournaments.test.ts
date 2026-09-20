import { advanceTournament, getTimedTournamentPlan, getTournamentRoundClock, getTournamentStandings, makeTournament, makeTournamentScore, publishTournament, registerForTournament, removeTournamentGuest, saveTournamentGuest, startTournament, startTournamentRound, tournamentScoreIsValid, validateTournamentInput } from './domain'
import { SLOT_ADMIN_USER_ID as admin } from './admin'
import { localTournamentRepository } from './tournamentRepository'
import type { Tournament, TournamentInput, TournamentScore } from './tournamentTypes'

const now = Date.UTC(2026, 9, 1, 10), owner = 'organizer'
const user = (id: string) => ({ id, displayName: id, email: `${id}@example.test`, createdAt: 1 })
const input: TournamentInput = { title: 'Un’ora e mezza', startsAt: now + 7_200_000, venueId: 'sport-city-mantova', format: 'round-robin', pairing: 'random-fixed', capacity: 10, courts: 2, rounds: 5, pointsPerMatch: 24, scoreAccess: 'players', scoringMode: 'timed', matchMinutes: 15, warmupMinutes: 5, changeoverMinutes: 2 }
function registered(overrides: Partial<TournamentInput> = {}, count = 8) {
  let t = publishTournament(makeTournament('timed', { ...input, ...overrides }, owner, now), owner, now)
  for (let i = 0; i < count; i++) t = registerForTournament(t, user(`p${i}`), null, now + i)
  return t
}
function drawn() { return startTournament(registered({}, 10), owner, 42, input.startsAt - 3_600_000) }
function scoresFor(t: Tournament, a: number, b: number, at: number) {
  return Object.values(t.matches).filter(m => m.round === t.currentRound).map(m => makeTournamentScore(t, m.id, a, b, owner, undefined, 0, at))
}

describe('timed round robin', () => {
  it('fits ten people on two courts into 88 minutes with four matches and one rest each', () => {
    const plan = getTimedTournamentPlan(input), t = drawn(), matches = Object.values(t.matches)
    expect(plan).toMatchObject({ teams: 5, rounds: 5, requiredCourts: 2, matchesPerPair: 4, playingMinutes: 60, totalMinutes: 88 })
    expect(plan.schedule.at(-1)!.endsAt - input.startsAt).toBe(88 * 60_000)
    expect(matches).toHaveLength(10)
    for (const team of t.teams) expect(matches.filter(m => [m.teamA.id, m.teamB.id].includes(team.id))).toHaveLength(4)
    for (let round = 1; round <= 5; round++) {
      const current = matches.filter(m => m.round === round)
      expect(current.map(m => m.wave)).toEqual([1, 1])
      expect(new Set(current.map(m => m.court)).size).toBe(2)
    }
    expect(getTimedTournamentPlan(input, 8)).toMatchObject({ rounds: 3, totalMinutes: 54, matchesPerPair: 3 })
  })
  it.each([{ courts: 1 }, { matchMinutes: 4 }, { matchMinutes: 31 }, { warmupMinutes: -1 }, { changeoverMinutes: 6 }, { matchMinutes: 12.5 }, { format: 'knockout', capacity: 8 }, { scoringMode: 'other' }])('rejects incompatible settings %j', override => {
    expect(() => validateTournamentInput({ ...input, ...override } as TournamentInput, now)).toThrow()
  })
  it('only an organizer/admin starts the shared clock, once, at or after the scheduled start', () => {
    const t = drawn()
    expect(getTournamentRoundClock(t, input.startsAt)).toMatchObject({ state: 'waiting', remainingSeconds: 900, endsAt: null })
    expect(() => startTournamentRound(t, 'p0', input.startsAt)).toThrow(/organizzatore/)
    expect(() => startTournamentRound(t, owner, input.startsAt - 1)).toThrow()
    const started = startTournamentRound(t, admin, input.startsAt)
    expect(getTournamentRoundClock(started, input.startsAt - 999).remainingSeconds).toBe(900)
    expect(() => startTournamentRound(started, owner, input.startsAt + 1000)).toThrow()
    expect(getTournamentRoundClock(started, input.startsAt + 1)).toMatchObject({ state: 'running', remainingSeconds: 900 })
    expect(getTournamentRoundClock(JSON.parse(JSON.stringify(started)), input.startsAt + 60_000).remainingSeconds).toBe(840)
    expect(getTournamentRoundClock(started, input.startsAt + 900_000)).toMatchObject({ state: 'expired', remainingSeconds: 0 })
    expect(getTournamentRoundClock(started, input.startsAt + 999_999).remainingSeconds).toBe(0)
    expect(() => makeTournamentScore(t, 'r1-m1', 0, 0, owner, undefined, 0, input.startsAt)).toThrow(/timer/)
  })
  it.each([[0, 0, true], [4, 4, true], [3, 2, true], [99, 99, true], [100, 0, false], [-1, 4, false], [1.5, 2, false]])('validates timed game score %s–%s', (a, b, valid) => {
    expect(tournamentScoreIsValid(input, a as number, b as number)).toBe(valid)
    expect(tournamentScoreIsValid({ format: 'round-robin', pointsPerMatch: 24 }, 4, 4)).toBe(false)
  })
  it('waits for the timer AND all results, resets the next clock and freezes completed rounds', () => {
    let t = startTournamentRound(drawn(), owner, input.startsAt)
    const firstScores = scoresFor(t, 4, 4, input.startsAt)
    expect(() => advanceTournament(t, firstScores, owner, input.startsAt + 899_999)).toThrow(/timer/)
    expect(() => advanceTournament(t, firstScores.slice(0, 1), owner, input.startsAt + 900_000)).toThrow(/Completa/)
    let all: TournamentScore[] = [], at = input.startsAt
    while (t.status === 'running') {
      if (t.roundStartedAt === null) t = startTournamentRound(t, owner, at)
      all = [...all, ...scoresFor(t, 4, 4, at)]
      at += 900_000
      t = advanceTournament(t, all, owner, at)
      if (t.status === 'running') expect(t.roundStartedAt).toBeNull()
    }
    expect(t.status).toBe('completed')
    expect(() => makeTournamentScore(t, 'r1-m1', 5, 4, owner, all[0], 1, at)).toThrow(/corrente/)
    expect(getTournamentStandings(t, all).map(r => [r.tablePoints, r.draws, r.played, r.rank, r.tied])).toEqual(Array.from({ length: 5 }, () => [4, 4, 4, 1, true]))
  })
  it('ranks 3/1/0 points first, then difference and games scored; rests earn nothing', () => {
    const t = startTournamentRound(drawn(), owner, input.startsAt)
    const fixtures = Object.values(t.matches).filter(m => m.round === 1)
    const scores = fixtures.map((m, i) => makeTournamentScore(t, m.id, i ? 1 : 4, i ? 0 : 4, owner, undefined, 0, input.startsAt))
    const rows = getTournamentStandings(t, scores)
    expect(rows[0]).toMatchObject({ tablePoints: 3, wins: 1 })
    expect(rows.filter(r => r.tablePoints === 1)).toHaveLength(2)
    expect(rows.find(r => r.played === 0)).toMatchObject({ tablePoints: 0, draws: 0, wins: 0 })
    expect(rows.at(-1)!.pointsAgainst).toBe(1)
  })
})

describe('external tournament participants', () => {
  it.each([owner, admin])('%s adds and edits a guest without changing their position or creating an account', actor => {
    const t = saveTournamentGuest(registered(), 'guest:ciccio', ' Ciccio ', null, actor, now)
    expect(t.registrations['guest:ciccio']).toMatchObject({ displayName: 'Ciccio', isGuest: true, userId: 'guest:ciccio' })
    const edited = saveTournamentGuest(t, 'guest:ciccio', 'Ciccio Rossi', null, actor, now + 20)
    expect(edited.registrations['guest:ciccio'].joinedAt).toBe(now)
    expect(Object.keys(edited.registrations)).toHaveLength(9)
    expect(Object.keys(removeTournamentGuest(edited, 'guest:ciccio', actor, now).registrations)).toHaveLength(8)
  })
  it('protects membership, capacity and the cutoff for guests too', () => {
    const t = registered()
    expect(() => saveTournamentGuest(t, 'guest:a', 'A', null, 'p0', now)).toThrow(/organizzatore/)
    expect(() => saveTournamentGuest(t, 'p0', 'Fake', null, owner, now)).toThrow(/valido/)
    expect(() => saveTournamentGuest(t, 'guest:a', ' ', null, owner, now)).toThrow(/nome/)
    expect(() => removeTournamentGuest(t, 'p0', owner, now)).toThrow(/ospite/)
    const full = saveTournamentGuest(saveTournamentGuest(t, 'guest:a', 'A', null, owner, now), 'guest:b', 'B', null, owner, now)
    expect(() => saveTournamentGuest(full, 'guest:c', 'C', null, owner, now)).toThrow(/completo/)
    for (const at of [input.startsAt - 3_600_000, input.startsAt]) {
      expect(() => saveTournamentGuest(full, 'guest:a', 'New', null, owner, at)).toThrow(/chiudono/)
      expect(() => removeTournamentGuest(full, 'guest:a', owner, at)).toThrow(/chiuse/)
    }
    const started = startTournament(full, owner, 1, input.startsAt)
    expect(started.teams.flatMap(t => t.playerIds)).toEqual(expect.arrayContaining(['guest:a', 'guest:b']))
  })
  it('requires reciprocal choices for member/guest and guest/guest fixed pairs', () => {
    let t = registered({ pairing: 'chosen-fixed' }, 6)
    t = saveTournamentGuest(t, 'guest:a', 'A', 'p0', owner, now)
    expect(t.registrations.p0.partnerId).toBeNull()
    t = registerForTournament(t, user('p0'), 'guest:a', now)
    t = saveTournamentGuest(t, 'guest:b', 'B', 'p1', owner, now)
    t = registerForTournament(t, user('p1'), 'guest:b', now)
    for (const [a, b] of [['p2', 'p3'], ['p4', 'p5']]) {
      t = registerForTournament(t, user(a), b, now); t = registerForTournament(t, user(b), a, now)
    }
    t = saveTournamentGuest(t, 'guest:c', 'C', null, owner, now)
    t = saveTournamentGuest(t, 'guest:d', 'D', 'guest:c', owner, now)
    expect(() => startTournament(t, owner, 1, input.startsAt)).toThrow(/reciprocamente/)
    t = saveTournamentGuest(t, 'guest:c', 'C', 'guest:d', owner, now)
    expect(startTournament(t, owner, 1, input.startsAt).teams).toHaveLength(5)
    const removed = removeTournamentGuest(t, 'guest:a', owner, now)
    expect(removed.registrations.p0.partnerId).toBe('guest:a')
  })
  it('persists guest edits and shared timer through the local repository', async () => {
    const repo = localTournamentRepository(), t = registered({}, 8)
    localStorage.setItem('bandeja-tournaments-v1', JSON.stringify({ tournaments: [t], scores: {} }))
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    let latest = t
    const stop = repo.subscribeTournaments(owner, list => { latest = list[0] }, vi.fn())
    await repo.saveTournamentGuest(t.id, null, 'Ospite 1', null, user(owner))
    const id = Object.keys(latest.registrations).find(id => id.startsWith('guest:'))!
    await repo.saveTournamentGuest(t.id, id, 'Ospite rinominato', null, user(owner))
    expect(latest.registrations[id].displayName).toBe('Ospite rinominato')
    await repo.removeTournamentGuest(t.id, id, user(owner))
    expect(latest.registrations[id]).toBeUndefined()
    clock.mockReturnValue(input.startsAt)
    await repo.actOnTournament(t.id, 'start', user(owner))
    await repo.actOnTournament(t.id, 'start-round', user(owner))
    expect(latest.roundStartedAt).toBe(input.startsAt)
    stop(); clock.mockRestore()
  })
})
