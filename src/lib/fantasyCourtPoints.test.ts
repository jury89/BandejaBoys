import { describe, expect, it } from 'vitest'
import type { FantasyRound, MatchFeedbackSummary, MatchReport, PadelPoll, PadelSlot } from '../types'
import { getFantasyCourtStandings, getFantasyLeaderboard, makeFantasyEntry, makeFantasyRound, scoreFantasyRound } from './domain'
import { FANTASY_SUMMER_2026_ENDS_AT, getFantasySeasonForRound } from './fantasySeasons'

function scoredMatch(locksAt = FANTASY_SUMMER_2026_ENDS_AT) {
  const participants = ['a', 'b', 'c', 'd'].map((userId) => ({ userId, displayName: userId.toUpperCase() }))
  const slot: PadelSlot = {
    id: 'slot', startsAt: new Date(locksAt).toISOString(), durationMinutes: 90,
    bookedAt: 1, bookedBy: 'a', bookedByName: 'A', venue: 'Oasi Boschetto',
    signups: participants.map((player, index) => ({ ...player, id: player.userId, joinedAt: index + 1 })),
  }
  const poll: PadelPoll = { id: 'poll', title: 'Partita test', targetWeekStart: '2026-09-21', createdAt: 1, updatedAt: 1, createdBy: 'a', createdByName: 'A', status: 'open', slots: [slot] }
  const round = makeFantasyRound(poll, slot, locksAt - 60_000)!
  const report: MatchReport = {
    id: round.id, pollId: poll.id, pollTitle: poll.title, slotId: slot.id, sessionStartsAt: slot.startsAt,
    participantIds: participants.map((player) => player.userId), participants,
    sets: [1, 2].map((n) => ({ id: `set-${n}`, teamA: [participants[0], participants[1]], teamB: [participants[2], participants[3]], scoreA: 6, scoreB: 0 })),
    createdAt: round.slotEndsAt, updatedAt: round.slotEndsAt, createdBy: 'a', updatedBy: 'a', createdByName: 'A', updatedByName: 'A',
  }
  const summaries: MatchFeedbackSummary[] = participants.map((player, index) => ({
    id: player.userId, pollId: poll.id, slotId: slot.id, playerId: player.userId,
    scoreUnitsTotal: [48, 36, 54, 24][index], ratingCount: 3, lastResponseId: player.userId, updatedAt: round.slotEndsAt,
  }))
  const entries = [
    makeFantasyEntry(round, { id: 'manager', displayName: 'Manager', email: 'm@example.test', createdAt: 1 }, { playerIds: ['a', 'c'], captainId: 'c' }, undefined, locksAt - 1),
    makeFantasyEntry(round, { id: 'other', displayName: 'Other', email: 'o@example.test', createdAt: 1 }, { playerIds: ['b', 'd'], captainId: 'b' }, undefined, locksAt - 1),
  ]
  return scoreFantasyRound(round, entries, report, summaries, round.slotEndsAt + 48 * 60 * 60_000)
}

