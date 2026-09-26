import type { VenueId } from '../types'

export type TournamentFormat = 'americano' | 'mexicano' | 'round-robin' | 'knockout'
export type TournamentPairing = 'rotating' | 'random-fixed' | 'chosen-fixed'
export interface TournamentInput {
  title: string
  startsAt: number
  venueId: VenueId
  format: TournamentFormat
  pairing: TournamentPairing
  capacity: number
  courts: number
  rounds: number
  pointsPerMatch: number
  scoreAccess: 'players' | 'admin'
  // Missing fields on existing tournaments preserve the original scoring rules.
  scoringMode?: 'standard' | 'timed'
  matchMinutes?: number
  warmupMinutes?: number
  changeoverMinutes?: number
  // A total budget enables adaptive scheduling. Absent/null preserves legacy timed draws.
  totalMinutes?: number | null
}
export type TournamentOrganization = Pick<TournamentInput, 'capacity' | 'courts' | 'warmupMinutes' | 'changeoverMinutes'> & { totalMinutes: number }
export interface TournamentRegistration {
  userId: string
  displayName: string
  joinedAt: number
  partnerId: string | null
  isGuest?: true
}
export interface TournamentTeam { id: string; playerIds: [string, string] }
export interface TournamentMatch {
  id: string
  round: number
  court: number
  wave: number
  teamA: TournamentTeam
  teamB: TournamentTeam
  stage: 'regular' | 'final' | 'bronze'
}
export interface Tournament extends TournamentInput {
  id: string
  published: boolean
  status: 'draft' | 'open' | 'running' | 'completed' | 'cancelled'
  createdBy: string
  createdAt: number
  updatedAt: number
  registrations: Record<string, TournamentRegistration>
  // A changing marker routes rename-only writes through narrow Security Rules.
  guestNameChange?: { guestId: string; revision: number }
  teams: TournamentTeam[]
  matches: Record<string, TournamentMatch>
  currentRound: number
  totalRounds: number
  seed: number
  roundStartedAt?: number | null
  // Explicit organizer stop; absent on legacy/naturally expired rounds.
  roundEndedAt?: number | null
}
export interface TournamentScore {
  matchId: string
  scoreA: number
  scoreB: number
  updatedBy: string
  updatedAt: number
  revision: number
}
export interface TournamentStanding {
  id: string
  playerIds: string[]
  played: number
  wins: number
  draws: number
  tablePoints: number
  pointsFor: number
  pointsAgainst: number
  rank: number
  tied: boolean
}

export const TOURNAMENT_FORMATS: ReadonlyArray<{ id: TournamentFormat; name: string; description: string; scoring: string }> = [
  { id: 'americano', name: 'Americano', description: 'Classifica individuale. Il calendario ruota i compagni: in un ciclo completo ciascuno gioca una volta con ogni altro iscritto. Tutti giocano lo stesso numero di partite.', scoring: 'Punti conquistati, poi differenza punti e vittorie. A parità completa il piazzamento è condiviso.' },
  { id: 'mexicano', name: 'Mexicano', description: 'Classifica individuale. Primo turno casuale, poi gruppi di quattro vicini in classifica: 1° + 4° contro 2° + 3°. Gli abbinamenti si aggiornano a ogni turno e i compagni possono ripetersi.', scoring: 'Punti conquistati, poi differenza punti e vittorie. A parità completa il piazzamento è condiviso.' },
  { id: 'round-robin', name: 'Girone all’italiana', description: 'Coppie fisse: ciascuna affronta tutte le altre una volta. Scegli se sorteggiare i compagni o lasciare che i giocatori si scelgano a vicenda.', scoring: 'Vittorie, poi differenza game e game vinti. A parità completa il piazzamento è condiviso.' },
  { id: 'knockout', name: 'Eliminazione diretta', description: 'Coppie fisse in un tabellone sorteggiato. Chi perde è eliminato; i perdenti delle semifinali giocano la finale per il terzo posto. Servono 8, 16 o 32 giocatori.', scoring: 'La finale assegna primo e secondo posto; la finalina assegna il terzo. Ogni incontro è un set a 6 game, tie-break sul 6–6.' },
]
