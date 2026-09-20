import type { SessionUser } from '../types'
import { SLOT_ADMIN_USER_ID } from './admin'
import { getTournamentRoundClock, getTournamentSimulationScore, makeTournamentSimulation } from './domain'
import { localTournamentRepository, type LocalTournamentStore } from './tournamentRepository'
import type { TournamentInput } from './tournamentTypes'

export const SIMULATION_STORAGE = `bandeja-private-tournament-v1:${SLOT_ADMIN_USER_ID}`
const CLOCK_STORAGE = `${SIMULATION_STORAGE}:clock`
export const SIMULATION_EVENT = `${SIMULATION_STORAGE}:updated`

export function resetTournamentSimulation(user: SessionUser, source?: TournamentInput) {
  const t = makeTournamentSimulation(user.id, source, Date.now())
  localStorage.setItem(SIMULATION_STORAGE, JSON.stringify({ tournaments: [t], scores: {} }))
  localStorage.setItem(CLOCK_STORAGE, '0')
  window.dispatchEvent(new Event(SIMULATION_EVENT))
}

/** Browser-only sandbox: deliberately has no remote repository or Firebase client. */
export function openTournamentSimulation(user: SessionUser) {
  if (user.id !== SLOT_ADMIN_USER_ID) throw new Error('La simulazione è riservata a Jury.')
  const read = (): LocalTournamentStore => {
    const store = JSON.parse(localStorage.getItem(SIMULATION_STORAGE) ?? '{"tournaments":[],"scores":{}}') as LocalTournamentStore
    if (!Array.isArray(store.tournaments) || !store.scores || store.tournaments.some(t => t.id !== 'simulation-private' || t.createdBy !== user.id)) throw new Error('Prova locale non leggibile. Prepara una nuova prova locale per ricominciare.')
    return store
  }
  const getNow = () => {
    const offset = Number(localStorage.getItem(CLOCK_STORAGE) ?? 0)
    return Date.now() + (Number.isFinite(offset) && offset >= 0 ? offset : 0)
  }
  const notify = () => window.dispatchEvent(new Event(SIMULATION_EVENT))
  const reset = (source?: TournamentInput) => resetTournamentSimulation(user, source)
  if (!read().tournaments.length) reset()
  const repository = localTournamentRepository({ storageKey: SIMULATION_STORAGE, now: getNow })
  return {
    repository, now: getNow, simulation: true as const, clockEvent: SIMULATION_EVENT,
    reset,
    jump(step: 'cutoff' | 'start' | 'end-round') {
      const t = read().tournaments[0]
      const clock = getTournamentRoundClock(t, getNow())
      if (step === 'end-round' && clock.state !== 'running') throw new Error('Avvia prima il timer del turno.')
      const target = step === 'cutoff' ? t.startsAt - 3_600_000 : step === 'start' ? t.startsAt : clock.endsAt!
      localStorage.setItem(CLOCK_STORAGE, String(Math.max(0, Math.max(getNow(), target) - Date.now())))
      notify()
    },
    async fillScores() {
      const store = read(), t = store.tournaments[0]
      if (t.status !== 'running') throw new Error('Prepara prima il tabellone.')
      const existing = new Set((store.scores[t.id] ?? []).map(s => s.matchId))
      for (const match of Object.values(t.matches).filter(m => m.round === t.currentRound && !existing.has(m.id))) {
        const [a, b] = getTournamentSimulationScore(t, match)
        await repository.saveTournamentScore(t.id, match.id, a, b, 0, user)
      }
    },
  }
}
export type TournamentSimulationSession = ReturnType<typeof openTournamentSimulation>
