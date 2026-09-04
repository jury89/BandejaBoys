import type {
  FantasyEntry,
  MatchFeedbackResponse,
  MatchFeedbackSummary,
  MatchReport,
  PadelPoll,
  PadelSlot,
  SessionUser,
} from '../types'
import {
  FANTASY_BASE_SCORE,
  FANTASY_FEEDBACK_FALLBACK_DELAY_MS,
  FANTASY_SETTLEMENT_GRACE_MS,
  FANTASY_TOP_PERFORMER_LEAGUE_POINTS,
  FANTASY_MISSING_REPORT_VOID_REASON,
  FANTASY_SETTLEMENT_DELAY_MS,
  FANTASY_STARTER_LEAGUE_POINTS,
  fantasyEntryIsCurrent,
  fantasySelectionError,
  getFantasyLeaderboard,
  makeFantasyEntry,
  makeFantasyRound,
  padelDateTimeToTimestamp,
  reconcileFantasyRoundRosterMutation,
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

const feedbackSummaries: MatchFeedbackSummary[] = [
  {
    id: 'a',
    pollId: 'poll-1',
    slotId: 'slot-1',
    playerId: 'a',
    scoreUnitsTotal: 45,
    ratingCount: 3,
    lastResponseId: 'ra',
    updatedAt: 1,
  },
  {
    id: 'b',
    pollId: 'poll-1',
    slotId: 'slot-1',
    playerId: 'b',
    scoreUnitsTotal: 30,
    ratingCount: 3,
    lastResponseId: 'rb',
    updatedAt: 1,
  },
  {
    id: 'c',
    pollId: 'poll-1',
    slotId: 'slot-1',
    playerId: 'c',
    scoreUnitsTotal: 36,
    ratingCount: 3,
    lastResponseId: 'rc',
    updatedAt: 1,
  },
  {
    id: 'd',
    pollId: 'poll-1',
    slotId: 'slot-1',
    playerId: 'd',
    scoreUnitsTotal: 54,
    ratingCount: 3,
    lastResponseId: 'rd',
    updatedAt: 1,
  },
]

const feedbackResponses: MatchFeedbackResponse[] = players.map((reviewerId) => ({
  id: `poll-1__slot-1__${reviewerId}`,
  pollId: 'poll-1',
  slotId: 'slot-1',
  reviewerId,
  status: 'submitted',
  ratings: players.filter((playerId) => playerId !== reviewerId).map((playerId) => ({
    playerId,
    playerName: playerId.toUpperCase(),
    level: playerId === 'a' ? 4 : playerId === 'b' ? 2 : playerId === 'c' ? 3 : 5,
    scoreUnits: playerId === 'a' ? 15 : playerId === 'b' ? 10 : playerId === 'c' ? 12 : 18,
  })),
  closedAt: locksAt + 90 * 60_000,
}))

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
      [],
      now + 3,
    )[0]

    expect(restored).toMatchObject({
      status: 'open',
      participantIds: ['a', 'b', 'c', 'e'],
    })
    expect(fantasyEntryIsCurrent(restored, saved)).toBe(false)
  })

  it('riallinea soltanto la rosa di un round aperto nella transazione dello slot', () => {
    const originalRound = roundFixture()
    const substitutedSlot = bookedSlot({
      signups: bookedSlot().signups.map((signup) => (
        signup.userId === 'd'
          ? { ...signup, id: 'signup-e', userId: 'e', displayName: 'E' }
          : signup
      )),
    })
    const updatedAt = now + 2

    const synchronized = reconcileFantasyRoundRosterMutation(
      { ...pollWith(substitutedSlot), updatedAt },
      substitutedSlot.id,
      originalRound,
      updatedAt,
    )

    expect(synchronized).toMatchObject({
      status: 'open',
      participantIds: ['a', 'b', 'c', 'e'],
      participants: expect.arrayContaining([
        expect.objectContaining({ userId: 'e', displayName: 'E' }),
      ]),
      updatedAt,
    })
    expect(synchronized.slotStartsAt).toBe(originalRound.slotStartsAt)
    expect(synchronized.locksAt).toBe(originalRound.locksAt)
  })

  it('sospende subito il round se la rosa non è più valida, ma non tocca round già bloccati', () => {
    const originalRound = roundFixture()
    const incompletePoll = pollWith(bookedSlot({ signups: bookedSlot().signups.slice(0, 3) }))

    expect(reconcileFantasyRoundRosterMutation(
      incompletePoll,
      'slot-1',
      originalRound,
      now + 2,
    )).toMatchObject({ status: 'pending', updatedAt: now + 2 })

    expect(reconcileFantasyRoundRosterMutation(
      incompletePoll,
      'slot-1',
      originalRound,
      originalRound.locksAt,
    )).toBe(originalRound)
  })
})

