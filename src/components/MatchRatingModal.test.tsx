import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MatchRatingPrompt } from '../types'
import { MatchRatingModal } from './MatchRatingModal'

const prompt: MatchRatingPrompt = {
  id: 'poll-1__slot-1__jury',
  pollId: 'poll-1',
  pollTitle: 'Padel del martedì',
  slotId: 'slot-1',
  sessionStartsAt: '2026-07-28T19:30',
  sessionEndedAt: Date.parse('2026-07-28T19:00:00.000Z'),
  dueAt: Date.parse('2026-07-28T19:10:00.000Z'),
  reviewerId: 'jury',
  teammates: [
    { userId: 'ale', displayName: 'Ale' },
    { userId: 'luca', displayName: 'Luca' },
    { userId: 'teo', displayName: 'Teo' },
  ],
}

describe('MatchRatingModal', () => {
  it('richiede un voto per tutti e tre i compagni e invia la scheda completa', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<MatchRatingModal prompt={prompt} onDismiss={vi.fn()} onSubmit={onSubmit} />)

    const save = screen.getByRole('button', { name: 'Salva i voti' })
    expect(save).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Dai 8 a Ale' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dai 7 a Luca' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dai 9 a Teo' }))
    expect(save).toBeEnabled()
    fireEvent.click(save)

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith([
      { userId: 'ale', displayName: 'Ale', score: 8 },
      { userId: 'luca', displayName: 'Luca', score: 7 },
      { userId: 'teo', displayName: 'Teo', score: 9 },
    ]))
  })

  it('rende definitivo anche il pulsante di chiusura', async () => {
    const onDismiss = vi.fn().mockResolvedValue(undefined)
    render(<MatchRatingModal prompt={prompt} onDismiss={onDismiss} onSubmit={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    await waitFor(() => expect(onDismiss).toHaveBeenCalledOnce())
  })
})
