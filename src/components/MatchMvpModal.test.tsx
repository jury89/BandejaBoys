import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MatchMvpPrompt } from '../types'
import { MatchMvpModal } from './MatchMvpModal'

const prompt: MatchMvpPrompt = {
  id: 'poll-1__slot-1__jury',
  pollId: 'poll-1',
  pollTitle: 'Padel del martedì',
  slotId: 'slot-1',
  sessionStartsAt: '2026-07-28T19:30',
  sessionEndedAt: Date.parse('2026-07-28T19:00:00.000Z'),
  dueAt: Date.parse('2026-07-28T19:10:00.000Z'),
  voterId: 'jury',
  candidates: [
    { userId: 'ale', displayName: 'Ale' },
    { userId: 'luca', displayName: 'Luca' },
    { userId: 'teo', displayName: 'Teo' },
  ],
}

describe('MatchMvpModal', () => {
  it('richiede una sola scelta MVP e invia il giocatore selezionato', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<MatchMvpModal prompt={prompt} onDismiss={vi.fn()} onSubmit={onSubmit} />)

    const save = screen.getByRole('button', { name: 'Conferma MVP' })
    expect(save).toBeDisabled()

    fireEvent.click(screen.getByRole('radio', { name: /Luca/ }))
    expect(save).toBeEnabled()
    fireEvent.click(save)

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('luca'))
  })

  it('rende definitivo anche il pulsante di chiusura', async () => {
    const onDismiss = vi.fn().mockResolvedValue(undefined)
    render(<MatchMvpModal prompt={prompt} onDismiss={onDismiss} onSubmit={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    await waitFor(() => expect(onDismiss).toHaveBeenCalledOnce())
  })

  it('distingue il collaudo e non promette alcun salvataggio', async () => {
    const onDismiss = vi.fn().mockResolvedValue(undefined)
    render(<MatchMvpModal testMode prompt={prompt} onDismiss={onDismiss} onSubmit={vi.fn()} />)

    expect(screen.getByText(/Modalità TEST: puoi provare la scelta/)).toBeInTheDocument()
    expect(screen.getByText(/non modificano partite, MVP o storico/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Completa il test' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Conferma MVP' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Chiudi il test' }))
    await waitFor(() => expect(onDismiss).toHaveBeenCalledOnce())
  })

  it('permette di completare la scelta MVP di test con gli stessi controlli', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<MatchMvpModal testMode prompt={prompt} onDismiss={vi.fn()} onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole('radio', { name: /Ale/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Completa il test' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
  })
})