describe('punteggio FantaBandeja', () => {
  it('somma giudizio base, risultati, differenza game e capitano', () => {
    const scored = scoreFantasyRound(
      roundFixture(),
      [
        entry('manager-x', ['a', 'd'], 'd'),
        entry('manager-y', ['b', 'd'], 'b'),
        entry('manager-z', ['a', 'b'], 'a'),
      ],
      reportFixture(),
      feedbackSummaries,
      locksAt + FANTASY_SETTLEMENT_DELAY_MS,
    )

    expect(scored.playerScores).toEqual([
      expect.objectContaining({
        userId: 'a',
        scoringModel: 'feedback-v3',
        baseRating: 7.5,
        feedbackLevel: 4,
        setWins: 2,
        setLosses: 1,
        gameDifference: 1,
        resultBonus: 1.5,
        differenceBonus: 0,
        fantasyScore: 9,
        isMvp: false,
        isTopPerformer: false,
      }),
      expect.objectContaining({
        userId: 'b',
        baseRating: 5,
        gameDifference: 3,
        differenceBonus: 0.5,
        fantasyScore: 7,
      }),
      expect.objectContaining({
        userId: 'c',
        baseRating: FANTASY_BASE_SCORE,
        ratingCount: 3,
        usedDefaultRating: false,
        setWins: 0,
        setLosses: 3,
        fantasyScore: 5.5,
      }),
      expect.objectContaining({
        userId: 'd',
        baseRating: 9,
        feedbackLevel: 5,
        mvpBonus: 0,
        gameDifference: 3,
        fantasyScore: 11,
        isMvp: false,
        isTopPerformer: true,
      }),
    ])
    expect(scored.standings).toEqual([
      expect.objectContaining({
        managerId: 'manager-x',
        totalScore: 27.5,
        rank: 1,
        leaguePoints: 5,
      }),
      expect.objectContaining({
        managerId: 'manager-y',
        totalScore: 21.5,
        rank: 2,
        leaguePoints: 3,
      }),
      expect.objectContaining({
        managerId: 'manager-z',
        totalScore: 20.5,
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
      feedbackSummaries,
      locksAt + FANTASY_SETTLEMENT_DELAY_MS,
    )

    expect(scored.standings?.map(({ rank, leaguePoints }) => ({ rank, leaguePoints }))).toEqual([
      { rank: 1, leaguePoints: 5 },
      { rank: 1, leaguePoints: 5 },
    ])
  })

  it('chiude dieci minuti dopo l’ultimo dato quando referto e giudizi sono completi', () => {
    const round = roundFixture()
    const readyAt = reportFixture().updatedAt + FANTASY_SETTLEMENT_GRACE_MS
    const beforeSettlement = reconcileFantasyRounds(
      [pollWith()],
      [round],
      [],
      feedbackSummaries,
      feedbackResponses,
      [reportFixture()],
      readyAt - 1,
    )
    expect(beforeSettlement[0]).toMatchObject({
      status: 'open',
      hasMatchReport: true,
      feedbackResponseCount: 4,
      settlementReadyAt: readyAt,
    })

    const scored = reconcileFantasyRounds(
      [pollWith()],
      [round],
      [entry('manager', ['a', 'd'], 'd')],
      feedbackSummaries,
      feedbackResponses,
      [reportFixture()],
      readyAt,
    )
    expect(scored[0].status).toBe('scored')
  })

  it('usa dopo 24 ore i giudizi disponibili se manca una scheda', () => {
    const round = roundFixture()
    const incompleteResponses = feedbackResponses.filter((response) => response.reviewerId !== 'd')
    const afterTwentyFourHours = reconcileFantasyRounds(
      [pollWith()],
      [round],
      [],
      feedbackSummaries,
      incompleteResponses,
      [reportFixture()],
      round.slotEndsAt + FANTASY_FEEDBACK_FALLBACK_DELAY_MS - 1,
    )
    expect(afterTwentyFourHours[0]).toMatchObject({
      status: 'open',
      hasMatchReport: true,
      feedbackResponseCount: 3,
    })

    const scoredWithDefault = reconcileFantasyRounds(
      [pollWith()],
      [round],
      [],
      feedbackSummaries,
      incompleteResponses,
      [reportFixture()],
      round.slotEndsAt + FANTASY_FEEDBACK_FALLBACK_DELAY_MS,
    )
    expect(scoredWithDefault[0]).toMatchObject({
      status: 'scored',
      playerScores: expect.arrayContaining([
        expect.objectContaining({
          userId: 'd',
          baseRating: 9,
          scoringModel: 'feedback-v3',
        }),
      ]),
    })
  })

  it('attende il referto anche dopo 24 ore e lo lascia dieci minuti al sicuro se arriva tardi', () => {
    const round = roundFixture()
    const fallbackAt = round.slotEndsAt + FANTASY_FEEDBACK_FALLBACK_DELAY_MS
    const withoutReport = reconcileFantasyRounds(
      [pollWith()],
      [round],
      [],
      feedbackSummaries,
      feedbackResponses,
      [],
      fallbackAt,
    )
    expect(withoutReport[0]).toMatchObject({ status: 'open', hasMatchReport: false })

    const lateReport = { ...reportFixture(), updatedAt: fallbackAt, createdAt: fallbackAt }
    const beforeGrace = reconcileFantasyRounds(
      [pollWith()],
      [round],
      [],
      feedbackSummaries,
      feedbackResponses,
      [lateReport],
      fallbackAt + FANTASY_SETTLEMENT_GRACE_MS - 1,
    )
    expect(beforeGrace[0]).toMatchObject({
      status: 'open',
      settlementReadyAt: fallbackAt + FANTASY_SETTLEMENT_GRACE_MS,
    })

    const afterGrace = reconcileFantasyRounds(
      [pollWith()],
      [round],
      [],
      feedbackSummaries,
      feedbackResponses,
      [lateReport],
      fallbackAt + FANTASY_SETTLEMENT_GRACE_MS,
    )
    expect(afterGrace[0].status).toBe('scored')
  })

  it('annulla dopo 48 ore se il referto manca', () => {
    const round = roundFixture()

    const voided = reconcileFantasyRounds(
      [pollWith()],
      [round],
      [],
      feedbackSummaries,
      feedbackResponses,
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
      feedbackSummaries,
      feedbackResponses,
      [],
      round.settlesAt,
    )[0]
    const lateSettlementAt = round.settlesAt + 20 * 60 * 1000

    const recovered = reconcileFantasyRounds(
      [pollWith()],
      [voided],
      [entry('manager', ['a', 'd'], 'd')],
      feedbackSummaries,
      feedbackResponses,
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
      feedbackSummaries,
      feedbackResponses,
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
      feedbackSummaries,
      locksAt + FANTASY_SETTLEMENT_DELAY_MS,
    )
    const second = {
      ...first,
      id: 'poll-2__slot-2',
      locksAt: first.locksAt + 1,
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
        leaguePoints: FANTASY_TOP_PERFORMER_LEAGUE_POINTS * 2,
        rawFantasyPoints: 22,
        roundsPlayed: 2,
        rank: 3,
      }),
      expect.objectContaining({
        managerId: 'a',
        leaguePoints: FANTASY_STARTER_LEAGUE_POINTS * 2,
        rawFantasyPoints: 18,
        roundsPlayed: 2,
        rank: 4,
      }),
    ]))

    const managerX = leaderboard.find((row) => row.managerId === 'manager-x')!
    expect(managerX.contributions).toEqual([
      expect.objectContaining({
        roundId: 'poll-2__slot-2',
        source: 'formation',
        rank: 2,
        leaguePoints: 3,
      }),
      expect.objectContaining({
        roundId: first.id,
        source: 'formation',
        rank: 1,
        leaguePoints: 5,
      }),
    ])
    expect(leaderboard.find((row) => row.managerId === 'd')?.contributions).toEqual([
      expect.objectContaining({ source: 'top-performer', leaguePoints: FANTASY_TOP_PERFORMER_LEAGUE_POINTS }),
      expect.objectContaining({ source: 'top-performer', leaguePoints: FANTASY_TOP_PERFORMER_LEAGUE_POINTS }),
    ])
    leaderboard.forEach((row) => {
      expect(row.contributions.reduce((total, contribution) => total + contribution.leaguePoints, 0))
        .toBe(row.leaguePoints)
    })
  })

  it('applica i punti dei titolari anche ai round storici già materializzati', () => {
    const historicalRound = scoreFantasyRound(
      roundFixture(),
      [entry('manager-x', ['a', 'd'], 'd')],
      reportFixture(),
      feedbackSummaries,
      locksAt + FANTASY_SETTLEMENT_DELAY_MS,
    )

    const leaderboard = getFantasyLeaderboard([historicalRound])

    expect(leaderboard.find((row) => row.managerId === 'd')).toEqual(
      expect.objectContaining({
        leaguePoints: FANTASY_TOP_PERFORMER_LEAGUE_POINTS,
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
