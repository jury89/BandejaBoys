import { advanceTournament, cancelTournament, editTournament, getTournamentStandings, leaveTournament, makeTournament, makeTournamentScore, publishTournament, registerForTournament, startTournament, tournamentRegistrationsOpen, tournamentScoreIsValid, validateTournamentInput } from './domain'
import { SLOT_ADMIN_USER_ID as admin } from './admin'
import { localTournamentRepository } from './tournamentRepository'
import type { Tournament, TournamentInput, TournamentScore } from './tournamentTypes'

const now = Date.UTC(2026, 9, 1, 10)
const input: TournamentInput = { title: 'Coppa dei fagiani', startsAt: now + 7_200_000, venueId: 'sport-city-mantova', format: 'americano', pairing: 'rotating', capacity: 8, courts: 1, rounds: 7, pointsPerMatch: 24, scoreAccess: 'players' }
const user = (id: string) => ({ id, displayName: `Nome ${id}`, email: `${id}@example.test`, createdAt: 1 })
function registered(overrides: Partial<TournamentInput> = {}, count = overrides.capacity ?? 8): Tournament {
  let t = publishTournament(makeTournament('qa', { ...input, ...overrides }, admin, now), admin, now)
  for (let i = 0; i < count; i++) t = registerForTournament(t, user(`p${i}`), null, now + i)
  return t
}
function running(overrides: Partial<TournamentInput> = {}, count?: number): Tournament {
  return startTournament(registered(overrides, count), admin, 123, input.startsAt)
}
function roundScores(t: Tournament, a = 14, b = 10): TournamentScore[] {
  return Object.values(t.matches).filter(m => m.round === t.currentRound).map(m => makeTournamentScore(t, m.id, a, b, admin, undefined, 0, input.startsAt))
}

