import type { FantasyRound } from '../types'

export interface FantasySeason {
  id: 'summer-2026' | 'winter-2026-27'
  label: string
  eyebrow: string
  startsAt: number
  endsAt?: number
}

// Midnight at the start of 28 September 2026 in Europe/Rome (CEST, UTC+2).
export const FANTASY_SUMMER_2026_ENDS_AT = Date.parse('2026-09-27T22:00:00.000Z')

export const FANTASY_SEASONS: readonly FantasySeason[] = [
  {
    id: 'summer-2026',
    label: 'Estate 2026',
    eyebrow: 'Prima stagione',
    startsAt: 0,
    endsAt: FANTASY_SUMMER_2026_ENDS_AT,
  },
  {
    id: 'winter-2026-27',
    label: 'Inverno 2026/27',
    eyebrow: 'Seconda stagione',
    startsAt: FANTASY_SUMMER_2026_ENDS_AT,
  },
]

export function getFantasySeasonAt(timestamp: number): FantasySeason {
  return [...FANTASY_SEASONS]
    .reverse()
    .find((season) => timestamp >= season.startsAt) ?? FANTASY_SEASONS[0]
}

export function getFantasySeasonForRound(
  round: Pick<FantasyRound, 'locksAt'>,
): FantasySeason {
  // The match start decides the season, not the later settlement time.
  return getFantasySeasonAt(round.locksAt)
}

export function fantasySeasonIsArchived(season: FantasySeason, now: number): boolean {
  return typeof season.endsAt === 'number' && now >= season.endsAt
}

export function fantasySeasonIsUpcoming(season: FantasySeason, now: number): boolean {
  return now < season.startsAt
}

export interface FantasySeasonCountdown {
  totalMilliseconds: number
  days: number
  hours: number
  minutes: number
  seconds: number
}

export function getFantasySeasonCountdown(
  targetAt: number,
  now: number,
): FantasySeasonCountdown {
  const totalMilliseconds = Math.max(0, targetAt - now)
  const totalSeconds = Math.floor(totalMilliseconds / 1_000)

  return {
    totalMilliseconds,
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  }
}
