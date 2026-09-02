import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  FantasyRound,
  MatchFeedbackPrompt,
  PadelPoll,
  PlayerMatch,
  SessionUser,
} from '../types'
import { SLOT_ADMIN_USER_ID } from './admin'

const firestoreMocks = vi.hoisted(() => {
  const batch = {
    set: vi.fn(),
    commit: vi.fn<() => Promise<void>>(),
  }
  const transaction = {
    get: vi.fn(),
    set: vi.fn(),
    update: vi.fn(),
  }
  return {
    batch,
    transaction,
    collection: vi.fn((_database: unknown, ...segments: string[]) => segments.join('/')),
    doc: vi.fn((databaseOrCollection: unknown, ...segments: string[]) => (
      segments.length === 0 && typeof databaseOrCollection === 'string'
        ? `${databaseOrCollection}/generated`
        : segments.join('/')
    )),
    runTransaction: vi.fn((_database: unknown, operation: (current: typeof transaction) => unknown) => (
      operation(transaction)
    )),
    writeBatch: vi.fn(() => batch),
  }
})

vi.mock('./firebase', () => ({
  firestore: {},
  hasRemoteBackend: true,
}))

vi.mock('firebase/firestore', async (importOriginal) => {
  const original = await importOriginal<typeof import('firebase/firestore')>()
  return {
    ...original,
    collection: firestoreMocks.collection,
    doc: firestoreMocks.doc,
    runTransaction: firestoreMocks.runTransaction,
    writeBatch: firestoreMocks.writeBatch,
  }
})

import { repository } from './repository'

const voter: SessionUser = {
  id: 'jury',
  displayName: 'Jury',
  email: 'jury@example.test',
  createdAt: 1,
}

const admin: SessionUser = {
  ...voter,
  id: SLOT_ADMIN_USER_ID,
}

const prompt: MatchFeedbackPrompt = {
  id: 'poll-1__slot-1__jury',
  pollId: 'poll-1',
  pollTitle: 'Padel del lunedì',
  slotId: 'slot-1',
  sessionStartsAt: '2026-07-27T18:30',
  sessionEndedAt: 100,
  dueAt: 200,
  reviewerId: voter.id,
  candidates: [
    { userId: 'ale', displayName: 'Ale' },
    { userId: 'luca', displayName: 'Luca' },
    { userId: 'teo', displayName: 'Teo' },
  ],
}

const playedMatch: PlayerMatch = {
  pollId: 'poll-1',
  pollTitle: 'Padel del lunedì',
  slot: {
    id: 'slot-1',
    startsAt: '2026-07-27T18:30:00.000Z',
    durationMinutes: 90,
    venue: 'Oasi Boschetto',
    bookedAt: 1,
    signups: [
      { id: 'a', userId: 'jury', displayName: 'Jury', joinedAt: 1 },
      { id: 'b', userId: 'ale', displayName: 'Ale', joinedAt: 2 },
      { id: 'c', userId: 'luca', displayName: 'Luca', joinedAt: 3 },
      { id: 'd', userId: 'teo', displayName: 'Teo', joinedAt: 4 },
    ],
  },
}

function futureRosterPoll(): PadelPoll {
  return {
    id: 'poll-1',
    title: 'Padel · 24 ago – 30 ago 2099',
    targetWeekStart: '2099-08-24',
    createdBy: 'ale',
    createdByName: 'Ale',
    createdAt: 1,
    updatedAt: 1,
    status: 'open',
    slots: [{
      id: 'slot-1',
      startsAt: '2099-08-30T07:30:00.000Z',
      durationMinutes: 90,
      venue: 'Oasi Boschetto',
      bookedAt: 1,
      bookedBy: 'ale',
      bookedByName: 'Ale',
      signups: [
        { id: 'a', userId: 'jury', displayName: 'Jury', joinedAt: 1 },
        { id: 'b', userId: 'ale', displayName: 'Ale', joinedAt: 2 },
        { id: 'c', userId: 'luca', displayName: 'Luca', joinedAt: 3 },
        { id: 'd', userId: 'teo', displayName: 'Teo', joinedAt: 4 },
        {
          id: 'e',
          userId: 'reserve',
          displayName: 'Riserva',
          joinedAt: 5,
          role: 'reserve',
        },
      ],
    }],
  }
}

function futureFantasyRound(): FantasyRound {
  const locksAt = Date.parse('2099-08-30T07:30:00.000Z')
  return {
    id: 'poll-1__slot-1',
    pollId: 'poll-1',
    pollTitle: 'Padel · 24 ago – 30 ago 2099',
    slotId: 'slot-1',
    slotStartsAt: '2099-08-30T07:30:00.000Z',
    slotEndsAt: locksAt + 90 * 60_000,
    locksAt,
    settlesAt: locksAt + 49.5 * 60 * 60_000,
    participantIds: ['jury', 'ale', 'luca', 'teo'],
    participants: ['jury', 'ale', 'luca', 'teo'].map((userId) => ({
      userId,
      displayName: userId,
    })),
    rosterKey: JSON.stringify(['jury', 'ale', 'luca', 'teo']),
    status: 'open',
    createdAt: 1,
    updatedAt: 1,
  }
}

