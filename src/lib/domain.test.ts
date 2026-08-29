import {
  DEFAULT_VENUE,
  addGuestSignup,
  addSlotToPoll,
  addSignup,
  applyAdminSlotRosterAction,
  aggregateMatchMvpSummaries,
  defaultSlotForWeek,
  groupMatchReportSetsByTeams,
  getMatchPairings,
  getMatchMvpResponseId,
  getNextMatchMvpPromptAt,
  getOtherPlayedMatches,
  getPendingMatchMvpPrompts,
  getPlayerMatches,
  getReserves,
  getSlotPhase,
  getStarters,
  getUpcomingPolls,
  getUpcomingSlotWeeks,
  guestNameError,
  hasExistingSlotAtDateTime,
  isBookingCandidate,
  isGuestSignup,
  makeMatchReport,
  makePoll,
  matchSetInputsError,
  nextMondayDate,
  padelDateTimeToTimestamp,
  profileNameError,
  removeGuestSignup,
  removeSignup,
  removeSlotFromPoll,
  rescheduleSlot,
  setSlotBooking,
  setSignupRole,
  substituteStarter,
  toDateTimeInput,
} from './domain'
import type { MatchMvpResponse, MemberProfile, PadelPoll, PadelSlot, SessionUser, Signup, SignupRole } from '../types'

const member = (id: string, displayName = id): MemberProfile => ({
  id,
  displayName,
  email: `${id}@example.test`,
  createdAt: 1,
})

describe('nome del profilo', () => {
  it.each(['Evi', 'evininja', 'BoccataEVIDaria', 'previsto'])('rifiuta %s quando contiene Evi', (name) => {
    expect(profileNameError(name)).toBe('sei un asino')
  })

  it('accetta un nome che non contiene Evi', () => {
    expect(profileNameError('Brescio')).toBeNull()
  })
})

describe('nome dell’ospite', () => {
  it('accetta Evi perché il blocco scherzoso vale solo per i profili registrati', () => {
    expect(guestNameError('Evi ospite')).toBeNull()
  })

  it('richiede un nome leggibile', () => {
    expect(guestNameError(' ')).toBe('Scrivi il nome dell’ospite.')
  })
})

const signup = (id: string, joinedAt: number, role?: SignupRole): Signup => ({
  id: `signup-${id}`,
  userId: id,
  displayName: id.toUpperCase(),
  joinedAt,
  role,
})

const slot = (signups: Signup[] = []): PadelSlot => ({
  id: 'slot-1',
  startsAt: '2026-07-28T19:30:00.000Z',
  durationMinutes: 90,
  venue: '',
  signups,
})

