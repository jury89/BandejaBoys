import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FantasyRound, MatchRatingPrompt, PlayerMatch, SessionUser } from '../types'

const firestoreMocks = vi.hoisted(() => {
  const batch = {
    set: vi.fn(),
    commit: vi.fn<() => Promise<void>>(),
  }
  const transaction = {
    get: vi.fn(),
    set: vi.fn(),
  }
  return {
    batch,
    transaction,
    doc: vi.fn((_database: unknown, ...segments: string[]) => segments.join('/')),
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
    doc: firestoreMocks.doc,
    runTransaction: firestoreMocks.runTransaction,
    writeBatch: firestoreMocks.writeBatch,
  }
})

import { repository } from './repository'

const reviewer: SessionUser = {
  id: 'jury',
  displayName: 'Jury',
  email: 'jury@example.test',
  createdAt: 1,
}

const prompt: MatchRatingPrompt = {
  id: 'poll-1__slot-1__jury',
  pollId: 'poll-1',
  pollTitle: 'Padel del lunedì',
  slotId: 'slot-1',
  sessionStartsAt: '2026-07-27T18:30',
  sessionEndedAt: 100,
  dueAt: 200,
  reviewerId: reviewer.id,
  teammates: [
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

describe('repository remoto delle pagelle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    firestoreMocks.batch.commit.mockResolvedValue(undefined)
    firestoreMocks.transaction.get.mockResolvedValue({
      exists: () => false,
    })
  })

  it('salva risposta e voti in un batch atomico senza letture transazionali', async () => {
    const response = await repository.submitMatchRatings(prompt, reviewer, [
      { userId: 'ale', displayName: 'Ale', score: 8 },
      { userId: 'luca', displayName: 'Luca', score: 7 },
      { userId: 'teo', displayName: 'Teo', score: 9 },
    ])

    expect(firestoreMocks.runTransaction).not.toHaveBeenCalled()
    expect(firestoreMocks.writeBatch).toHaveBeenCalledOnce()
    expect(firestoreMocks.batch.set).toHaveBeenCalledTimes(7)
    expect(firestoreMocks.batch.set).toHaveBeenCalledWith(
      'matchRatingSummaries/poll-1__slot-1__ale',
      expect.objectContaining({
        id: 'poll-1__slot-1__ale',
        pollId: 'poll-1',
        slotId: 'slot-1',
        revieweeId: 'ale',
        lastRatingId: 'poll-1__slot-1__jury__ale',
      }),
      { merge: true },
    )
    expect(firestoreMocks.batch.set).toHaveBeenLastCalledWith(
      'matchRatingResponses/poll-1__slot-1__jury',
      response,
    )
    expect(firestoreMocks.batch.commit).toHaveBeenCalledOnce()
    expect(response).toMatchObject({
      id: prompt.id,
      reviewerId: reviewer.id,
      status: 'submitted',
    })
  })

  it('crea il referto della partita in una transazione modificabile dai partecipanti', async () => {
    const report = await repository.saveMatchReport(playedMatch, reviewer, [
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

  it('salva la formazione fantasy leggendo round e giocata nella stessa transazione', async () => {
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

    const saved = await repository.saveFantasyEntry(round.id, reviewer, {
      playerIds: ['ale', 'baru'],
      captainId: 'baru',
    })

    expect(firestoreMocks.transaction.get).toHaveBeenCalledWith(
      'fantasyRounds/poll-1__slot-1',
    )
    expect(firestoreMocks.transaction.get).toHaveBeenCalledWith(
      'fantasyRounds/poll-1__slot-1/entries/jury',
    )
    expect(firestoreMocks.transaction.set).toHaveBeenCalledWith(
      'fantasyRounds/poll-1__slot-1/entries/jury',
      saved,
    )
    expect(saved).toMatchObject({
      managerId: 'jury',
      playerIds: ['ale', 'baru'],
      captainId: 'baru',
      rosterKey: round.rosterKey,
    })
  })
})
