import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { PlayerMatch } from '../types'
import { MatchReportModal } from './MatchReportModal'

const match: PlayerMatch = {
  pollId: 'poll-1',
  pollTitle: 'Padel · 27 lug – 2 ago 2026',
  slot: {
    id: 'slot-1',
    startsAt: '2026-07-28T18:30:00.000Z',
    durationMinutes: 90,
    venue: 'Oasi Boschetto',
    bookedAt: 1,
    signups: [
      { id: 'signup-jury', userId: 'jury', displayName: 'Jury', joinedAt: 1, role: 'starter' },
      { id: 'signup-ale', userId: 'ale', displayName: 'Ale', joinedAt: 2, role: 'starter' },
      { id: 'signup-luca', userId: 'luca', displayName: 'Luca', joinedAt: 3, role: 'starter' },
      { id: 'signup-teo', userId: 'teo', displayName: 'Teo', joinedAt: 4, role: 'starter' },
    ],
  },
}

describe('referto dei set', () => {
  it('aggiunge set, alterna le coppie e salva i punteggi', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<MatchReportModal match={match} onClose={vi.fn()} onSave={onSave} />)

    expect(screen.getByRole('heading', { name: 'Com’è finita?' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Jury + Ale — Luca + Teo' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Punteggio Jury + Ale, set 1'), '6')
    await user.type(screen.getByLabelText('Punteggio Luca + Teo, set 1'), '4')
    await user.click(screen.getByRole('button', { name: 'Aggiungi set' }))
    expect(screen.getByLabelText('Coppie del set 2')).toHaveValue('1')
    await user.type(screen.getByLabelText('Punteggio Jury + Luca, set 2'), '3')
    await user.type(screen.getByLabelText('Punteggio Ale + Teo, set 2'), '6')
    await user.click(screen.getByRole('button', { name: 'Salva referto' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith([
      { teamAUserIds: ['jury', 'ale'], scoreA: 6, scoreB: 4 },
      { teamAUserIds: ['jury', 'luca'], scoreA: 3, scoreB: 6 },
    ]))
  })

  it('non salva un set concluso in parità', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<MatchReportModal match={match} onClose={vi.fn()} onSave={onSave} />)

    await user.type(screen.getByLabelText('Punteggio Jury + Ale, set 1'), '6')
    await user.type(screen.getByLabelText('Punteggio Luca + Teo, set 1'), '6')
    await user.click(screen.getByRole('button', { name: 'Salva referto' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Il set 1 non può finire in parità.')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('traduce un eventuale errore di permessi senza mostrare il messaggio tecnico', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Missing or insufficient permissions.'))
    const user = userEvent.setup()
    render(<MatchReportModal match={match} onClose={vi.fn()} onSave={onSave} />)

    await user.type(screen.getByLabelText('Punteggio Jury + Ale, set 1'), '6')
    await user.type(screen.getByLabelText('Punteggio Luca + Teo, set 1'), '4')
    await user.click(screen.getByRole('button', { name: 'Salva referto' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Non hai i permessi per salvare questo referto. Aggiorna l’app e riprova.',
    )
    expect(screen.queryByText('Missing or insufficient permissions.')).not.toBeInTheDocument()
  })
})