describe('ordine adesioni', () => {
  it('mantiene la precedenza cronologica anche se gli input arrivano disordinati', () => {
    const current = slot([signup('b', 20), signup('a', 10), signup('c', 30)])
    expect(getStarters(current).map((item) => item.userId)).toEqual(['a', 'b', 'c'])
  })

  it('mette la quinta adesione in prima posizione tra le riserve', () => {
    let current = slot()
    ;['a', 'b', 'c', 'd', 'e'].forEach((id, index) => {
      current = addSignup(current, member(id), index + 1)
    })
    expect(getStarters(current).map((item) => item.userId)).toEqual(['a', 'b', 'c', 'd'])
    expect(getReserves(current).map((item) => item.userId)).toEqual(['e'])
  })

  it('promuove automaticamente la prima riserva quando un titolare si ritira', () => {
    const current = slot(['a', 'b', 'c', 'd', 'e'].map((id, index) => signup(id, index)))
    const updated = removeSignup(current, 'b')
    expect(getStarters(updated).map((item) => item.userId)).toEqual(['a', 'c', 'd', 'e'])
    expect(getReserves(updated)).toHaveLength(0)
  })

  it('ignora una doppia adesione dello stesso giocatore', () => {
    const current = slot([signup('a', 1)])
    expect(addSignup(current, member('a'), 2)).toBe(current)
  })

  it('aggiunge un ospite nello stesso ordine cronologico dei membri', () => {
    const current = slot([signup('a', 1)])
    const updated = addGuestSignup(current, '  Ciccio   Pasticcio  ', member('jury', 'Jury'), 2, 'starter')
    const guest = getStarters(updated)[1]

    expect(guest).toMatchObject({
      displayName: 'Ciccio Pasticcio',
      joinedAt: 2,
      role: 'starter',
      isGuest: true,
      addedBy: 'jury',
      addedByName: 'Jury',
    })
    expect(guest.userId).toMatch(/^guest_/)
  })

  it('rimuove solo un ospite e promuove la prima riserva per derivazione', () => {
    let current = slot(['a', 'b', 'c'].map((id, index) => signup(id, index + 1, 'starter')))
    current = addGuestSignup(current, 'Ciccio', member('jury'), 4, 'starter')
    current = {
      ...current,
      signups: [...current.signups, signup('reserve', 5, 'reserve')],
    }
    const guest = current.signups.find((entry) => entry.isGuest)
    const updated = removeGuestSignup(current, guest!.id)

    expect(getStarters(updated).map((entry) => entry.userId)).toEqual(['a', 'b', 'c', 'reserve'])
    expect(updated.signups.some((entry) => entry.isGuest)).toBe(false)
  })

  it('riconosce e rimuove un ospite legacy anche senza il flag isGuest', () => {
    const legacyGuest: Signup = {
      id: 'signup-legacy',
      userId: 'guest_legacy',
      displayName: 'Ospite legacy',
      joinedAt: 1,
      role: 'starter',
      addedBy: 'luigi',
      addedByName: 'Luigi',
    }

    expect(isGuestSignup(legacyGuest)).toBe(true)
    expect(isGuestSignup(signup('member', 2))).toBe(false)
    expect(removeGuestSignup(slot([legacyGuest]), legacyGuest.id).signups).toEqual([])
  })

  it('permette di scegliere la riserva anche quando ci sono posti da titolare', () => {
    const current = addSignup(slot(), member('a'), 1, 'reserve')

    expect(getStarters(current)).toHaveLength(0)
    expect(getReserves(current).map((item) => item.userId)).toEqual(['a'])
    expect(getSlotPhase(current)).toBe('collecting')
  })

  it('assegna un posto da titolare dopo una riserva volontaria senza cambiarne il ruolo', () => {
    let current = addSignup(slot(), member('a'), 1, 'reserve')
    current = addSignup(current, member('b'), 2, 'starter')

    expect(getStarters(current).map((item) => item.userId)).toEqual(['b'])
    expect(getReserves(current).map((item) => item.userId)).toEqual(['a'])
  })

  it('mantiene in riserva una scelta volontaria finché la formazione non era completa', () => {
    const current = slot([signup('a', 1, 'starter'), signup('b', 2, 'reserve')])
    const updated = removeSignup(current, 'a')

    expect(getStarters(updated)).toHaveLength(0)
    expect(getReserves(updated).map((item) => item.userId)).toEqual(['b'])
  })

  it('promuove la prima riserva esplicita se si ritira un titolare dalla formazione completa', () => {
    const current = slot([
      signup('a', 1, 'starter'),
      signup('b', 2, 'starter'),
      signup('c', 3, 'starter'),
      signup('d', 4, 'starter'),
      signup('e', 5, 'reserve'),
    ])
    const updated = removeSignup(current, 'b')

    expect(getStarters(updated).map((item) => item.userId)).toEqual(['a', 'c', 'd', 'e'])
    expect(getReserves(updated)).toHaveLength(0)
  })

  it('rifiuta una quinta adesione richiesta esplicitamente da titolare', () => {
    const current = slot(['a', 'b', 'c', 'd'].map((id, index) => signup(id, index, 'starter')))

    expect(() => addSignup(current, member('e'), 5, 'starter')).toThrow('quattro posti da titolare')
  })

  it('permette all’amministratore di spostare un titolare tra le riserve', () => {
    const current = slot([
      signup('a', 1, 'starter'),
      signup('b', 2, 'starter'),
      signup('c', 3, 'starter'),
      signup('d', 4, 'starter'),
    ])

    const updated = setSignupRole(current, 'signup-b', 'reserve')

    expect(getStarters(updated).map((item) => item.userId)).toEqual(['a', 'c', 'd'])
    expect(getReserves(updated).map((item) => item.userId)).toEqual(['b'])
  })

  it('permette all’amministratore di promuovere una riserva quando c’è posto', () => {
    const current = slot([
      signup('a', 1, 'starter'),
      signup('b', 2, 'reserve'),
    ])

    const updated = setSignupRole(current, 'signup-b', 'starter')

    expect(getStarters(updated).map((item) => item.userId)).toEqual(['a', 'b'])
    expect(getReserves(updated)).toHaveLength(0)
  })

  it('non permette all’amministratore di superare quattro titolari', () => {
    const current = slot([
      signup('a', 1, 'starter'),
      signup('b', 2, 'starter'),
      signup('c', 3, 'starter'),
      signup('d', 4, 'starter'),
      signup('e', 5, 'reserve'),
    ])

    expect(() => setSignupRole(current, 'signup-e', 'starter'))
      .toThrow('Sposta prima un titolare')
  })

  it('rimuove qualsiasi adesione amministrativa e promuove la prima riserva', () => {
    const current = slot([
      signup('a', 1, 'starter'),
      signup('b', 2, 'starter'),
      signup('c', 3, 'starter'),
      signup('d', 4, 'starter'),
      signup('e', 5, 'reserve'),
    ])

    const updated = applyAdminSlotRosterAction(current, {
      kind: 'remove',
      signupId: 'signup-b',
    })

    expect(getStarters(updated).map((item) => item.userId)).toEqual(['a', 'c', 'd', 'e'])
    expect(getReserves(updated)).toHaveLength(0)
  })

  it('aggiunge amministrativamente un altro membro nel ruolo scelto', () => {
    const updated = applyAdminSlotRosterAction(slot(), {
      kind: 'add',
      member: member('a'),
      role: 'reserve',
    }, 42)

    expect(updated.signups[0]).toMatchObject({ userId: 'a', role: 'reserve', joinedAt: 42 })
  })
})

