import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MatchRatingPrompt, SessionUser } from '../types'

const firestoreMocks = vi.hoisted(() => {
  const batch = {
    set: vi.fn(),
    commit: vi.fn<() => Promise<void>>(),
  }
  return {
    batch,
    doc: vi.fn((_database: unknown, collectionName: string, documentId: string) => (
      `${collectionName}/${documentId}`
    )),
    runTransaction: vi.fn(),
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

describe('repository remoto delle pagelle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    firestoreMocks.batch.commit.mockResolvedValue(undefined)
  })

  it('salva risposta e voti in un batch atomico senza letture transazionali', async () => {
    const response = await repository.submitMatchRatings(prompt, reviewer, [
      { userId: 'ale', displayName: 'Ale', score: 8 },
      { userId: 'luca', displayName: 'Luca', score: 7 },
      { userId: 'teo', displayName: 'Teo', score: 9 },
    ])

    expect(firestoreMocks.runTransaction).not.toHaveBeenCalled()
    expect(firestoreMocks.writeBatch).toHaveBeenCalledOnce()
    expect(firestoreMocks.batch.set).toHaveBeenCalledTimes(4)
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
})
