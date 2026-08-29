import { render, screen, within } from '@testing-library/react'
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
    receivedFeedback: { level: 4, ratingCount: 3 },
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
        {
          id: 'set-3',
          teamA: [
            { userId: 'c', displayName: 'Luca' },
            { userId: 'd', displayName: 'Teo' },
          ],
          teamB: [
            { userId: 'a', displayName: 'Ale' },
            { userId: 'b', displayName: 'Baru' },
          ],
          scoreA: 5,
          scoreB: 7,
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
    expect(screen.getByLabelText('Pavone gonfiato, 3 giudizi ricevuti')).toBeInTheDocument()
    expect(screen.getByText('Pavone gonfiato')).toBeInTheDocument()
    expect(screen.getByText('3 set registrati')).toBeInTheDocument()
    const firstFormation = screen.getByRole('table', {
      name: 'Formazione 1: Ale + Baru contro Luca + Teo',
    })
    expect(within(firstFormation).getByText('S1')).toBeInTheDocument()
    expect(within(firstFormation).getByText('S3')).toBeInTheDocument()
    expect(within(firstFormation).getByRole('row', { name: 'Ale + Baru 6 7' })).toBeInTheDocument()
    expect(within(firstFormation).getByRole('row', { name: 'Luca + Teo 4 5' })).toBeInTheDocument()

    const secondFormation = screen.getByRole('table', {
      name: 'Formazione 2: Ale + Luca contro Baru + Teo',
    })
    expect(within(secondFormation).getByText('S2')).toBeInTheDocument()
    expect(within(secondFormation).getByRole('row', { name: 'Ale + Luca 3' })).toBeInTheDocument()
    expect(within(secondFormation).getByRole('row', { name: 'Baru + Teo 6' })).toBeInTheDocument()
    expect(screen.queryByText('6–4 · 3–6 · 5–7')).not.toBeInTheDocument()

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