describe('referto dei set', () => {
  const playedSlot = {
    ...slot(['a', 'b', 'c', 'd'].map((id, index) => signup(id, index + 1))),
    bookedAt: 1,
    venue: DEFAULT_VENUE,
  }
  const match = {
    pollId: 'poll-1',
    pollTitle: 'Padel · 27 lug – 2 ago 2026',
    slot: playedSlot,
  }

  it('propone soltanto le tre coppie possibili tra i quattro titolari', () => {
    expect(getMatchPairings(playedSlot).map((pairing) => [
      pairing.teamA.map((player) => player.userId),
      pairing.teamB.map((player) => player.userId),
    ])).toEqual([
      [['a', 'b'], ['c', 'd']],
      [['a', 'c'], ['b', 'd']],
      [['a', 'd'], ['b', 'c']],
    ])
  })

  it('salva coppie, punteggi e autori preservando la creazione nelle modifiche', () => {
    const created = makeMatchReport(match, member('a', 'Ale'), [
      { teamAUserIds: ['a', 'b'], scoreA: 6, scoreB: 4 },
      { teamAUserIds: ['a', 'c'], scoreA: 3, scoreB: 6 },
    ], undefined, 100)

    expect(created).toMatchObject({
      id: 'poll-1__slot-1',
      participantIds: ['a', 'b', 'c', 'd'],
      createdBy: 'a',
      createdByName: 'Ale',
      createdAt: 100,
      updatedAt: 100,
    })
    expect(created.sets).toEqual([
      {
        id: 'set-1',
        teamA: [
          { userId: 'a', displayName: 'A' },
          { userId: 'b', displayName: 'B' },
        ],
        teamB: [
          { userId: 'c', displayName: 'C' },
          { userId: 'd', displayName: 'D' },
        ],
        scoreA: 6,
        scoreB: 4,
      },
      {
        id: 'set-2',
        teamA: [
          { userId: 'a', displayName: 'A' },
          { userId: 'c', displayName: 'C' },
        ],
        teamB: [
          { userId: 'b', displayName: 'B' },
          { userId: 'd', displayName: 'D' },
        ],
        scoreA: 3,
        scoreB: 6,
      },
    ])

    const renamedMatch = {
      ...match,
      slot: {
        ...match.slot,
        signups: match.slot.signups.map((item) => (
          item.userId === 'a' ? { ...item, displayName: 'Alex' } : item
        )),
      },
    }
    const updated = makeMatchReport(renamedMatch, member('b', 'Baru'), [
      { teamAUserIds: ['a', 'd'], scoreA: 7, scoreB: 5 },
    ], created, 200)
    expect(updated).toMatchObject({
      createdBy: 'a',
      createdByName: 'Ale',
      createdAt: 100,
      updatedBy: 'b',
      updatedByName: 'Baru',
      updatedAt: 200,
    })
    expect(updated.participants[0].displayName).toBe('Alex')
    expect(updated.sets[0].teamA[0].displayName).toBe('Alex')
  })

  it('raggruppa i set per squadre e riallinea i punteggi se vengono invertite', () => {
    const report = makeMatchReport(match, member('a'), [
      { teamAUserIds: ['a', 'b'], scoreA: 6, scoreB: 4 },
      { teamAUserIds: ['a', 'c'], scoreA: 3, scoreB: 6 },
      { teamAUserIds: ['c', 'd'], scoreA: 5, scoreB: 7 },
    ], undefined, 100)

    expect(groupMatchReportSetsByTeams(report.sets)).toEqual([
      {
        key: '["[\\"a\\",\\"b\\"]","[\\"c\\",\\"d\\"]"]',
        teamA: [
          { userId: 'a', displayName: 'A' },
          { userId: 'b', displayName: 'B' },
        ],
        teamB: [
          { userId: 'c', displayName: 'C' },
          { userId: 'd', displayName: 'D' },
        ],
        sets: [
          { setId: 'set-1', setNumber: 1, scoreA: 6, scoreB: 4 },
          { setId: 'set-3', setNumber: 3, scoreA: 7, scoreB: 5 },
        ],
      },
      {
        key: '["[\\"a\\",\\"c\\"]","[\\"b\\",\\"d\\"]"]',
        teamA: [
          { userId: 'a', displayName: 'A' },
          { userId: 'c', displayName: 'C' },
        ],
        teamB: [
          { userId: 'b', displayName: 'B' },
          { userId: 'd', displayName: 'D' },
        ],
        sets: [
          { setId: 'set-2', setNumber: 2, scoreA: 3, scoreB: 6 },
        ],
      },
    ])
  })

  it('rifiuta set in parità e collega il referto allo storico personale', () => {
    expect(matchSetInputsError(playedSlot, [
      { teamAUserIds: ['a', 'b'], scoreA: 6, scoreB: 6 },
    ])).toBe('Il set 1 non può finire in parità.')

    const report = makeMatchReport(match, member('a'), [
      { teamAUserIds: ['a', 'b'], scoreA: 6, scoreB: 2 },
    ], undefined, 100)
    const poll: PadelPoll = {
      id: match.pollId,
      title: match.pollTitle,
      targetWeekStart: '2026-07-27',
      createdBy: 'a',
      createdByName: 'A',
      createdAt: 1,
      updatedAt: 1,
      status: 'closed',
      slots: [playedSlot],
    }
    const lists = getPlayerMatches(
      [poll],
      'a',
      padelDateTimeToTimestamp(playedSlot.startsAt) + playedSlot.durationMinutes * 60_000 + 1,
      [],
      [report],
    )

    expect(lists.past[0].report).toEqual(report)
    expect(lists.past[0].pollTitle).toBe('Padel · 27 lug – 2 ago 2026')
  })
})

