import { describe, expect, it } from 'vitest'
import {
  FANTASY_SUMMER_2026_ENDS_AT,
  fantasySeasonIsArchived,
  fantasySeasonIsUpcoming,
  getFantasySeasonAt,
  getFantasySeasonCountdown,
  getFantasySeasonForRound,
} from './fantasySeasons'

describe('fantasy seasons', () => {
  it('keeps the whole 27 September in summer and starts winter at Rome midnight', () => {
    expect(FANTASY_SUMMER_2026_ENDS_AT).toBe(Date.parse('2026-09-27T22:00:00.000Z'))
    expect(getFantasySeasonAt(FANTASY_SUMMER_2026_ENDS_AT - 1).id).toBe('summer-2026')
    expect(getFantasySeasonAt(FANTASY_SUMMER_2026_ENDS_AT).id).toBe('winter-2026-27')
  })

  it('assigns a round from its match start rather than its settlement time', () => {
    expect(getFantasySeasonForRound({ locksAt: FANTASY_SUMMER_2026_ENDS_AT - 1 }).id)
      .toBe('summer-2026')
    expect(getFantasySeasonForRound({ locksAt: FANTASY_SUMMER_2026_ENDS_AT }).id)
      .toBe('winter-2026-27')
  })

  it('distinguishes archived and upcoming seasons at the boundary', () => {
    const summer = getFantasySeasonAt(FANTASY_SUMMER_2026_ENDS_AT - 1)
    const winter = getFantasySeasonAt(FANTASY_SUMMER_2026_ENDS_AT)

    expect(fantasySeasonIsArchived(summer, FANTASY_SUMMER_2026_ENDS_AT)).toBe(true)
    expect(fantasySeasonIsUpcoming(winter, FANTASY_SUMMER_2026_ENDS_AT - 1)).toBe(true)
  })

  it('returns a countdown that reaches zero without becoming negative', () => {
    expect(getFantasySeasonCountdown(100_000_000, 6_215_000)).toEqual({
      totalMilliseconds: 93_785_000,
      days: 1,
      hours: 2,
      minutes: 3,
      seconds: 5,
    })
    expect(getFantasySeasonCountdown(100, 101)).toEqual({
      totalMilliseconds: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    })
  })
})
