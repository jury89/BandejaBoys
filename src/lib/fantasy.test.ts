import type {
  FantasyEntry,
  MatchRatingSummary,
  MatchReport,
  PadelPoll,
  PadelSlot,
  SessionUser,
} from '../types'
import {
  FANTASY_DEFAULT_RATING,
  FANTASY_EARLY_SETTLEMENT_DELAY_MS,
  FANTASY_MVP_LEAGUE_POINTS,
  FANTASY_MISSING_REPORT_VOID_REASON,
  FANTASY_SETTLEMENT_DELAY_MS,
  FANTASY_STARTER_LEAGUE_POINTS,
  fantasyEntryIsCurrent,
  fantasySelectionError,
  getFantasyLeaderboard,
  makeFantasyEntry,
  makeFantasyRound,
  padelDateTimeToTimestamp,
  reconcileFantasyRounds,
  scoreFantasyRound,
} from './domain'

const startsAt = '2026-08-04T17:30:00.000Z'
const locksAt = padelDateTimeToTimestamp(startsAt)
const now = locksAt - 60_000
const players = ['a', 'b', 'c', 'd']

const user = (id: string, displayName = id.toUpperCase()): SessionUser => ({
  id,
  displayName,
  email: `${id}@example.test`,
  createdAt: 1,
})

const bookedSlot = (overrides: Partial<PadelSlot> = {}): PadelSlot => ({
  id: 'slot-1',
  startsAt,
  durationMinutes: 90,
  venue: 'Oasi Boschetto',
  bookedAt: 10,
  bookedBy: 'a',
  bookedByName: 'A',
  signups: players.map((id, index) => ({
    id: `signup-${id}`,
    userId: id,
    displayName: id.toUpperCase(),
    joinedAt: index + 1,
    role: 'starter',
  })),
  ...overrides,
})

const pollWith = (slot = bookedSlot()): PadelPoll => ({
  id: 'poll-1',
  title: 'Titolo storico',
  targetWeekStart: '2026-08-03',
  createdBy: 'a',
  createdByName: 'A',
  createdAt: 1,
  updatedAt: 1,
  status: 'open',
  slots: [slot],
})

function roundFixture() {
  return makeFantasyRound(pollWith(), bookedSlot(), now)!
}

function reportFixture(): MatchReport {
  const participants = players.map((id) => ({ userId: id, displayName: id.toUpperCase() }))
  const byId = new Map(participants.map((player) => [player.userId, player]))
  return {
    id: 'poll-1__slot-1',
    pollId: 'poll-1',
    pollTitle: 'Padel · 3 ago – 9 ago 2026',
    slotId: 'slot-1',
    sessionStartsAt: startsAt,
    participantIds: players,
    participants,
    sets: [
      {
        id: 'set-1',
        teamA: [byId.get('a')!, byId.get('b')!],
        teamB: [byId.get('c')!, byId.get('d')!],
        scoreA: 6,
        scoreB: 4,
      },
      {
        id: 'set-2',
        teamA: [byId.get('a')!, byId.get('c')!],
        teamB: [byId.get('b')!, byId.get('d')!],
        scoreA: 3,
        scoreB: 6,
      },
      {
        id: 'set-3',
        teamA: [byId.get('a')!, byId.get('d')!],
        teamB: [byId.get('b')!, byId.get('c')!],
        scoreA: 6,
        scoreB: 4,
      },
    ],
    createdBy: 'a',
    createdByName: 'A',
    createdAt: locksAt + 90 * 60_000,
    updatedBy: 'a',
    updatedByName: 'A',
    updatedAt: locksAt + 90 * 60_000,
  }
}