describe('repository remoto della scelta MVP', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    firestoreMocks.batch.commit.mockResolvedValue(undefined)
    firestoreMocks.transaction.get.mockResolvedValue({
      exists: () => false,
    })
  })

  it('crea documenti di slot senza salvare una settimana', async () => {
    await repository.createPoll({
      slots: [{ startsAt: '2026-08-18T18:30', durationMinutes: 90 }],
    }, voter)

    const pollWrite = firestoreMocks.batch.set.mock.calls.find(([reference]) => (
      reference === 'polls/generated'
    ))
    expect(pollWrite).toBeDefined()
    expect(pollWrite?.[1]).toEqual(expect.objectContaining({
      createdBy: voter.id,
      slots: [expect.objectContaining({ startsAt: '2026-08-18T16:30:00.000Z' })],
    }))
    expect(pollWrite?.[1]).not.toHaveProperty('targetWeekStart')
    expect(pollWrite?.[1]).not.toHaveProperty('title')
  })

  it('rifiuta nuovi giudizi senza aprire batch o transazioni', async () => {
    await expect(repository.submitMatchFeedback(prompt, voter, [
      { playerId: 'ale', level: 5 },
      { playerId: 'luca', level: 3 },
      { playerId: 'teo', level: 1 },
    ])).rejects.toThrow('I giudizi post partita sono disattivati.')

    expect(firestoreMocks.runTransaction).not.toHaveBeenCalled()
    expect(firestoreMocks.writeBatch).not.toHaveBeenCalled()
    expect(firestoreMocks.batch.set).not.toHaveBeenCalled()
    expect(firestoreMocks.batch.commit).not.toHaveBeenCalled()
  })

  it('crea il referto della partita in una transazione modificabile dai partecipanti', async () => {
    const report = await repository.saveMatchReport(playedMatch, voter, [
      { teamAUserIds: ['jury', 'ale'], scoreA: 6, scoreB: 4 },
      { teamAUserIds: ['jury', 'luca'], scoreA: 3, scoreB: 6 },
    ])

    expect(firestoreMocks.runTransaction).toHaveBeenCalledOnce()
    expect(firestoreMocks.transaction.get).toHaveBeenCalledWith('matchReports/poll-1__slot-1')
    expect(firestoreMocks.transaction.set).toHaveBeenCalledWith(
      'matchReports/poll-1__slot-1',
      report,
    )
    expect(report).toMatchObject({
      id: 'poll-1__slot-1',
      participantIds: ['jury', 'ale', 'luca', 'teo'],
      createdBy: 'jury',
      updatedBy: 'jury',
      sets: [
        { scoreA: 6, scoreB: 4 },
        { scoreA: 3, scoreB: 6 },
      ],
    })
  })

  it('persiste soltanto lo slot modificato senza una settimana strutturale', async () => {
    const poll: PadelPoll = {
      id: 'poll-1',
      title: 'Padel · 31 ago – 6 set 2026',
      targetWeekStart: '2026-08-31',
      createdBy: voter.id,
      createdByName: voter.displayName,
      createdAt: 1,
      updatedAt: 1,
      status: 'open',
      slots: [{
        id: 'slot-1',
        startsAt: '2026-09-01T16:30:00.000Z',
        durationMinutes: 90,
        venue: '',
        signups: [],
      }],
    }
    firestoreMocks.transaction.get.mockResolvedValue({
      exists: () => true,
      id: poll.id,
      data: () => poll,
    })

    await repository.rescheduleSlot(poll.id, poll.slots[0].id, '2026-08-25T18:30', voter)

    expect(firestoreMocks.transaction.update).toHaveBeenCalledOnce()
    const update = firestoreMocks.transaction.update.mock.calls[0][1]
    expect(update).toEqual(expect.objectContaining({
      slots: [expect.objectContaining({ startsAt: '2026-08-25T16:30:00.000Z' })],
    }))
    expect(update).not.toHaveProperty('targetWeekStart')
    expect(update).not.toHaveProperty('title')
  })

  it('applica la gestione amministrativa della formazione nella transazione del sondaggio', async () => {
    firestoreMocks.transaction.get.mockResolvedValue({
      exists: () => true,
      id: playedMatch.pollId,
      data: () => playedMatch.slot
        ? {
          id: playedMatch.pollId,
          title: playedMatch.pollTitle,
          targetWeekStart: '2026-07-27',
          createdBy: 'ale',
          createdByName: 'Ale',
          createdAt: 1,
          updatedAt: 1,
          status: 'open',
          slots: [playedMatch.slot],
        }
        : undefined,
    })

    await repository.adminUpdateSlotRoster(playedMatch.pollId, playedMatch.slot.id, admin, {
      kind: 'add',
      member: { id: 'reserve', displayName: 'Riserva' },
      role: 'reserve',
    })

    expect(firestoreMocks.transaction.update).toHaveBeenCalledWith(
      `polls/${playedMatch.pollId}`,
      expect.objectContaining({
        slots: [expect.objectContaining({
          signups: expect.arrayContaining([
            expect.objectContaining({ userId: 'reserve', role: 'reserve' }),
          ]),
        })],
      }),
    )
    expect(firestoreMocks.transaction.set).toHaveBeenCalledWith(
      'activityEvents/generated',
      expect.objectContaining({
        type: 'slot_roster_admin_updated',
        actorId: admin.id,
        details: expect.objectContaining({ action: 'added', targetName: 'Riserva' }),
      }),
    )
  })

  it('aggiorna i titolari senza mutare i round fantasy archiviati', async () => {
    const poll = futureRosterPoll()
    const round = futureFantasyRound()
    firestoreMocks.transaction.get.mockImplementation(async (reference: string) => {
      if (reference === `polls/${poll.id}`) {
        return { exists: () => true, id: poll.id, data: () => poll }
      }
      if (reference === `fantasyRounds/${round.id}`) {
        return { exists: () => true, id: round.id, data: () => round }
      }
      return { exists: () => false }
    })

    const updated = await repository.leaveSlot(poll.id, poll.slots[0].id, voter)

    expect(firestoreMocks.transaction.get).toHaveBeenCalledWith(`polls/${poll.id}`)
    expect(firestoreMocks.transaction.get).not.toHaveBeenCalledWith(`fantasyRounds/${round.id}`)
    expect(firestoreMocks.transaction.set.mock.calls.some(([reference]) => (
      reference === `fantasyRounds/${round.id}`
    ))).toBe(false)
    expect(updated.slots[0].signups.find((signup) => signup.userId === 'reserve')).toMatchObject({
      role: 'starter',
    })

    const lastReadOrder = Math.max(...firestoreMocks.transaction.get.mock.invocationCallOrder)
    const firstWriteOrder = Math.min(
      ...firestoreMocks.transaction.update.mock.invocationCallOrder,
      ...firestoreMocks.transaction.set.mock.invocationCallOrder,
    )
    expect(lastReadOrder).toBeLessThan(firstWriteOrder)
  })

  it('non lascia che un round fantasy archiviato blocchi la modifica dello slot', async () => {
    const poll = futureRosterPoll()
    const round = futureFantasyRound()
    firestoreMocks.transaction.get.mockImplementation(async (reference: string) => {
      if (reference === `polls/${poll.id}`) {
        return { exists: () => true, id: poll.id, data: () => poll }
      }
      if (reference === `fantasyRounds/${round.id}`) {
        throw new Error('Round non disponibile')
      }
      return { exists: () => false }
    })

    await expect(repository.leaveSlot(poll.id, poll.slots[0].id, voter)).resolves.toBeDefined()
    expect(firestoreMocks.transaction.get).not.toHaveBeenCalledWith(`fantasyRounds/${round.id}`)
    expect(firestoreMocks.transaction.update).toHaveBeenCalled()
  })

  it('rifiuta nuove formazioni fantasy senza aprire una transazione', async () => {
    const locksAt = Date.now() + 60 * 60 * 1000
    const round: FantasyRound = {
      id: 'poll-1__slot-1',
      pollId: 'poll-1',
      pollTitle: 'Padel · 27 lug – 2 ago 2026',
      slotId: 'slot-1',
      slotStartsAt: '2026-07-27T18:30',
      slotEndsAt: locksAt + 90 * 60_000,
      locksAt,
      settlesAt: locksAt + 49.5 * 60 * 60_000,
      participantIds: ['ale', 'luca', 'teo', 'baru'],
      participants: ['ale', 'luca', 'teo', 'baru'].map((userId) => ({
        userId,
        displayName: userId.toUpperCase(),
      })),
      rosterKey: '["ale","luca","teo","baru"]',
      status: 'open',
      createdAt: 1,
      updatedAt: 1,
    }
    firestoreMocks.transaction.get.mockImplementation(async (reference: string) => (
      reference === 'fantasyRounds/poll-1__slot-1'
        ? { exists: () => true, id: round.id, data: () => round }
        : { exists: () => false }
    ))

    await expect(repository.saveFantasyEntry(round.id, voter, {
      playerIds: ['ale', 'baru'],
      captainId: 'baru',
    })).rejects.toThrow('La stagione FantaBandeja è conclusa')

    expect(firestoreMocks.runTransaction).not.toHaveBeenCalled()
    expect(firestoreMocks.transaction.get).not.toHaveBeenCalled()
    expect(firestoreMocks.transaction.set).not.toHaveBeenCalled()
  })
})
