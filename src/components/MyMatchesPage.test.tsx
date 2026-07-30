import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { PlayerMatchLists } from '../types'
import { MyMatchesPage } from './MyMatchesPage'

const matches: PlayerMatchLists = {
  upcoming: [{
    pollId: 'poll-future',
    pollTitle: 'Padel della prossima settimana',
    slot: {
      id: 'future',
      startsAt: '2026-07-30T18:30:00.000Z',
      durationMinutes: 90,
      venue: '',
      signups: [],
    },
  }],
  past: [{
    pollId: 'poll-past',
    pollTitle: 'Padel della settimana scorsa',
    receivedRating: { average: 8.5, count: 2 },
    report: {
      id: 'poll-past__past',
      pollId: 'poll-past',
      pollTitle: 'Padel della settimana scorsa',
      slotId: 'past',
      sessionStartsAt: '2026-07-20T18:30:00.000Z',
      participantIds: ['a', 'b', 'c', 'd'],
      participants: [
        { userId: 'a', displayName: 'Ale' },
        { userId: 'b', displayName: 'Baru' },
        { userId: 'c', displayName: 'Luca' },
        { userId: 'd', displayName: 'Teo' },
      ],
      sets: [
        {
          id: 'set-1',
          teamA: [
            { userId: 'a', displayName: 'Ale' },
            { userId: 'b', displayName: 'Baru' },
          ],
          teamB: [
            { userId: 'c', displayName: 'Luca' },
            { userId: 'd', displayName: 'Teo' },
          ],
          scoreA: 6,
          scoreB: 4,
        },
        {
          id: 'set-2',
          teamA: [
            { userId: 'a', displayName: 'Ale' },
            { userId: 'c', displayName: 'Luca' },
          ],
          teamB: [
            { userId: 'b', displayName: 'Baru' },
            { userId: 'd', displayName: 'Teo' },
          ],
          scoreA: 3,
          scoreB: 6,
        },
      ],
      createdBy: 'a',
      createdByName: 'Ale',
      createdAt: 1,
      updatedBy: 'b',
      updatedByName: 'Baru',
      updatedAt: 2,
    },
    slot: {
      id: 'past',
      startsAt: '2026-07-20T18:30:00.000Z',
      durationMinutes: 90,
      venue: 'Oasi Boschetto',
      bookedAt: 1,
      signups: [],
    },
  }],
}

describe('pagina dei match personali', () => {
  it('separa prossimi match e partite giocate e torna alla bacheca', async () => {
    const onBack = vi.fn()
    const onSelectMatch = vi.fn()
    const onEditReport = vi.fn()
    const user = userEvent.setup()

    render(
      <MyMatchesPage
        matches={matches}
        loading={false}
        onBack={onBack}
        onSelectMatch={onSelectMatch}
        onEditReport={onEditReport}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Prossimi match' })).toBeInTheDocument()
    expect(screen.getByText('Padel della prossima settimana')).toBeInTheDocument()
    expect(screen.getByText('Da prenotare')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Partite giocate' })).toBeInTheDocument()
    expect(screen.getByText('Padel della settimana scorsa')).toBeInTheDocument()
    expect(screen.getByText('Giocata')).toBeInTheDocument()
    expect(screen.getByLabelText('Media di 2 voti ricevuti: 8,5 su 10')).toBeInTheDocument()
    expect(screen.getByText('8,5')).toBeInTheDocument()
    expect(screen.getByText('2 set registrati')).toBeInTheDocument()
    expect(screen.getByText('6–4 · 3–6')).toBeInTheDocument()

    await user.click(screen.getByRole('button', {
      name: /Apri Padel della prossima settimana.*nella bacheca/,
    }))
    expect(onSelectMatch).toHaveBeenCalledWith(matches.upcoming[0])

    await user.click(screen.getByRole('button', {
      name: /Modifica il referto di Padel della settimana scorsa/,
    }))
    expect(onEditReport).toHaveBeenCalledWith(matches.past[0])

    await user.click(screen.getByRole('button', { name: 'Torna alla bacheca' }))
    expect(onBack).toHaveBeenCalledOnce()
  })
})
