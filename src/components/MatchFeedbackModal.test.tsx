import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MatchFeedbackPrompt } from '../types'
import { MatchFeedbackModal } from './MatchFeedbackModal'

const prompt: MatchFeedbackPrompt = {
  id: 'poll-1__slot-1__jury',
  pollId: 'poll-1',
  pollTitle: 'Padel del martedì',
  slotId: 'slot-1',
  sessionStartsAt: '2026-07-28T19:30',
  sessionEndedAt: Date.parse('2026-07-28T19:00:00.000Z'),
  dueAt: Date.parse('2026-07-28T19:30:00.000Z'),
  reviewerId: 'jury',
  candidates: [
    { userId: 'ale', displayName: 'Ale' },
    { userId: 'luca', displayName: 'Luca' },
    { userId: 'teo', displayName: 'Teo' },
  ],
}

function choose(playerName: string, levelName: string) {
  const group = screen.getByRole('group', { name: new RegExp(playerName) })
  fireEvent.click(within(group).getByRole('radio', { name: new RegExp(levelName) }))
}

describe('MatchFeedbackModal', () => {
  it('richiede un giudizio per ogni compagno e invia livelli tracciabili', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<MatchFeedbackModal prompt={prompt} onDismiss={vi.fn()} onSubmit={onSubmit} />)

    const save = screen.getByRole('button', { name: 'Salva i giudizi' })
    expect(save).toBeDisabled()
    expect(screen.getByText(/Sii generoso/)).toBeInTheDocument()
    expect(screen.getByText(/Nel dubbio, scegli il volatile più alto/)).toBeInTheDocument()
    expect(screen.getAllByText('Make Padel Great Again.')).toHaveLength(3)

    choose('Ale', 'Fagiano da brodo')
    choose('Luca', 'Pavone gonfiato')
    expect(save).toBeDisabled()
    choose('Teo', 'Aquilotto reale')
    expect(save).toBeEnabled()
    fireEvent.click(save)

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith([
      { playerId: 'ale', level: 1 },
      { playerId: 'luca', level: 4 },
      { playerId: 'teo', level: 5 },
    ]))
  })

  it('rende definitiva anche la chiusura', async () => {
    const onDismiss = vi.fn().mockResolvedValue(undefined)
    render(<MatchFeedbackModal prompt={prompt} onDismiss={onDismiss} onSubmit={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    await waitFor(() => expect(onDismiss).toHaveBeenCalledOnce())
  })

  it('isola il collaudo e non promette alcun salvataggio', async () => {
    const onDismiss = vi.fn().mockResolvedValue(undefined)
    render(<MatchFeedbackModal testMode prompt={prompt} onDismiss={onDismiss} onSubmit={vi.fn()} />)

    expect(screen.getByText(/Modalità TEST: puoi completare tutto, ma nulla verrà salvato/)).toBeInTheDocument()
    expect(screen.getByText(/non modificherà partite, giudizi o FantaBandeja/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Completa il test' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Salva i giudizi' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Chiudi il test' }))
    await waitFor(() => expect(onDismiss).toHaveBeenCalledOnce())
  })

  it('completa il test con gli stessi controlli della scheda reale', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<MatchFeedbackModal testMode prompt={prompt} onDismiss={vi.fn()} onSubmit={onSubmit} />)

    choose('Ale', 'Fagiano ubriaco')
    choose('Luca', 'Fagiano spaesato')
    choose('Teo', 'Pavone gonfiato')
    fireEvent.click(screen.getByRole('button', { name: 'Completa il test' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
  })
})
