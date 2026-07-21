import { describe, expect, it } from 'vitest'
import type { MemberProfile, SessionUser } from '../types'
import { isRatingTestRequested, makeRatingTestPrompt } from './ratingTest'

const reviewer: SessionUser = {
  id: 'jury',
  displayName: 'Jury',
  email: 'jury@example.test',
  createdAt: 1,
}

const member = (id: string, displayName = id): MemberProfile => ({
  id,
  displayName,
  email: `${id}@example.test`,
  createdAt: 1,
})

describe('modalità collaudo pagelle', () => {
  it('si attiva soltanto con il deep link esplicito', () => {
    expect(isRatingTestRequested('?ratingTest=1')).toBe(true)
    expect(isRatingTestRequested('?ratingTest=0')).toBe(false)
    expect(isRatingTestRequested('?ratePoll=poll-1')).toBe(false)
  })

  it('usa tre membri diversi dal revisore senza duplicati', () => {
    const prompt = makeRatingTestPrompt(reviewer, [
      reviewer,
      member('ale', 'Ale'),
      member('luca', 'Luca'),
      member('ale', 'Ale duplicato'),
      member('teo', 'Teo'),
      member('fede', 'Fede'),
    ], Date.parse('2026-07-21T18:00:00.000Z'))

    expect(prompt).toMatchObject({
      id: 'rating-test__jury',
      pollId: 'rating-test',
      reviewerId: 'jury',
      sessionStartsAt: '2026-07-21T18:00:00.000Z',
    })
    expect(prompt.teammates).toEqual([
      { userId: 'ale', displayName: 'Ale' },
      { userId: 'luca', displayName: 'Luca' },
      { userId: 'teo', displayName: 'Teo' },
    ])
  })

  it('completa la scheda con nomi fittizi senza richiedere dati reali', () => {
    const prompt = makeRatingTestPrompt(reviewer, [member('ale', 'Ale')], 1)

    expect(prompt.teammates).toEqual([
      { userId: 'ale', displayName: 'Ale' },
      { userId: 'rating-test-player-2', displayName: 'Compagno test 2' },
      { userId: 'rating-test-player-3', displayName: 'Compagno test 3' },
    ])
  })
})