describe('punti dei giocatori in campo per stagione', () => {
  it('dalla mezzanotte romana usa totale individuale e 5/3/1/0, non la sola media dei giudizi', () => {
    const round = scoredMatch()
    const standings = getFantasyCourtStandings(round)
    expect(standings.map(({ userId, fantasyScore, rank, leaguePoints }) => ({ userId, fantasyScore, rank, leaguePoints }))).toEqual([
      { userId: 'a', fantasyScore: 10, rank: 1, leaguePoints: 5 },
      { userId: 'c', fantasyScore: 8.5, rank: 2, leaguePoints: 3 },
      { userId: 'b', fantasyScore: 8, rank: 3, leaguePoints: 1 },
      { userId: 'd', fantasyScore: 3.5, rank: 4, leaguePoints: 0 },
    ])
    expect(round.playerScores?.find((score) => score.userId === 'c')?.isTopPerformer).toBe(true)
    const rows = getFantasyLeaderboard([round])
    expect(rows.find((row) => row.managerId === 'a')).toMatchObject({ leaguePoints: 5, wins: 0, contributions: [{ source: 'court-placement', rank: 1 }] })
    expect(rows.find((row) => row.managerId === 'd')).toMatchObject({ leaguePoints: 0, roundsPlayed: 1, contributions: [{ source: 'court-placement', rank: 4, leaguePoints: 0 }] })
  })

  it('conserva il 2/3 estivo fino all’ultimo millisecondo, anche con fine e calcolo dopo il confine', () => {
    const round = scoredMatch(FANTASY_SUMMER_2026_ENDS_AT - 1)
    expect(round.slotEndsAt).toBeGreaterThan(FANTASY_SUMMER_2026_ENDS_AT)
    expect(round.settledAt).toBeGreaterThan(FANTASY_SUMMER_2026_ENDS_AT)
    expect(getFantasySeasonForRound(round).courtScoring).toBe('presence-v1')
    expect(getFantasyCourtStandings(round)).toEqual([])
    expect(getFantasyLeaderboard([round]).filter((row) => ['a', 'b', 'c', 'd'].includes(row.managerId)).map((row) => [row.managerId, row.leaguePoints])).toEqual([
      ['c', 3], ['a', 2], ['b', 2], ['d', 2],
    ])
  })

  it('lascia identici calcolo individuale, capitano, formazioni e spareggi dei manager', () => {
    const summer = scoredMatch(FANTASY_SUMMER_2026_ENDS_AT - 1)
    const winter = scoredMatch()
    expect(winter.playerScores).toEqual(summer.playerScores)
    expect(winter.standings).toEqual(summer.standings)
    // 10 + 8.5 × 1.5 + 2: the bonus remains with best mean C, not court winner A.
    expect(winter.standings?.find((row) => row.managerId === 'manager')?.totalScore).toBe(24.75)
    expect(getFantasyLeaderboard([winter]).filter((row) => ['manager', 'other'].includes(row.managerId)).map((row) => [row.managerId, row.leaguePoints, row.wins])).toEqual([
      ['manager', 5, 1], ['other', 3, 0],
    ])
  })

  it.each([
    [[10, 10, 8, 7], [1, 1, 3, 4], [5, 5, 1, 0]],
    [[10, 8, 8, 7], [1, 2, 2, 4], [5, 3, 3, 0]],
    [[10, 8, 7, 7], [1, 2, 3, 3], [5, 3, 1, 1]],
    [[10, 10, 10, 7], [1, 1, 1, 4], [5, 5, 5, 0]],
    [[8, 8, 8, 8], [1, 1, 1, 1], [5, 5, 5, 5]],
  ])('condivide i pari merito senza usare nomi, giudizi o ordine della rosa: %j', (totals, ranks, points) => {
    const round = scoredMatch()
    round.playerScores = round.playerScores!.map((score, index) => ({ ...score, fantasyScore: totals[index] }))
    const original = structuredClone(round)
    const standings = getFantasyCourtStandings(round)
    expect(standings.map((standing) => standing.rank)).toEqual(ranks)
    expect(standings.map((standing) => standing.leaguePoints)).toEqual(points)
    expect(standings.map((standing) => standing.tied)).toEqual(totals.map((value) => totals.filter((other) => other === value).length > 1))
    expect(getFantasyCourtStandings({ ...round, participants: [...round.participants].reverse(), playerScores: [...round.playerScores!].reverse() })).toEqual(standings)
    expect(round).toEqual(original)
  })

  it('non assegna punti nuovi a round aperti, annullati o con punteggi incompleti', () => {
    const round = scoredMatch()
    for (const status of ['open', 'pending', 'void'] as const) {
      expect(getFantasyCourtStandings({ ...round, status })).toEqual([])
      expect(getFantasyLeaderboard([{ ...round, status }])).toEqual([])
    }
    const incomplete = { ...round, playerScores: round.playerScores!.slice(0, 3) }
    expect(getFantasyCourtStandings(incomplete)).toEqual([])
    expect(getFantasyLeaderboard([incomplete]).map((row) => row.managerId)).toEqual(['manager', 'other'])
    expect(getFantasyCourtStandings({ ...round, participants: [...round.participants.slice(0, 3), round.participants[0]] })).toEqual([])
  })

  it('somma contributi misti mantenendo la regola della singola partita e lo storico legacy', () => {
    const summer = scoredMatch(FANTASY_SUMMER_2026_ENDS_AT - 1)
    const winter = { ...scoredMatch(), id: 'winter' }
    expect(getFantasyLeaderboard([summer, winter]).find((row) => row.managerId === 'a')).toMatchObject({ leaguePoints: 7, contributions: [{ source: 'court-placement', leaguePoints: 5 }, { source: 'starter', leaguePoints: 2 }] })
    const legacy: FantasyRound = { ...summer, playerScores: summer.playerScores?.map((score) => ({ ...score, scoringModel: 'mvp-v2', isTopPerformer: undefined, isMvp: score.userId === 'b' })) }
    expect(getFantasyLeaderboard([legacy]).find((row) => row.managerId === 'b')?.leaguePoints).toBe(3)
  })
})
