import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { GroupMatch, MemberProfile } from '../types'
import { GroupMatchesPage } from './GroupMatchesPage'

const players = [
  { userId: 'ale', displayName: 'Ale' },
  { userId: 'baru', displayName: 'Baru' },
  { userId: 'luca', displayName: 'Luca' },
  { userId: 'teo', displayName: 'Teo' },
]

const completeMatch: GroupMatch = {
  pollId: 'poll-1',
  pollTitle: 'Padel · 27 lug – 2 ago 2026',
  slot: {
    id: 'slot-1',
    startsAt: '2026-07-29T16:00:00.000Z',
    durationMinutes: 90,
    venue: 'Oasi Boschetto',
    bookedAt: 1,
    signups: players.map((player, index) => ({
      id: `signup-${player.userId}`,
      userId: player.userId,
      displayName: player.displayName,
      joinedAt: index + 1,
    })),
  },
  playerFeedback: [
    { userId: 'ale', level: 3, ratingCount: 3 },
    { userId: 'baru', level: 4, ratingCount: 3 },
    { userId: 'luca', level: 3, ratingCount: 0 },
    { userId: 'teo', level: 5, ratingCount: 3 },
  ],
  report: {
    id: 'poll-1__slot-1',
    pollId: 'poll-1',
    pollTitle: 'Padel · 27 lug – 2 ago 2026',
    slotId: 'slot-1',
    sessionStartsAt: '2026-07-29T16:00:00.000Z',
    participantIds: players.map((player) => player.userId),
    participants: players,
    sets: [{
      id: 'set-1',
      teamA: [players[0], players[1]],
      teamB: [players[2], players[3]],
      scoreA: 6,
      scoreB: 4,
    }],
    createdBy: 'ale',
    createdByName: 'Ale',
    createdAt: 1,
    updatedBy: 'ale',
    updatedByName: 'Ale',
    updatedAt: 1,
  },
}

const matchWithoutReport: GroupMatch = {
  ...completeMatch,
  pollId: 'poll-2',
  pollTitle: 'Padel · 20 lug – 26 lug 2026',
  slot: {
    ...completeMatch.slot,
    id: 'slot-2',
    startsAt: '2026-07-22T16:00:00.000Z',
  },
  playerFeedback: players.map((player) => ({ userId: player.userId, level: 3 as const, ratingCount: 0 })),
  report: undefined,
}

const members: MemberProfile[] = players.map((player) => ({
  id: player.userId,
  displayName: player.displayName,
  email: `${player.userId}@example.test`,
  createdAt: 1,
}))

describe('pagina degli altri match', () => {
  it('mostra giudizi, risultati disponibili e stato del referto mancante', async () => {
    const onBack = vi.fn()
    const user = userEvent.setup()
    render(
      <GroupMatchesPage
        matches={[completeMatch, matchWithoutReport]}
        members={members}
        loading={false}
        error={null}
        onBack={onBack}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Gli altri match' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Partite concluse' })).toBeInTheDocument()
    expect(screen.getAllByText('Per ogni giocatore mostriamo la media dei giudizi ricevuti.')).toHaveLength(2)
    const teo = screen.getByRole('listitem', {
      name: 'Teo: giudizio medio Aquilotto reale, calcolato su 3 giudizi ricevuti',
    })
    expect(within(teo).getByText('Aquilotto reale')).toBeInTheDocument()
    expect(within(teo).getByText('Media di 3 giudizi ricevuti')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem', { name: 'Luca: nessun giudizio ricevuto' })).toHaveLength(2)
    expect(screen.getAllByText('Nessun giudizio ricevuto')).toHaveLength(5)
    expect(screen.getByText('1 set registrato')).toBeInTheDocument()

    const result = screen.getByRole('table', {
      name: 'Formazione 1: Ale + Baru contro Luca + Teo',
    })
    expect(within(result).getByRole('row', { name: 'Ale + Baru 6' })).toBeInTheDocument()
    expect(within(result).getByRole('row', { name: 'Luca + Teo 4' })).toBeInTheDocument()
    expect(screen.getByText('Referto non aggiunto')).toBeInTheDocument()
    expect(screen.getByText(/Coppie e punteggi non sono ancora disponibili/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Torna alla bacheca' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('mostra un errore recuperabile senza nascondere i dati già caricati', () => {
    render(
      <GroupMatchesPage
        matches={[completeMatch]}
        members={members}
        loading={false}
        error="Dati incompleti."
        onBack={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Dati incompleti.')
    expect(screen.getByText('Padel · 27 lug – 2 ago 2026')).toBeInTheDocument()
  })
})
