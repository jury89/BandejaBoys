import { SLOT_ADMIN_USER_ID } from './admin'
import { getTournamentStandings, makeTournamentSimulation, tournamentUsesTimedMatches } from './domain'
import { localTournamentRepository, type LocalTournamentStore } from './tournamentRepository'
import { openTournamentSimulation, resetTournamentSimulation, SIMULATION_STORAGE } from './tournamentSimulation'
import type { TournamentInput } from './tournamentTypes'

const now = Date.UTC(2026, 9, 1, 10)
const admin = { id: SLOT_ADMIN_USER_ID, displayName: 'Jury', email: 'jury@example.test', createdAt: 1 }
const read = () => JSON.parse(localStorage.getItem(SIMULATION_STORAGE)!) as LocalTournamentStore
const realStore = JSON.stringify({ tournaments: [], scores: {}, sentinel: 'never touch real/demo data' })

describe('private tournament simulation', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('bandeja-tournaments-v1', realStore)
    vi.spyOn(Date, 'now').mockReturnValue(now)
  })
  afterEach(() => vi.restoreAllMocks())

  it('rejects other accounts before reading or writing private browser data', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem'), set = vi.spyOn(Storage.prototype, 'setItem')
    const other = { ...admin, id: 'member' }
    expect(() => openTournamentSimulation(other)).toThrow(/riservata/)
    expect(() => resetTournamentSimulation(other)).toThrow(/riservata/)
    expect(get).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })

  it('prepares ten fictional entrants without changing shared/demo storage or the real clock', () => {
    const session = openTournamentSimulation(admin), t = read().tournaments[0]
    expect(t).toMatchObject({ id: 'simulation-private', format: 'round-robin', scoringMode: 'timed', capacity: 10, courts: 2, totalMinutes: 90 })
    expect(Object.values(t.registrations)).toHaveLength(10)
    expect(Object.values(t.registrations).every(r => r.userId.startsWith('guest:simulation-') && r.displayName.startsWith('Fagiano '))).toBe(true)
    session.jump('cutoff')
    expect(session.now()).toBe(t.startsAt - 3_600_000)
    expect(Date.now()).toBe(now)
    expect(localStorage.getItem('bandeja-tournaments-v1')).toBe(realStore)
    const listener = vi.fn()
    const unsub = localTournamentRepository().subscribeTournaments(admin.id, listener, vi.fn())
    expect(listener).toHaveBeenLastCalledWith([])
    unsub()
  })

  it('copies only configuration, not real identities, registrations, ownership, draws or scores', () => {
    const source = makeTournamentSimulation(admin.id, undefined, now)
    source.id = 'real-tournament'; source.createdBy = 'real-owner'
    source.registrations = { private: { userId: 'real-id', displayName: 'Real Player', partnerId: null, joinedAt: now } }
    source.currentRound = 4; source.seed = 981
    source.pairing = 'chosen-fixed'; source.capacity = 12
    const original = JSON.stringify(source)
    resetTournamentSimulation(admin, source)
    const t = read().tournaments[0]
    expect(JSON.stringify(source)).toBe(original)
    expect(t).toMatchObject({ id: 'simulation-private', createdBy: admin.id, currentRound: 0, capacity: 12, pairing: 'chosen-fixed', matches: {} })
    expect(Object.values(t.registrations)).toHaveLength(12)
    for (const r of Object.values(t.registrations)) expect(t.registrations[r.partnerId!].partnerId).toBe(r.userId)
    expect(JSON.stringify(read())).not.toContain('Real Player')
    expect(read().scores).toEqual({})
  })

  it.each([
    ['round-robin', 'timed', 10], ['round-robin', 'standard', 6],
    ['americano', 'standard', 8], ['mexicano', 'standard', 8], ['knockout', 'standard', 8],
  ] as const)('runs %s/%s through the real rules to the podium, persisting reloads', async (format, scoringMode, capacity) => {
    const input: TournamentInput = { title: 'Test privata', startsAt: now, format, scoringMode, capacity, courts: 2, venueId: 'sport-city-mantova', pairing: format === 'americano' || format === 'mexicano' ? 'rotating' : 'random-fixed', rounds: 3, pointsPerMatch: 24, scoreAccess: 'players', totalMinutes: scoringMode === 'timed' ? 90 : null }
    resetTournamentSimulation(admin, input)
    let session = openTournamentSimulation(admin)
    session.jump('cutoff')
    await session.repository.actOnTournament('simulation-private', 'start', admin)
    for (let round = 0; round < 20 && read().tournaments[0].status === 'running'; round++) {
      const t = read().tournaments[0]
      if (tournamentUsesTimedMatches(t)) await session.repository.actOnTournament(t.id, 'start-round', admin)
      await session.fillScores()
      if (tournamentUsesTimedMatches(t)) session.jump('end-round')
      await session.repository.actOnTournament(t.id, 'advance', admin)
      const previous = JSON.stringify(read()), clock = session.now()
      session = openTournamentSimulation(admin)
      expect(JSON.stringify(read())).toBe(previous)
      expect(session.now()).toBe(clock)
    }
    const t = read().tournaments[0]
    expect(t.status).toBe('completed')
    expect(getTournamentStandings(t, read().scores[t.id]).filter(row => row.rank <= 3).length).toBeGreaterThanOrEqual(3)
    expect(localStorage.getItem('bandeja-tournaments-v1')).toBe(realStore)
    session.reset(t)
    expect(read().tournaments[0]).toMatchObject({ status: 'open', matches: {}, currentRound: 0 })
    expect(read().scores).toEqual({})
    expect(session.now()).toBe(now)
    expect(localStorage.getItem('bandeja-tournaments-v1')).toBe(realStore)
  })

  it('does not skip timing checks or overwrite manually entered results', async () => {
    const session = openTournamentSimulation(admin), id = 'simulation-private'
    await expect(session.fillScores()).rejects.toThrow(/tabellone/)
    expect(() => session.jump('end-round')).toThrow(/timer/)
    session.jump('start')
    await session.repository.actOnTournament(id, 'start', admin)
    await expect(session.fillScores()).rejects.toThrow()
    await session.repository.actOnTournament(id, 'start-round', admin)
    const match = Object.values(read().tournaments[0].matches).find(m => m.round === 1)!
    await session.repository.saveTournamentScore(id, match.id, 7, 1, 0, admin)
    const manual = read().scores[id][0]
    await session.fillScores()
    expect(read().scores[id].find(s => s.matchId === match.id)).toEqual(manual)
    await expect(session.repository.actOnTournament(id, 'advance', admin)).rejects.toThrow()
    session.jump('end-round')
    await session.repository.actOnTournament(id, 'advance', admin)
    expect(read().tournaments[0].currentRound).toBe(2)
  })

  it('recovers only private corrupted data through an explicit reset', () => {
    localStorage.setItem(SIMULATION_STORAGE, 'invalid json')
    expect(() => openTournamentSimulation(admin)).toThrow()
    resetTournamentSimulation(admin)
    expect(openTournamentSimulation(admin).simulation).toBe(true)
    expect(localStorage.getItem('bandeja-tournaments-v1')).toBe(realStore)
  })
})
