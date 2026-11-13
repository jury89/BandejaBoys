import type { FantasyRound, FantasyStartingCredit, MemberProfile } from '../types'
import { getFantasyLeaderboard } from './domain'
import { FANTASY_SUMMER_2026_ENDS_AT } from './fantasySeasons'

const credit: FantasyStartingCredit = {
  points: 20,
  reason: 'Ingresso a stagione in corso',
  grantedAt: Date.parse('2026-11-13T10:00:00Z'),
  grantedBy: 'admin',
}
const newcomer: MemberProfile = {
  id: 'newcomer', displayName: 'Nuovo', email: 'new@example.test', createdAt: credit.grantedAt,
  fantasyStartingCredits: { 'winter-2026-27': credit },
}
const participants = ['a', 'b', 'c', 'd'].map((userId) => ({ userId, displayName: userId }))
const round: FantasyRound = {
  id: 'round', pollId: 'poll', pollTitle: 'Partita', slotId: 'slot',
  slotStartsAt: new Date(FANTASY_SUMMER_2026_ENDS_AT).toISOString(),
  locksAt: FANTASY_SUMMER_2026_ENDS_AT, slotEndsAt: FANTASY_SUMMER_2026_ENDS_AT + 90 * 60_000,
  settlesAt: FANTASY_SUMMER_2026_ENDS_AT + 86_400_000, createdAt: 1, updatedAt: 1,
  status: 'scored', participantIds: participants.map(({ userId }) => userId), participants,
  rosterKey: JSON.stringify(participants.map(({ userId }) => userId)),
  standings: [{
    managerId: newcomer.id, managerName: newcomer.displayName, playerIds: ['a', 'b'], captainId: 'a',
    totalScore: 22, captainRating: 9, baseRatingTotal: 15, rank: 1, leaguePoints: 5,
  }],
}

describe('accrediti iniziali Fanta per stagione', () => {
  it('inserisce chi non ha ancora giocato con i soli punti iniziali, una volta per account', () => {
    const rows = getFantasyLeaderboard([], { members: [newcomer, newcomer], seasonId: 'winter-2026-27' })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      managerId: newcomer.id, leaguePoints: 20, wins: 0, roundsPlayed: 0, rawFantasyPoints: 0,
      contributions: [{ source: 'starting-credit', leaguePoints: 20, pollTitle: credit.reason }],
    })
    expect(getFantasyLeaderboard([], { members: [newcomer] })).toEqual([])
    expect(getFantasyLeaderboard([], { members: [newcomer], seasonId: 'summer-2026' })).toEqual([])
  })

  it('somma il credito ai risultati senza incrementare partite, vittorie o punteggio fantasy', () => {
    const [original] = getFantasyLeaderboard([round])
    const [withCredit] = getFantasyLeaderboard([round], { members: [newcomer], seasonId: 'winter-2026-27' })
    expect(withCredit).toMatchObject({
      leaguePoints: original.leaguePoints + 20, wins: original.wins,
      roundsPlayed: original.roundsPlayed, rawFantasyPoints: original.rawFantasyPoints,
    })
    expect(withCredit.contributions.reduce((sum, entry) => sum + entry.leaguePoints, 0)).toBe(25)
    const summerRound = { ...round, id: 'summer', locksAt: FANTASY_SUMMER_2026_ENDS_AT - 1 }
    expect(getFantasyLeaderboard([summerRound, round], { members: [newcomer], seasonId: 'winter-2026-27' }))
      .toEqual([withCredit])
    expect(getFantasyLeaderboard([summerRound], { members: [newcomer], seasonId: 'summer-2026' }))
      .toEqual(getFantasyLeaderboard([summerRound]))
  })

  it.each([
    { points: -20 }, { points: 0 }, { points: 1.5 }, { points: Infinity }, { points: NaN },
    { grantedAt: NaN }, { grantedAt: 0 }, { reason: '' }, { grantedBy: '' },
  ])('ignora accrediti incompleti o non validi: %o', (invalid) => {
    const member = { ...newcomer, fantasyStartingCredits: { 'winter-2026-27': { ...credit, ...invalid } } }
    expect(getFantasyLeaderboard([], { members: [member], seasonId: 'winter-2026-27' })).toEqual([])
  })
})