const ratings: MatchRatingSummary[] = [
  {
    id: 'a',
    pollId: 'poll-1',
    slotId: 'slot-1',
    revieweeId: 'a',
    scoreTotal: 16,
    ratingCount: 2,
    lastRatingId: 'ra',
    updatedAt: 1,
  },
  {
    id: 'b',
    pollId: 'poll-1',
    slotId: 'slot-1',
    revieweeId: 'b',
    scoreTotal: 21,
    ratingCount: 3,
    lastRatingId: 'rb',
    updatedAt: 1,
  },
  {
    id: 'c',
    pollId: 'poll-1',
    slotId: 'slot-1',
    revieweeId: 'c',
    scoreTotal: 10,
    ratingCount: 1,
    lastRatingId: 'rc',
    updatedAt: 1,
  },
  {
    id: 'd',
    pollId: 'poll-1',
    slotId: 'slot-1',
    revieweeId: 'd',
    scoreTotal: 18,
    ratingCount: 2,
    lastRatingId: 'rd',
    updatedAt: 1,
  },
]

const entry = (
  managerId: string,
  playerIds: [string, string],
  captainId: string,
): FantasyEntry => makeFantasyEntry(
  roundFixture(),
  user(managerId),
  { playerIds, captainId },
  undefined,
  now + 1,
)

describe('round FantaBandeja', () => {
  it('apre soltanto per una partita futura, prenotata e con quattro membri registrati', () => {
    const round = roundFixture()
    expect(round).toMatchObject({
      id: 'poll-1__slot-1',
      pollTitle: 'Padel · 3 ago – 9 ago 2026',
      participantIds: players,
      locksAt,
      status: 'open',
    })
    expect(round.settlesAt).toBe(round.slotEndsAt + FANTASY_SETTLEMENT_DELAY_MS)

    expect(makeFantasyRound(pollWith(bookedSlot({ bookedAt: undefined })), bookedSlot({ bookedAt: undefined }), now))
      .toBeNull()
    expect(makeFantasyRound(
      pollWith(bookedSlot({ signups: bookedSlot().signups.slice(0, 3) })),
      bookedSlot({ signups: bookedSlot().signups.slice(0, 3) }),
      now,
    )).toBeNull()
    expect(makeFantasyRound(
      pollWith(bookedSlot({
        signups: bookedSlot().signups.map((signup, index) => (
          index === 0 ? { ...signup, isGuest: true } : signup
        )),
      })),
      bookedSlot({
        signups: bookedSlot().signups.map((signup, index) => (
          index === 0 ? { ...signup, isGuest: true } : signup
        )),
      }),
      now,
    )).toBeNull()
    expect(makeFantasyRound(pollWith(), bookedSlot(), locksAt)).toBeNull()
  })

  it('accetta due titolari e un capitano, ma esclude chi gioca e blocca all’inizio', () => {
    const round = roundFixture()
    expect(fantasySelectionError(
      round,
      'manager',
      { playerIds: ['a', 'd'], captainId: 'd' },
      now,
    )).toBeNull()
    expect(fantasySelectionError(
      round,
      'a',
      { playerIds: ['a', 'd'], captainId: 'd' },
      now,
    )).toContain('titolari')
    expect(fantasySelectionError(
      round,
      'manager',
      { playerIds: ['a', 'a'], captainId: 'a' },
      now,
    )).toContain('diversi')
    expect(fantasySelectionError(
      round,
      'manager',
      { playerIds: ['a', 'd'], captainId: 'b' },
      now,
    )).toContain('capitano')
    expect(fantasySelectionError(
      round,
      'manager',
      { playerIds: ['a', 'd'], captainId: 'd' },
      locksAt,
    )).toContain('bloccate')
  })

  it('invalida una giocata quando cambia uno dei titolari', () => {
    const originalRound = roundFixture()
    const saved = makeFantasyEntry(
      originalRound,
      user('manager', 'Mister'),
      { playerIds: ['a', 'b'], captainId: 'a' },
      undefined,
      now + 1,
    )
    expect(fantasyEntryIsCurrent(originalRound, saved)).toBe(true)

    const substitutedSlot = bookedSlot({
      signups: bookedSlot().signups.map((signup) => (
        signup.userId === 'd'
          ? { ...signup, id: 'signup-e', userId: 'e', displayName: 'E' }
          : signup
      )),
    })
    const updatedRound = reconcileFantasyRounds(
      [pollWith(substitutedSlot)],
      [originalRound],
      [saved],
      [],
      [],
      now + 2,
    )[0]

    expect(updatedRound.participantIds).toEqual(['a', 'b', 'c', 'e'])
    expect(fantasyEntryIsCurrent(updatedRound, saved)).toBe(false)
  })

  it('mantiene valida una giocata quando cambia soltanto l’orario', () => {
    const originalRound = roundFixture()
    const saved = makeFantasyEntry(
      originalRound,
      user('manager', 'Mister'),
      { playerIds: ['a', 'b'], captainId: 'a' },
      undefined,
      now + 1,
    )
    const movedStartsAt = '2026-08-04T18:00:00.000Z'
    const updatedRound = reconcileFantasyRounds(
      [pollWith(bookedSlot({ startsAt: movedStartsAt }))],
      [originalRound],
      [saved],
      [],
      [],
      now + 2,
    )[0]

    expect(updatedRound).toMatchObject({
      slotStartsAt: movedStartsAt,
      participantIds: originalRound.participantIds,
      rosterKey: originalRound.rosterKey,
    })
    expect(updatedRound.locksAt).not.toBe(saved.locksAt)
    expect(fantasyEntryIsCurrent(updatedRound, saved)).toBe(true)
  })

  it('sospende un round incompleto senza annullarlo e lo riapre con la rosa corrente', () => {
    const originalRound = roundFixture()
    const saved = makeFantasyEntry(
      originalRound,
      user('manager', 'Mister'),
      { playerIds: ['a', 'd'], captainId: 'a' },
      undefined,
      now + 1,
    )
    const incompleteSlot = bookedSlot({ signups: bookedSlot().signups.slice(0, 3) })
    const suspended = reconcileFantasyRounds(
      [pollWith(incompleteSlot)],
      [originalRound],
      [saved],
      [],
      [],
      now + 2,
    )[0]

    expect(suspended).toMatchObject({
      status: 'pending',
      participantIds: ['a', 'b', 'c', 'd'],
    })
    expect(suspended.status).not.toBe('void')

    const restoredSlot = bookedSlot({
      signups: bookedSlot().signups.map((signup) => (
        signup.userId === 'd'
          ? { ...signup, id: 'signup-e', userId: 'e', displayName: 'E' }
          : signup
      )),
    })
    const restored = reconcileFantasyRounds(
      [pollWith(restoredSlot)],
      [suspended],
      [saved],
      [],
      [],
      now + 3,
    )[0]

    expect(restored).toMatchObject({
      status: 'open',
      participantIds: ['a', 'b', 'c', 'e'],
    })
    expect(fantasyEntryIsCurrent(restored, saved)).toBe(false)
  })
})

