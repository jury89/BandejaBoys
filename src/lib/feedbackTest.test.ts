import { describe, expect, it } from 'vitest'
import type { MemberProfile, SessionUser } from '../types'
import { isFeedbackTestRequested, makeFeedbackTestPrompt } from './feedbackTest'

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

describe('modalità collaudo giudizi', () => {
  it('si attiva soltanto con il deep link esplicito', () => {
    expect(isFeedbackTestRequested('?feedbackTest=1')).toBe(true)
    expect(isFeedbackTestRequested('?ratingTest=1')).toBe(true)
    expect(isFeedbackTestRequested('?mvpTest=1')).toBe(true)
    expect(isFeedbackTestRequested('?feedbackTest=0')).toBe(false)
  })

  it('usa tre membri diversi dal revisore senza duplicati', () => {
    const prompt = makeFeedbackTestPrompt(reviewer, [
      reviewer,
      member('ale', 'Ale'),
      member('luca', 'Luca'),
      member('ale', 'Ale duplicato'),
      member('teo', 'Teo'),
      member('fede', 'Fede'),
    ], Date.parse('2026-07-21T18:00:00.000Z'))

    expect(prompt).toMatchObject({
      id: 'feedback-test__jury',
      pollId: 'feedback-test',
      reviewerId: 'jury',
      sessionStartsAt: '2026-07-21T18:00:00.000Z',
    })
    expect(prompt.candidates).toEqual([
      { userId: 'ale', displayName: 'Ale' },
      { userId: 'luca', displayName: 'Luca' },
      { userId: 'teo', displayName: 'Teo' },
    ])
  })

  it('completa la scheda con nomi fittizi senza richiedere dati reali', () => {
    const prompt = makeFeedbackTestPrompt(reviewer, [member('ale', 'Ale')], 1)

    expect(prompt.candidates).toEqual([
      { userId: 'ale', displayName: 'Ale' },
      { userId: 'feedback-test-player-2', displayName: 'Compagno test 2' },
      { userId: 'feedback-test-player-3', displayName: 'Compagno test 3' },
    ])
  })
})