describe('ordine e visibilità dei sondaggi', () => {
  it('raggruppa al volo gli slot della stessa settimana anche se arrivano da documenti diversi', () => {
    const firstPoll: PadelPoll = {
      id: 'poll-first',
      title: 'Titolo storico errato',
      targetWeekStart: '2026-08-10',
      createdBy: 'jury',
      createdByName: 'Jury',
      createdAt: 1,
      updatedAt: 1,
      status: 'open',
      slots: [{ ...slot(), id: 'monday', startsAt: '2026-08-17T16:30:00.000Z' }],
    }
    const secondPoll: PadelPoll = {
      ...firstPoll,
      id: 'poll-second',
      createdBy: 'luigi',
      createdByName: 'Luigi',
      slots: [{ ...slot(), id: 'sunday', startsAt: '2026-08-23T07:00:00.000Z' }],
    }

    const groups = getUpcomingSlotWeeks(
      [secondPoll, firstPoll],
      new Date('2026-08-16T12:00:00.000Z').getTime(),
    )

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ id: 'week-2026-08-17', weekStart: '2026-08-17' })
    expect(groups[0].entries.map(({ poll, slot: item }) => [poll.id, item.id])).toEqual([
      ['poll-first', 'monday'],
      ['poll-second', 'sunday'],
    ])
  })

  it('mostra prima il sondaggio con lo slot futuro più vicino', () => {
    const nearPoll: PadelPoll = {
      id: 'poll-near',
      title: 'Settimana vicina',
      targetWeekStart: '2026-07-27',
      createdBy: 'jury',
      createdByName: 'Jury',
      createdAt: 1,
      updatedAt: 1,
      status: 'open',
      slots: [{ ...slot(), startsAt: '2026-07-28T19:30:00.000Z' }],
    }
    const laterPoll: PadelPoll = {
      ...nearPoll,
      id: 'poll-later',
      title: 'Settimana successiva',
      targetWeekStart: '2026-08-03',
      createdAt: 2,
      slots: [{ ...slot(), startsAt: '2026-08-05T18:30:00.000Z' }],
    }

    const result = getUpcomingPolls(
      [laterPoll, nearPoll],
      new Date('2026-07-21T12:00:00.000Z').getTime(),
    )

    expect(result.map((poll) => poll.id)).toEqual(['poll-near', 'poll-later'])
  })

  it('mantiene visibili gli slot in corso e li nasconde soltanto dopo la fine', () => {
    const now = new Date('2026-07-28T19:30:00.000Z').getTime()
    const current: PadelPoll = {
      id: 'poll-mixed',
      title: 'Settimana mista',
      targetWeekStart: '2026-07-27',
      createdBy: 'jury',
      createdByName: 'Jury',
      createdAt: 1,
      updatedAt: 1,
      status: 'open',
      slots: [
        { ...slot(), id: 'past', startsAt: '2026-07-27T19:30:00.000Z' },
        { ...slot(), id: 'starting-now' },
        { ...slot(), id: 'in-progress', startsAt: '2026-07-28T18:30:00.001Z' },
        { ...slot(), id: 'future', startsAt: '2026-07-30T19:30:00.000Z' },
      ],
    }
    const pastOnly = {
      ...current,
      id: 'poll-past',
      slots: [{ ...slot(), id: 'past-only', startsAt: '2026-07-27T18:30:00.000Z' }],
    }

    const result = getUpcomingPolls([pastOnly, current], now)

    expect(result).toHaveLength(1)
    expect(result[0].slots.map((item) => item.id)).toEqual([
      'in-progress',
      'starting-now',
      'future',
    ])
    expect(current.slots).toHaveLength(4)
  })

  it('rimuove uno slot quando la sua durata è terminata', () => {
    const current: PadelPoll = {
      id: 'poll-current',
      title: 'Settimana corrente',
      targetWeekStart: '2026-07-27',
      createdBy: 'jury',
      createdByName: 'Jury',
      createdAt: 1,
      updatedAt: 1,
      status: 'open',
      slots: [{ ...slot(), startsAt: '2026-07-28T18:00:00.000Z', durationMinutes: 90 }],
    }

    expect(getUpcomingPolls(
      [current],
      new Date('2026-07-28T19:29:59.999Z').getTime(),
    )).toHaveLength(1)
    expect(getUpcomingPolls(
      [current],
      new Date('2026-07-28T19:30:00.000Z').getTime(),
    )).toHaveLength(0)
  })
})