describe('punteggio FantaBandeja', () => {
  it('somma pagelle, risultati, differenza game, capitano e MVP', () => {
    const scored = scoreFantasyRound(
      roundFixture(),
      [
        entry('manager-x', ['a', 'd'], 'd'),
        entry('manager-y', ['b', 'd'], 'b'),
        entry('manager-z', ['a', 'b'], 'a'),
      ],
      reportFixture(),
      ratings,
      locksAt + FANTASY_SETTLEMENT_DELAY_MS,
    )

    expect(scored.playerScores).toEqual([
      expect.objectContaining({
        userId: 'a',
        baseRating: 8,
        setWins: 2,
        setLosses: 1,
        gameDifference: 1,
        resultBonus: 1.5,
        differenceBonus: 0,
        fantasyScore: 9.5,
        isMvp: false,
      }),
      expect.objectContaining({
        userId: 'b',
        baseRating: 7,
        gameDifference: 3,
        differenceBonus: 0.5,
        fantasyScore: 9,
      }),
      expect.objectContaining({
        userId: 'c',
        baseRating: FANTASY_DEFAULT_RATING,
        ratingCount: 1,
        usedDefaultRating: true,
        setWins: 0,
        setLosses: 3,
        fantasyScore: 5.5,
      }),
      expect.objectContaining({
        userId: 'd',
        baseRating: 9,
        gameDifference: 3,
        fantasyScore: 11,
        isMvp: true,
      }),
    ])
    expect(scored.standings).toEqual([
      expect.objectContaining({
        managerId: 'manager-x',
        totalScore: 28,
        rank: 1,
        leaguePoints: 5,
      }),
      expect.objectContaining({
        managerId: 'manager-y',
        totalScore: 24.5,
        rank: 2,
        leaguePoints: 3,
      }),
      expect.objectContaining({
        managerId: 'manager-z',
        totalScore: 23.25,
        rank: 3,
        leaguePoints: 1,
      }),
    ])
  })

  it('ammette formazioni duplicate e assegna lo stesso piazzamento a parità completa', () => {
    const scored = scoreFantasyRound(
      roundFixture(),
      [
        entry('manager-x', ['a', 'd'], 'd'),
        entry('manager-y', ['a', 'd'], 'd'),
      ],
      reportFixture(),
      ratings,
      locksAt + FANTASY_SETTLEMENT_DELAY_MS,
    )

    expect(scored.standings?.map(({ rank, leaguePoints }) => ({ rank, leaguePoints }))).toEqual([
      { rank: 1, leaguePoints: 5 },
      { rank: 1, leaguePoints: 5 },
    ])
  })

  it('chiude dopo 24 ore quando referto e pagelle sono completi', () => {
    const round = roundFixture()
    const completeRatings = ratings.map((summary) => (
      summary.revieweeId === 'c'
        ? { ...summary, scoreTotal: 12, ratingCount: 2 }
        : summary
    ))
    const beforeSettlement = reconcileFantasyRounds(
      [pollWith()],
      [round],
      [],
      completeRatings,
      [reportFixture()],
      round.slotEndsAt + FANTASY_EARLY_SETTLEMENT_DELAY_MS - 1,
    )
    expect(beforeSettlement[0].status).toBe('open')

    const scored = reconcileFantasyRounds(
      [pollWith()],
      [round],
      [entry('manager', ['a', 'd'], 'd')],
      completeRatings,
      [reportFixture()],
      round.slotEndsAt + FANTASY_EARLY_SETTLEMENT_DELAY_MS,
    )
    expect(scored[0].status).toBe('scored')
  })

  it('attende 48 ore se manca una pagella completa e mantiene il referto come fallback', () => {
    const round = roundFixture()
    const incompleteRatings = ratings.filter((summary) => summary.revieweeId !== 'd')
    const afterTwentyFourHours = reconcileFantasyRounds(
      [pollWith()],
      [round],
      [],
      incompleteRatings,
      [reportFixture()],
      round.slotEndsAt + FANTASY_EARLY_SETTLEMENT_DELAY_MS,
    )
    expect(afterTwentyFourHours[0].status).toBe('open')

    const scoredWithDefault = reconcileFantasyRounds(
      [pollWith()],
      [round],
      [],
      incompleteRatings,
      [reportFixture()],
      round.settlesAt,
    )
    expect(scoredWithDefault[0]).toMatchObject({
      status: 'scored',
      playerScores: expect.arrayContaining([
        expect.objectContaining({
          userId: 'd',
          baseRating: FANTASY_DEFAULT_RATING,
          usedDefaultRating: true,
        }),
      ]),
    })
  })

  it('annulla dopo 48 ore se il referto manca', () => {
    const round = roundFixture()

    const voided = reconcileFantasyRounds(
      [pollWith()],
      [round],
      [],
      ratings,
      [],
      round.settlesAt,
    )
    expect(voided[0]).toMatchObject({
      status: 'void',
      voidReason: FANTASY_MISSING_REPORT_VOID_REASON,
    })
  })

  it('ricalcola un round annullato quando il referto viene inserito dopo 48 ore', () => {
    const round = roundFixture()
    const voided = reconcileFantasyRounds(
      [pollWith()],
      [round],
      [],
      ratings,
      [],
      round.settlesAt,
    )[0]
    const lateSettlementAt = round.settlesAt + 20 * 60 * 1000

    const recovered = reconcileFantasyRounds(
      [pollWith()],
      [voided],
      [entry('manager', ['a', 'd'], 'd')],
      ratings,
      [reportFixture()],
      lateSettlementAt,
    )[0]

    expect(recovered).toMatchObject({
      status: 'scored',
      settledAt: lateSettlementAt,
      standings: [expect.objectContaining({ managerId: 'manager' })],
    })
    expect(recovered.voidReason).toBeUndefined()
  })

  it('non riapre un round annullato per un motivo diverso', () => {
    const round = {
      ...roundFixture(),
      status: 'void' as const,
      settledAt: locksAt,
      voidReason: 'La formazione è cambiata al momento del blocco.',
    }

    const reconciled = reconcileFantasyRounds(
      [pollWith()],
      [round],
      [],
      ratings,
      [reportFixture()],
      locksAt + 1,
    )[0]

    expect(reconciled).toEqual(round)
  })

  it('costruisce la classifica generale con punti, vittorie e punteggio grezzo', () => {
    const first = scoreFantasyRound(
      roundFixture(),
      [
        entry('manager-x', ['a', 'd'], 'd'),
        entry('manager-y', ['b', 'd'], 'b'),
      ],
      reportFixture(),
      ratings,
      locksAt + FANTASY_SETTLEMENT_DELAY_MS,
    )
    const second = {
      ...first,
      id: 'poll-2__slot-2',
      standings: first.standings?.map((standing) => ({
        ...standing,
        rank: standing.managerId === 'manager-y' ? 1 : 2,
        leaguePoints: standing.managerId === 'manager-y' ? 5 : 3,
      })),
    }

    const leaderboard = getFantasyLeaderboard([first, second])

    expect(leaderboard).toEqual(expect.arrayContaining([
      expect.objectContaining({
        managerId: 'manager-x',
        leaguePoints: 8,
        wins: 1,
        roundsPlayed: 2,
        rank: 1,
      }),
      expect.objectContaining({
        managerId: 'manager-y',
        leaguePoints: 8,
        wins: 1,
        roundsPlayed: 2,
        rank: 2,
      }),
      expect.objectContaining({
        managerId: 'd',
        leaguePoints: FANTASY_MVP_LEAGUE_POINTS * 2,
        rawFantasyPoints: 22,
        roundsPlayed: 2,
        rank: 3,
      }),
      expect.objectContaining({
        managerId: 'a',
        leaguePoints: FANTASY_STARTER_LEAGUE_POINTS * 2,
        rawFantasyPoints: 19,
        roundsPlayed: 2,
        rank: 4,
      }),
    ]))
  })

  it('applica i punti dei titolari anche ai round storici già materializzati', () => {
    const historicalRound = scoreFantasyRound(
      roundFixture(),
      [entry('manager-x', ['a', 'd'], 'd')],
      reportFixture(),
      ratings,
      locksAt + FANTASY_SETTLEMENT_DELAY_MS,
    )

    const leaderboard = getFantasyLeaderboard([historicalRound])

    expect(leaderboard.find((row) => row.managerId === 'd')).toEqual(
      expect.objectContaining({
        leaguePoints: FANTASY_MVP_LEAGUE_POINTS,
        rawFantasyPoints: 11,
        roundsPlayed: 1,
      }),
    )
    ;['a', 'b', 'c'].forEach((userId) => {
      expect(leaderboard.find((row) => row.managerId === userId)).toEqual(
        expect.objectContaining({
          leaguePoints: FANTASY_STARTER_LEAGUE_POINTS,
          roundsPlayed: 1,
        }),
      )
    })
  })
})
