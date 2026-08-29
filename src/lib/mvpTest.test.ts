import { describe, expect, it } from 'vitest'
import type { MemberProfile, SessionUser } from '../types'
import { isMvpTestRequested, makeMvpTestPrompt } from './mvpTest'

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

describe('modalità collaudo MVP', () => {
  it('si attiva soltanto con il deep link esplicito', () => {
    expect(isMvpTestRequested('?mvpTest=1')).toBe(true)
    expect(isMvpTestRequested('?ratingTest=1')).toBe(true)
    expect(isMvpTestRequested('?mvpTest=0')).toBe(false)
  })

  it('usa tre membri diversi dal revisore senza duplicati', () => {
    const prompt = makeMvpTestPrompt(reviewer, [
      reviewer,
      member('ale', 'Ale'),
      member('luca', 'Luca'),
      member('ale', 'Ale duplicato'),
      member('teo', 'Teo'),
      member('fede', 'Fede'),
    ], Date.parse('2026-07-21T18:00:00.000Z'))

    expect(prompt).toMatchObject({
      id: 'mvp-test__jury',
      pollId: 'mvp-test',
      voterId: 'jury',
      sessionStartsAt: '2026-07-21T18:00:00.000Z',
    })
    expect(prompt.candidates).toEqual([
      { userId: 'ale', displayName: 'Ale' },
      { userId: 'luca', displayName: 'Luca' },
      { userId: 'teo', displayName: 'Teo' },
    ])
  })

  it('completa la scheda con nomi fittizi senza richiedere dati reali', () => {
    const prompt = makeMvpTestPrompt(reviewer, [member('ale', 'Ale')], 1)

    expect(prompt.candidates).toEqual([
      { userId: 'ale', displayName: 'Ale' },
      { userId: 'mvp-test-player-2', displayName: 'Compagno test 2' },
      { userId: 'mvp-test-player-3', displayName: 'Compagno test 3' },
    ])
  })
})