describe('partite personali', () => {
  const personalPoll = (): PadelPoll => ({
    id: 'poll-personal',
    title: 'Settimana personale',
    targetWeekStart: '2026-07-27',
    createdBy: 'jury',
    createdByName: 'Jury',
    createdAt: 1,
    updatedAt: 1,
    status: 'closed',
    slots: [],
  })

  it('include soltanto gli slot futuri completi in cui il giocatore è titolare', () => {
    const poll = personalPoll()
    poll.slots = [
      {
        ...slot(['jury', 'a', 'b', 'c'].map((id, index) => signup(id, index, 'starter'))),
        id: 'future-later',
        startsAt: '2026-07-30T19:30:00.000Z',
      },
      {
        ...slot(['jury', 'a', 'b', 'c'].map((id, index) => signup(id, index, 'starter'))),
        id: 'future-near',
        startsAt: '2026-07-29T19:30:00.000Z',
      },
      {
        ...slot([signup('jury', 1, 'starter')]),
        id: 'future-incomplete',
        startsAt: '2026-07-28T19:30:00.000Z',
      },
      {
        ...slot([
          signup('a', 1, 'starter'),
          signup('b', 2, 'starter'),
          signup('c', 3, 'starter'),
          signup('d', 4, 'starter'),
          signup('jury', 5, 'reserve'),
        ]),
        id: 'future-reserve',
        startsAt: '2026-07-31T19:30:00.000Z',
      },
    ]

    const result = getPlayerMatches(
      [poll],
      'jury',
      Date.parse('2026-07-28T12:00:00.000Z'),
    )

    expect(result.upcoming.map((match) => match.slot.id)).toEqual(['future-near', 'future-later'])
    expect(result.past).toEqual([])
  })

  it('considera giocate soltanto le partite prenotate e concluse, dalla più recente', () => {
    const poll = personalPoll()
    poll.slots = [
      {
        ...slot(['jury', 'a', 'b', 'c'].map((id, index) => signup(id, index))),
        id: 'past-booked-old',
        startsAt: '2026-07-25T18:30:00.000Z',
        bookedAt: 1,
      },
      {
        ...slot(['jury', 'a', 'b', 'c'].map((id, index) => signup(id, index))),
        id: 'past-booked-recent',
        startsAt: '2026-07-27T18:30:00.000Z',
        bookedAt: 2,
      },
      {
        ...slot(['jury', 'a', 'b', 'c'].map((id, index) => signup(id, index))),
        id: 'past-unbooked',
        startsAt: '2026-07-26T18:30:00.000Z',
      },
      {
        ...slot(['jury', 'a', 'b', 'c'].map((id, index) => signup(id, index))),
        id: 'ongoing',
        startsAt: '2026-07-28T11:30:00.000Z',
        durationMinutes: 90,
        bookedAt: 3,
      },
      {
        ...slot([signup('jury', 1)]),
        id: 'past-incomplete',
        startsAt: '2026-07-24T18:30:00.000Z',
        bookedAt: 4,
      },
    ]

    const result = getPlayerMatches([poll], 'jury', Date.parse('2026-07-28T12:00:00.000Z'))

    expect(result.past.map((match) => match.slot.id)).toEqual(['past-booked-recent', 'past-booked-old'])
    expect(result.upcoming).toEqual([])
  })

  it('mostra quante preferenze MVP ha ricevuto il giocatore e se ha vinto', () => {
    const poll = personalPoll()
    poll.slots = [{
      ...slot(['jury', 'a', 'b', 'c'].map((id, index) => signup(id, index))),
      id: 'past-rated',
      startsAt: '2026-07-27T18:30:00.000Z',
      bookedAt: 1,
    }]
    const result = getPlayerMatches(
      [poll],
      'jury',
      Date.parse('2026-07-28T12:00:00.000Z'),
      [{
        id: `${poll.id}__past-rated__jury`,
        pollId: poll.id,
        slotId: 'past-rated',
        playerId: 'jury',
        voteCount: 2,
        lastResponseId: 'response-b',
        updatedAt: 1,
      }],
    )

    expect(result.past[0].receivedMvp).toEqual({ votes: 2, isWinner: true })
  })
})

describe('partite giocate dagli altri', () => {
  const mvpResponse = (
    voterId: string,
    selectedPlayerId: string,
    closedAt: number,
  ): MatchMvpResponse => ({
    id: `poll-group__slot-other__${voterId}`,
    pollId: 'poll-group',
    slotId: 'slot-other',
    voterId,
    status: 'submitted',
    selectedPlayerId,
    selectedPlayerName: selectedPlayerId,
    closedAt,
  })

  it('aggrega le preferenze MVP senza esporre chi le ha assegnate', () => {
    expect(aggregateMatchMvpSummaries([
      mvpResponse('a', 'b', 100),
      mvpResponse('c', 'b', 200),
    ])).toEqual([
      {
        id: 'poll-group__slot-other__b',
        pollId: 'poll-group',
        slotId: 'slot-other',
        playerId: 'b',
        voteCount: 2,
        lastResponseId: 'poll-group__slot-other__c',
        updatedAt: 200,
      },
    ])
  })

  it('mostra soltanto match prenotati e conclusi senza il titolare corrente', () => {
    const otherSlot: PadelSlot = {
      ...slot(['a', 'b', 'c', 'd'].map((id, index) => signup(id, index + 1))),
      id: 'slot-other',
      startsAt: '2026-07-27T18:30:00.000Z',
      bookedAt: 1,
    }
    const reserveSlot: PadelSlot = {
      ...slot([
        ...['e', 'f', 'g', 'h'].map((id, index) => signup(id, index + 1)),
        signup('jury', 5, 'reserve'),
      ]),
      id: 'slot-reserve',
      startsAt: '2026-07-26T18:30:00.000Z',
      bookedAt: 1,
    }
    const report = makeMatchReport({
      pollId: 'poll-group',
      pollTitle: 'Padel del gruppo',
      slot: otherSlot,
    }, member('a'), [
      { teamAUserIds: ['a', 'b'], scoreA: 6, scoreB: 4 },
    ], undefined, 100)
    const poll: PadelPoll = {
      id: 'poll-group',
      title: 'Titolo storico',
      targetWeekStart: '2026-07-27',
      createdBy: 'a',
      createdByName: 'A',
      createdAt: 1,
      updatedAt: 1,
      status: 'closed',
      slots: [
        otherSlot,
        reserveSlot,
        {
          ...otherSlot,
          id: 'slot-with-jury',
          signups: ['jury', 'b', 'c', 'd'].map((id, index) => signup(id, index + 1)),
        },
        { ...otherSlot, id: 'slot-unbooked', bookedAt: undefined },
        { ...otherSlot, id: 'slot-ongoing', startsAt: '2026-07-28T11:30:00.000Z' },
        { ...otherSlot, id: 'slot-incomplete', signups: [signup('a', 1)] },
      ],
    }
    const summaries = aggregateMatchMvpSummaries([
      mvpResponse('a', 'b', 100),
      mvpResponse('c', 'b', 200),
    ])

    const result = getOtherPlayedMatches(
      [poll],
      'jury',
      Date.parse('2026-07-28T12:00:00.000Z'),
      summaries,
      [report],
    )

    expect(result.map((match) => match.slot.id)).toEqual(['slot-other', 'slot-reserve'])
    expect(result[0].pollTitle).toBe('Padel · 27 lug – 2 ago 2026')
    expect(result[0].report).toEqual(report)
    expect(result[0].playerMvpVotes).toContainEqual({
      userId: 'b',
      votes: 2,
      isWinner: true,
    })
    expect(result[0].playerMvpVotes).toContainEqual({ userId: 'a', votes: 0, isWinner: false })
  })
})