describe('tournament domain', () => {
  it('lets every signed-in member create a private draft and locks configuration on publish', () => {
    expect(() => makeTournament('qa', input, '', now)).toThrow(/Accedi/)
    const draft = makeTournament('qa', input, 'organizer', now)
    expect(draft).toMatchObject({ published: false, status: 'draft', createdBy: 'organizer', registrations: {}, matches: {} })
    expect(editTournament(draft, { ...input, title: 'Nuovo nome' }, 'organizer', now).title).toBe('Nuovo nome')
    const published = publishTournament(draft, 'organizer', now)
    expect(published.published).toBe(true)
    expect(() => editTournament(published, input, admin, now)).toThrow(/bloccate/)
    expect(() => publishTournament(published, admin, now)).toThrow(/bozza/)
  })
  it.each(['organizer', admin])('allows creator and admin management throughout the lifecycle: %s', actor => {
    const draft = makeTournament('qa', { ...input, capacity: 4, rounds: 1, scoreAccess: 'admin' }, 'organizer', now)
    const edited = editTournament(draft, { ...draft, title: 'Coppa privata' }, actor, now)
    let t = publishTournament(edited, actor, now)
    for (let i = 0; i < 4; i++) t = registerForTournament(t, user(`p${i}`), null, now)
    t = startTournament(t, actor, 12, input.startsAt)
    const score = makeTournamentScore(t, 'r1-m1', 14, 10, actor, undefined, 0, input.startsAt)
    expect(advanceTournament(t, [score], actor, input.startsAt).status).toBe('completed')
    expect(cancelTournament(t, actor, input.startsAt).status).toBe('cancelled')
    expect(t.createdBy).toBe('organizer')
  })
  it('rejects management of other members’ tournaments', () => {
    const draft = makeTournament('qa', input, 'organizer', now)
    expect(() => editTournament(draft, input, 'p0', now)).toThrow(/organizzatore/)
    expect(() => publishTournament(draft, 'p0', now)).toThrow(/organizzatore/)
    expect(() => cancelTournament(draft, 'p0', now)).toThrow(/organizzatore/)
    const open = { ...registered(), createdBy: 'organizer' }
    expect(() => startTournament(open, 'p0', 1, input.startsAt)).toThrow(/organizzatore/)
    const t = startTournament(open, 'organizer', 1, input.startsAt)
    expect(() => advanceTournament(t, roundScores(t), 'p0', input.startsAt)).toThrow(/organizzatore/)
    expect(() => makeTournamentScore({ ...t, scoreAccess: 'admin' }, 'r1-m1', 14, 10, 'p0', undefined, 0, input.startsAt)).toThrow(/tue partite/)
  })
  it.each([
    { startsAt: now + 3_600_000 }, { courts: 0 }, { courts: 9 }, { rounds: 32 }, { pointsPerMatch: 25 },
    { capacity: 7 }, { capacity: 36 }, { pairing: 'chosen-fixed' }, { title: '  ' }, { venueId: 'invalid' },
    { format: 'knockout', pairing: 'random-fixed', capacity: 12 },
    { format: 'round-robin', pairing: 'random-fixed', capacity: 4 },
  ])('rejects unsupported settings: %j', override => {
    expect(() => validateTournamentInput({ ...input, ...override } as TournamentInput, now)).toThrow()
  })
  it('enforces the exact one-hour cutoff for joining, leaving, partner choice and drawing', () => {
    const t = registered({}, 4), cutoff = t.startsAt - 3_600_000
    expect(tournamentRegistrationsOpen(t, cutoff - 1)).toBe(true)
    expect(tournamentRegistrationsOpen(t, cutoff)).toBe(false)
    expect(registerForTournament(t, user('new'), null, cutoff - 1).registrations.new).toBeTruthy()
    expect(() => registerForTournament(t, user('new'), null, cutoff)).toThrow(/chiudono/)
    expect(() => leaveTournament(t, 'p0', cutoff)).toThrow(/chiuse/)
    expect(() => startTournament(t, admin, 1, cutoff - 1)).toThrow(/chiusura/)
    expect(startTournament(t, admin, 1, cutoff).status).toBe('running')
  })
  it('caps registrations, preserves original order on changes and never registers a partner implicitly', () => {
    const t = registered()
    expect(() => registerForTournament(t, user('extra'), null, now)).toThrow(/completo/)
    const same = registerForTournament(t, user('p0'), null, now + 100)
    expect(same.registrations.p0.joinedAt).toBe(t.registrations.p0.joinedAt)
    expect(Object.keys(same.registrations)).toHaveLength(8)
    expect(() => registerForTournament(t, user('p0'), 'p1', now)).toThrow(/Scegli/)
    expect(Object.keys(leaveTournament(t, 'p0', now).registrations)).toHaveLength(7)
  })
  it('requires reciprocal chosen partners, keeps a partner choice unconfirmed after withdrawal', () => {
    let t = registered({ format: 'round-robin', pairing: 'chosen-fixed' })
    expect(() => registerForTournament(t, user('p0'), 'missing', now)).toThrow()
    expect(() => registerForTournament(t, user('p0'), 'p0', now)).toThrow()
    t = registerForTournament(t, user('p0'), 'p1', now)
    expect(t.registrations.p1.partnerId).toBeNull()
    expect(() => startTournament(t, admin, 123, input.startsAt)).toThrow(/reciprocamente/)
    for (let i = 0; i < 8; i++) t = registerForTournament(t, user(`p${i}`), `p${i ^ 1}`, now)
    const started = startTournament(t, admin, 123, input.startsAt)
    expect(started.teams.map(x => [...x.playerIds].sort().join(','))).toEqual(expect.arrayContaining(['p0,p1', 'p2,p3', 'p4,p5', 'p6,p7']))
    const withdrawn = leaveTournament(t, 'p1', now)
    expect(withdrawn.registrations.p0.partnerId).toBe('p1')
    expect(withdrawn.registrations.p1).toBeUndefined()
  })
  it.each([4, 8, 12, 32])('Americano: %i players meet every partner exactly once in a full cycle', count => {
    const t = running({ capacity: count, rounds: count - 1, courts: 2 })
    const partners = new Map<string, Set<string>>()
    for (let r = 1; r < count; r++) {
      const matches = Object.values(t.matches).filter(m => m.round === r)
      const ids = matches.flatMap(m => [...m.teamA.playerIds, ...m.teamB.playerIds])
      expect(ids).toHaveLength(count)
      expect(new Set(ids).size).toBe(count)
      expect(new Set(matches.map(m => `${m.court}/${m.wave}`)).size).toBe(matches.length)
      for (const team of matches.flatMap(m => [m.teamA, m.teamB])) for (const id of team.playerIds) {
        const set = partners.get(id) ?? new Set<string>()
        const other = team.playerIds.find(p => p !== id)!
        expect(set.has(other)).toBe(false)
        set.add(other); partners.set(id, set)
      }
    }
    expect([...partners.values()].every(p => p.size === count - 1)).toBe(true)
  })
  it.each([6, 8, 10, 32])('round robin: %i players, every pair of teams once, equal games including byes', count => {
    const t = running({ format: 'round-robin', pairing: 'random-fixed', capacity: count })
    const matches = Object.values(t.matches), teamCount = count / 2
    expect(matches).toHaveLength(teamCount * (teamCount - 1) / 2)
    expect(new Set(matches.map(m => [m.teamA.id, m.teamB.id].sort().join('|'))).size).toBe(matches.length)
    for (const team of t.teams) expect(matches.filter(m => m.teamA.id === team.id || m.teamB.id === team.id)).toHaveLength(teamCount - 1)
    for (let r = 1; r <= t.totalRounds; r++) {
      const ids = matches.filter(m => m.round === r).flatMap(m => [...m.teamA.playerIds, ...m.teamB.playerIds])
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
  it('draws are deterministic and never shuffle an already-started tournament', () => {
    const t = registered()
    expect(startTournament(t, admin, 12, input.startsAt)).toEqual(startTournament(t, admin, 12, input.startsAt))
    expect(startTournament(t, admin, 12, input.startsAt).matches).not.toEqual(startTournament(t, admin, 13, input.startsAt).matches)
    expect(() => startTournament(running(), admin, 12, input.startsAt)).toThrow()
    expect(() => startTournament(registered({}, 7), admin, 1, input.startsAt)).toThrow(/multiplo/)
  })
  it('Mexicano waits for all results, then groups neighboring ranks into 1+4 versus 2+3', () => {
    const t = running({ format: 'mexicano', rounds: 3 })
    expect(Object.values(t.matches)).toHaveLength(2)
    const scores = roundScores(t, 20, 4)
    expect(() => advanceTournament(t, scores.slice(0, 1), admin, input.startsAt)).toThrow(/Completa/)
    const next = advanceTournament(t, scores, admin, input.startsAt)
    expect(next.currentRound).toBe(2)
    const leaders = getTournamentStandings(t, scores).filter(s => s.rank === 1).map(s => s.id).sort()
    const first = next.matches['r2-m1']
    expect([...first.teamA.playerIds, ...first.teamB.playerIds].sort()).toEqual(leaders)
    expect(advanceTournament(t, scores, admin, input.startsAt)).toEqual(next)
  })
  it.each([8, 16, 32])('knockout: %i entrants produce a final, bronze match and correct full podium', count => {
    let t = running({ format: 'knockout', pairing: 'random-fixed', capacity: count })
    let scores: TournamentScore[] = []
    while (t.status !== 'completed') {
      scores = [...scores, ...roundScores(t, 6, 3)]
      if (t.currentRound === t.totalRounds) {
        expect(() => advanceTournament(t, scores.filter(s => s.matchId !== `r${t.currentRound}-m2`), admin, input.startsAt)).toThrow(/Completa/)
      }
      t = advanceTournament(t, scores, admin, input.startsAt)
    }
    const final = Object.values(t.matches).find(m => m.stage === 'final')!
    const bronze = Object.values(t.matches).find(m => m.stage === 'bronze')!
    const standings = getTournamentStandings(t, scores)
    expect(standings.slice(0, 4).map(r => [r.rank, r.id])).toEqual([[1, final.teamA.id], [2, final.teamB.id], [3, bronze.teamA.id], [4, bronze.teamB.id]])
    expect(standings.every(s => s.rank > 0)).toBe(true)
    expect(() => makeTournamentScore(t, final.id, 6, 2, admin, scores.find(s => s.matchId === final.id), 1, input.startsAt)).toThrow(/corrente/)
  })
  it('ranking ties share places instead of inventing an alphabetical winner', () => {
    const t = running({ capacity: 4, rounds: 1 })
    const scores = roundScores(t, 12, 12)
    const ended = advanceTournament(t, scores, admin, input.startsAt)
    expect(getTournamentStandings(ended, scores).map(s => [s.rank, s.tied, s.pointsFor])).toEqual(Array.from({ length: 4 }, () => [1, true, 12]))
    expect(getTournamentStandings(t, roundScores(t)).map(s => s.rank)).toEqual([1, 1, 3, 3])
  })
  it.each([[6, 0, true], [6, 4, true], [7, 5, true], [6, 7, true], [6, 5, false], [6, 6, false], [8, 6, false], [-1, 6, false], [3.5, 6, false]])('validates completed set %i–%i: %s', (a, b, valid) => {
    expect(tournamentScoreIsValid({ format: 'knockout', pointsPerMatch: 24 }, a as number, b as number)).toBe(valid)
  })
  it('only current-match participants or admin may score; rejects stale, premature and frozen edits', () => {
    const t = running(), m = Object.values(t.matches)[0], player = m.teamA.playerIds[0]
    const score = makeTournamentScore(t, m.id, 14, 10, player, undefined, 0, input.startsAt)
    expect(score.revision).toBe(1)
    expect(() => makeTournamentScore(t, m.id, 14, 10, 'spectator', undefined, 0, input.startsAt)).toThrow(/tue partite/)
    const otherPlayer = Object.keys(t.registrations).find(id => ![...m.teamA.playerIds, ...m.teamB.playerIds].includes(id))!
    expect(() => makeTournamentScore(t, m.id, 14, 10, otherPlayer, undefined, 0, input.startsAt)).toThrow(/tue partite/)
    expect(() => makeTournamentScore(t, m.id, 14, 10, admin, undefined, 0, input.startsAt - 1)).toThrow(/inizio/)
    expect(() => makeTournamentScore(t, m.id, 14, 9, player, undefined, 0, input.startsAt)).toThrow(/24/)
    expect(() => makeTournamentScore(t, m.id, 16, 8, player, score, 0, input.startsAt)).toThrow(/Qualcuno/)
    expect(makeTournamentScore(t, m.id, 16, 8, player, score, 1, input.startsAt).revision).toBe(2)
    expect(() => makeTournamentScore({ ...t, scoreAccess: 'admin' }, m.id, 14, 10, player, undefined, 0, input.startsAt)).toThrow(/tue partite/)
    const next = advanceTournament(t, roundScores(t), admin, input.startsAt)
    expect(() => makeTournamentScore(next, m.id, 14, 10, admin, score, 1, input.startsAt)).toThrow(/corrente/)
    expect(() => advanceTournament(t, roundScores(t), player, input.startsAt)).toThrow(/amministratore/)
  })
  it('cancellation preserves history and disables registration/results', () => {
    const t = running(), cancelled = cancelTournament(t, admin, input.startsAt)
    expect(cancelled.matches).toEqual(t.matches)
    expect(cancelled.registrations).toEqual(t.registrations)
    expect(tournamentRegistrationsOpen(cancelled, now)).toBe(false)
    expect(() => makeTournamentScore(cancelled, 'r1-m1', 14, 10, admin, undefined, 0, input.startsAt)).toThrow()
  })
})

describe('local tournament persistence', () => {
  beforeEach(() => { localStorage.removeItem('bandeja-tournaments-v1'); vi.spyOn(Date, 'now').mockReturnValue(now) })
  afterEach(() => vi.restoreAllMocks())
  it('keeps drafts private, publishes live updates, and respects permissions and score revisions', async () => {
    const repo = localTournamentRepository(), organizer = user('organizer')
    const visible = vi.fn(), privateList = vi.fn(), ownList = vi.fn(), ownDetail = vi.fn(), failed = vi.fn()
    const off = repo.subscribeTournaments('p0', visible, failed)
    const offAdmin = repo.subscribeTournaments(admin, privateList, failed)
    const offOwner = repo.subscribeTournaments(organizer.id, ownList, failed)
    const id = await repo.createTournament({ ...input, capacity: 4, rounds: 1 }, organizer)
    expect(visible).toHaveBeenLastCalledWith([])
    expect(privateList.mock.lastCall?.[0]).toHaveLength(1)
    expect(ownList.mock.lastCall?.[0]).toHaveLength(1)
    const offOwnDetail = repo.subscribeTournament(id, organizer.id, ownDetail, failed)
    expect(ownDetail).toHaveBeenLastCalledWith(expect.objectContaining({ id, status: 'draft', createdBy: organizer.id }))
    const offPrivate = repo.subscribeTournament(id, 'p0', vi.fn(), failed)
    expect(failed).toHaveBeenCalledWith(expect.objectContaining({ message: 'Questa bozza è privata.' }))
    offPrivate()
    await expect(repo.actOnTournament(id, 'publish', user('p0'))).rejects.toThrow(/amministratore/)
    await repo.actOnTournament(id, 'publish', organizer)
    expect(visible.mock.lastCall?.[0]).toHaveLength(1)
    expect(ownList.mock.lastCall?.[0]).toHaveLength(1)
    for (let i = 0; i < 4; i++) await repo.registerForTournament(id, null, user(`p${i}`))
    vi.spyOn(Date, 'now').mockReturnValue(input.startsAt)
    await repo.actOnTournament(id, 'start', organizer)
    const listener = vi.fn(), offScores = repo.subscribeTournamentScores(id, listener, failed)
    await repo.saveTournamentScore(id, 'r1-m1', 14, 10, 0, user('p0'))
    await expect(repo.saveTournamentScore(id, 'r1-m1', 12, 12, 0, user('p1'))).rejects.toThrow(/Qualcuno/)
    await repo.saveTournamentScore(id, 'r1-m1', 12, 12, 1, user('p1'))
    expect(listener.mock.lastCall?.[0][0]).toMatchObject({ scoreA: 12, scoreB: 12, revision: 2 })
    await repo.actOnTournament(id, 'advance', organizer)
    expect(visible.mock.lastCall?.[0][0].status).toBe('completed')
    off(); offAdmin(); offOwner(); offOwnDetail(); offScores()
  })
})