describe('scelta MVP di fine partita', () => {
  const ratingPoll = (): PadelPoll => ({
    id: 'poll-rating',
    title: 'Padel del martedì',
    targetWeekStart: '2026-07-27',
    createdBy: 'jury',
    createdByName: 'Jury',
    createdAt: 1,
    updatedAt: 1,
    status: 'closed',
    slots: [{
      ...slot(['jury', 'ale', 'luca', 'teo'].map((id, index) => signup(id, index))),
      id: 'slot-rating',
      startsAt: '2026-07-28T09:00',
      durationMinutes: 90,
      venue: DEFAULT_VENUE,
      bookedAt: 1,
    }],
  })

  it('interpreta gli orari senza offset come ora italiana anche nel processo notifiche', () => {
    expect(padelDateTimeToTimestamp('2026-07-28T09:00'))
      .toBe(Date.parse('2026-07-28T07:00:00.000Z'))
    expect(padelDateTimeToTimestamp('2026-12-15T09:00'))
      .toBe(Date.parse('2026-12-15T08:00:00.000Z'))
    expect(padelDateTimeToTimestamp('2026-07-28T09:00:00.000Z'))
      .toBe(Date.parse('2026-07-28T09:00:00.000Z'))
  })

  it('propone i tre compagni appena finisce un campo prenotato', () => {
    const polls = [ratingPoll()]
    const dueAt = Date.parse('2026-07-28T08:30:00.000Z')

    expect(getPendingMatchMvpPrompts(polls, [], 'jury', dueAt - 1)).toHaveLength(0)
    expect(getNextMatchMvpPromptAt(polls, [], 'jury', dueAt - 1)).toBe(dueAt)

    const prompts = getPendingMatchMvpPrompts(polls, [], 'jury', dueAt)
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toMatchObject({
      id: 'poll-rating__slot-rating__jury',
      voterId: 'jury',
      sessionEndedAt: Date.parse('2026-07-28T08:30:00.000Z'),
      dueAt,
    })
    expect(prompts[0].candidates.map((candidate) => candidate.userId)).toEqual(['ale', 'luca', 'teo'])
  })

  it('non ripropone una scheda già chiusa e ignora riserve o formazioni incomplete', () => {
    const current = ratingPoll()
    const dueAt = Date.parse('2026-07-28T08:30:00.000Z')
    const responseId = getMatchMvpResponseId(current.id, current.slots[0].id, 'jury')

    expect(getPendingMatchMvpPrompts([current], [{
      id: responseId,
      pollId: current.id,
      slotId: current.slots[0].id,
      voterId: 'jury',
      status: 'dismissed',
      closedAt: dueAt,
    }], 'jury', dueAt)).toHaveLength(0)
    expect(getPendingMatchMvpPrompts([current], [], 'reserve', dueAt)).toHaveLength(0)
    expect(getPendingMatchMvpPrompts([{
      ...current,
      slots: [{ ...current.slots[0], signups: current.slots[0].signups.slice(0, 3) }],
    }], [], 'jury', dueAt)).toHaveLength(0)
  })

  it('lascia scadere una richiesta MVP non completata dopo sette giorni', () => {
    const current = ratingPoll()
    const dueAt = Date.parse('2026-07-28T08:30:00.000Z')
    const sevenDays = 7 * 24 * 60 * 60 * 1000

    expect(getPendingMatchMvpPrompts([current], [], 'jury', dueAt + sevenDays - 1)).toHaveLength(1)
    expect(getPendingMatchMvpPrompts([current], [], 'jury', dueAt + sevenDays)).toHaveLength(0)
    expect(getNextMatchMvpPromptAt([current], [], 'jury', dueAt + sevenDays)).toBeNull()
  })

  it('esclude gli ospiti dalla scelta MVP ma mantiene valido il match da quattro titolari', () => {
    const current = ratingPoll()
    current.slots[0].signups[3] = {
      ...current.slots[0].signups[3],
      userId: 'guest_ciccio',
      displayName: 'Ciccio',
      isGuest: true,
    }
    const dueAt = Date.parse('2026-07-28T08:30:00.000Z')
    const prompt = getPendingMatchMvpPrompts([current], [], 'jury', dueAt)[0]

    expect(prompt.candidates.map((candidate) => candidate.userId)).toEqual(['ale', 'luca'])
  })
})

describe('sostituzioni', () => {
  it('sostituisce un titolare con una riserva preservando il posto e rimuovendo il doppione', () => {
    const current = slot(['a', 'b', 'c', 'd', 'e'].map((id, index) => signup(id, index)))
    const updated = substituteStarter(current, 'b', member('e', 'Elena'), 99)
    expect(getStarters(updated).map((item) => item.userId)).toEqual(['a', 'e', 'c', 'd'])
    expect(updated.signups).toHaveLength(4)
    expect(updated.signups[1].substitutedFor).toEqual({ userId: 'b', displayName: 'B', at: 99 })
  })

  it('sostituisce un titolare con un membro non ancora segnato senza cambiare il totale', () => {
    const current = slot(['a', 'b', 'c', 'd', 'e'].map((id, index) => signup(id, index)))
    const updated = substituteStarter(current, 'a', member('f', 'Franca'), 99)
    expect(getStarters(updated)[0].userId).toBe('f')
    expect(updated.signups).toHaveLength(5)
    expect(getReserves(updated)[0].userId).toBe('e')
  })

  it('impedisce di scegliere un altro titolare come sostituto', () => {
    const current = slot(['a', 'b', 'c', 'd'].map((id, index) => signup(id, index)))
    expect(() => substituteStarter(current, 'a', member('b'))).toThrow('già tra i titolari')
  })
})

describe('stato slot e creazione sondaggio', () => {
  it('passa da raccolta a prenotabile a prenotato', () => {
    expect(getSlotPhase(slot([signup('a', 1)]))).toBe('collecting')
    const ready = slot(['a', 'b', 'c', 'd'].map((id, index) => signup(id, index)))
    expect(getSlotPhase(ready)).toBe('ready')
    expect(getSlotPhase({ ...ready, bookedAt: 12 })).toBe('booked')
  })

  it('considera da prenotare solo uno slot non confermato con quattro titolari', () => {
    const twoPlayers = slot(['a', 'b'].map((id, index) => signup(id, index)))
    const threePlayers = slot(['a', 'b', 'c'].map((id, index) => signup(id, index)))
    const fourPlayers = slot(['a', 'b', 'c', 'd'].map((id, index) => signup(id, index)))
    const fourPlayersAndReserve = slot([
      ...fourPlayers.signups,
      { ...signup('reserve', 5), role: 'reserve' },
    ])

    expect(isBookingCandidate(twoPlayers)).toBe(false)
    expect(isBookingCandidate(threePlayers)).toBe(false)
    expect(isBookingCandidate(fourPlayers)).toBe(true)
    expect(isBookingCandidate(fourPlayersAndReserve)).toBe(true)
    expect(isBookingCandidate({ ...fourPlayers, bookedAt: 12 })).toBe(false)
  })

  it('registra sempre la prenotazione all’Oasi Boschetto senza richiedere quattro giocatori', () => {
    const current = slot([signup('a', 1)])
    const booked = setSlotBooking(current, member('jury', 'Jury'), 12)

    expect(booked.signups).toEqual(current.signups)
    expect(booked).toMatchObject({
      venue: DEFAULT_VENUE,
      bookedAt: 12,
      bookedBy: 'jury',
      bookedByName: 'Jury',
    })
    expect(getSlotPhase(booked)).toBe('booked')
  })

  it('deriva la settimana dagli slot, assegna il titolo, ordina gli slot e rifiuta duplicati', () => {
    const creator: SessionUser = member('jury', 'Jury')
    const poll = makePoll(
      {
        slots: [
          { startsAt: '2026-07-30T20:00', durationMinutes: 90 },
          { startsAt: '2026-07-28T19:30', durationMinutes: 90 },
        ],
      },
      creator,
      100,
    )
    expect(poll.title).toBe('Padel · 27 lug – 2 ago 2026')
    expect(poll.targetWeekStart).toBe('2026-07-27')
    expect(poll.slots.map((item) => item.startsAt)).toEqual([
      '2026-07-28T17:30:00.000Z',
      '2026-07-30T18:00:00.000Z',
    ])
    expect(poll.slots[0]).toMatchObject({
      createdAt: 100,
      createdBy: 'jury',
      createdByName: 'Jury',
    })

    expect(() => makePoll(
      {
        slots: [
          { startsAt: '2026-07-28T19:30', durationMinutes: 90 },
          { startsAt: '2026-07-28T19:30', durationMinutes: 60 },
        ],
      },
      creator,
    )).toThrow('due slot uguali')
  })

  it('accetta soltanto orari alla mezz’ora o all’ora esatta', () => {
    const creator: SessionUser = member('jury', 'Jury')

    expect(() => makePoll(
      {
        slots: [{ startsAt: '2026-07-28T19:15', durationMinutes: 90 }],
      },
      creator,
    )).toThrow('minuti 00 oppure 30')
  })

  it('riconosce gli slot esistenti alla stessa data e ora nel fuso di Roma', () => {
    const existingSlots = [
      { startsAt: '2026-07-28T17:00:00.000Z' },
      { startsAt: '2026-12-15T08:30:00.000Z' },
    ]

    expect(hasExistingSlotAtDateTime('2026-07-28T19:00', existingSlots)).toBe(true)
    expect(hasExistingSlotAtDateTime('2026-12-15T09:30', existingSlots)).toBe(true)
    expect(hasExistingSlotAtDateTime('2026-07-28T19:30', existingSlots)).toBe(false)
    expect(hasExistingSlotAtDateTime('non-una-data', existingSlots)).toBe(false)
  })

  it('calcola sempre il lunedì della settimana successiva', () => {
    expect(nextMondayDate(new Date('2026-07-20T12:00:00.000Z'))).toBe('2026-07-27')
    expect(nextMondayDate(new Date('2026-07-22T12:00:00.000Z'))).toBe('2026-07-27')
    expect(nextMondayDate(new Date('2026-07-19T22:30:00.000Z'))).toBe('2026-07-27')
  })

  it('prepara i campi data e ora nel fuso di Roma', () => {
    expect(toDateTimeInput(new Date('2026-07-28T16:30:00.000Z'))).toBe('2026-07-28T18:30')
    expect(toDateTimeInput(new Date('2026-12-15T08:00:00.000Z'))).toBe('2026-12-15T09:00')
  })

  it('propone gli slot a partire dal lunedì anche con una data infrasettimanale', () => {
    expect(defaultSlotForWeek('2026-08-05', 1)).toBe('2026-08-04T19:30')
  })

  it('sposta uno slot conservando adesioni e prenotazione e riordina il sondaggio', () => {
    const booked = {
      ...slot([signup('a', 1)]),
      venue: 'Bandeja Club',
      bookedAt: 10,
      bookedBy: 'jury',
      bookedByName: 'Jury',
    }
    const later = { ...slot(), id: 'slot-2', startsAt: '2026-07-30T19:30:00.000Z' }
    const current: PadelPoll = {
      id: 'poll-1',
      title: 'Test',
      targetWeekStart: '2026-07-27',
      createdBy: 'jury',
      createdByName: 'Jury',
      createdAt: 1,
      updatedAt: 1,
      status: 'open',
      slots: [booked, later],
    }

    const updated = rescheduleSlot(current, booked.id, '2026-07-31T20:00', 99)

    expect(updated.updatedAt).toBe(99)
    expect(updated.slots.map((item) => item.id)).toEqual(['slot-2', 'slot-1'])
    expect(updated.slots[1]).toMatchObject({
      startsAt: '2026-07-31T18:00:00.000Z',
      venue: 'Bandeja Club',
      bookedAt: 10,
      signups: booked.signups,
    })
    expect(() => rescheduleSlot(current, booked.id, later.startsAt)).toThrow('Esiste già uno slot')
  })

  it('lascia la settimana fuori dalla modifica e la deriva dalla nuova data dello slot', () => {
    const current: PadelPoll = {
      id: 'poll-1',
      title: 'Padel · 31 ago – 6 set 2026',
      targetWeekStart: '2026-08-31',
      createdBy: 'brescio',
      createdByName: 'brescio',
      createdAt: 1,
      updatedAt: 1,
      status: 'open',
      slots: [
        { ...slot(), id: 'slot-1', startsAt: '2026-09-01T16:30:00.000Z' },
        { ...slot(), id: 'slot-2', startsAt: '2026-09-02T16:30:00.000Z' },
        { ...slot(), id: 'slot-3', startsAt: '2026-09-03T16:30:00.000Z' },
      ],
    }

    const first = rescheduleSlot(current, 'slot-1', '2026-08-25T18:30')
    const second = rescheduleSlot(first, 'slot-2', '2026-08-26T18:30')
    const updated = rescheduleSlot(second, 'slot-3', '2026-08-27T18:30')

    expect(updated).toMatchObject({
      targetWeekStart: '2026-08-31',
      title: 'Padel · 31 ago – 6 set 2026',
    })
    expect(getUpcomingSlotWeeks(
      [updated],
      new Date('2026-08-24T12:00:00.000Z').getTime(),
    ).map((group) => group.weekStart)).toEqual(['2026-08-24'])
  })

  it('elimina uno slot preservando gli altri e consente di rimuovere anche l’ultimo', () => {
    const first = slot([signup('a', 1)])
    const second = { ...slot(), id: 'slot-2', startsAt: '2026-07-30T19:30:00.000Z' }
    const current: PadelPoll = {
      id: 'poll-1',
      title: 'Test',
      targetWeekStart: '2026-07-27',
      createdBy: 'jury',
      createdByName: 'Jury',
      createdAt: 1,
      updatedAt: 1,
      status: 'open',
      slots: [first, second],
    }

    const updated = removeSlotFromPoll(current, first.id, 99)

    expect(updated.updatedAt).toBe(99)
    expect(updated.slots).toEqual([second])
    expect(current.slots).toHaveLength(2)
    expect(removeSlotFromPoll(updated, second.id).slots).toEqual([])
    expect(() => removeSlotFromPoll(current, 'slot-assente')).toThrow('Slot non trovato')
  })

  it('aggiunge uno slot a un sondaggio aperto con autore e istante di creazione', () => {
    const current: PadelPoll = {
      id: 'poll-1',
      title: 'Test',
      targetWeekStart: '2026-07-27',
      createdBy: 'jury',
      createdByName: 'Jury',
      createdAt: 1,
      updatedAt: 1,
      status: 'open',
      slots: [slot()],
    }

    const updated = addSlotToPoll(
      current,
      { startsAt: '2026-07-27T18:30', durationMinutes: 90 },
      member('ale', 'Ale'),
      99,
    )

    expect(updated.updatedAt).toBe(99)
    expect(updated.slots).toHaveLength(2)
    expect(updated.slots[0]).toMatchObject({
      startsAt: '2026-07-27T16:30:00.000Z',
      createdAt: 99,
      createdBy: 'ale',
      createdByName: 'Ale',
      signups: [],
    })
  })

  it('non aggiunge duplicati o nuovi slot a un sondaggio chiuso', () => {
    const current: PadelPoll = {
      id: 'poll-1',
      title: 'Test',
      targetWeekStart: '2026-07-27',
      createdBy: 'jury',
      createdByName: 'Jury',
      createdAt: 1,
      updatedAt: 1,
      status: 'open',
      slots: [slot()],
    }

    expect(() => addSlotToPoll(
      current,
      { startsAt: current.slots[0].startsAt, durationMinutes: 90 },
      member('ale'),
    )).toThrow('Esiste già uno slot')
    expect(() => addSlotToPoll(
      { ...current, status: 'closed' },
      { startsAt: '2026-07-30T18:30', durationMinutes: 90 },
      member('ale'),
    )).toThrow('Riapri il sondaggio')
  })
})
