import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { MatchReport, MemberProfile, PadelPoll } from '../types'
import { PlayerStatisticsPage } from './PlayerStatisticsPage'

const user: MemberProfile = {
  id: 'jury',
  displayName: 'Jury',
  email: 'jury@example.test',
  createdAt: 1,
}

const members: MemberProfile[] = [
  user,
  { id: 'ale', displayName: 'Alex', email: 'ale@example.test', createdAt: 1 },
  { id: 'baru', displayName: 'Baru', email: 'baru@example.test', createdAt: 1 },
  { id: 'teo', displayName: 'Teo', email: 'teo@example.test', createdAt: 1 },
]

const players = members.map((member) => ({ userId: member.id, displayName: member.displayName }))

const poll: PadelPoll = {
  id: 'poll-statistics',
  title: 'Titolo storico',
  targetWeekStart: '2026-07-27',
  createdBy: 'jury',
  createdByName: 'Jury',
  createdAt: 1,
  updatedAt: 1,
  status: 'closed',
  slots: [{
    id: 'slot-statistics',
    startsAt: '2026-07-29T18:30',
    durationMinutes: 90,
    venue: 'Oasi Boschetto',
    bookedAt: 1,
    signups: members.map((member, index) => ({
      id: `signup-${member.id}`,
      userId: member.id,
      displayName: member.displayName,
      joinedAt: index + 1,
    })),
  }],
}

const report: MatchReport = {
  id: 'poll-statistics__slot-statistics',
  pollId: 'poll-statistics',
  pollTitle: 'Padel',
  slotId: 'slot-statistics',
  sessionStartsAt: poll.slots[0].startsAt,
  participantIds: members.map((member) => member.id),
  participants: players,
  sets: [
    { id: 'set-1', teamA: [players[0], players[1]], teamB: [players[2], players[3]], scoreA: 6, scoreB: 4 },
    { id: 'set-2', teamA: [players[0], players[1]], teamB: [players[2], players[3]], scoreA: 7, scoreB: 6 },
    { id: 'set-3', teamA: [players[0], players[1]], teamB: [players[2], players[3]], scoreA: 4, scoreB: 6 },
  ],
  createdBy: 'jury',
  createdByName: 'Jury',
  createdAt: 1,
  updatedBy: 'jury',
  updatedByName: 'Jury',
  updatedAt: 1,
}

describe('pagina statistiche giocatore', () => {
  it('mostra il profilo, cambia giocatore e rende consultabili rapporti e storico', async () => {
    const onSelectPlayer = vi.fn()
    const browserUser = userEvent.setup()
    render(
      <PlayerStatisticsPage
        polls={[poll]}
        members={members}
        user={user}
        initialPlayerId="jury"
        feedbackSummaries={[{
          id: 'poll-statistics__slot-statistics__jury',
          pollId: 'poll-statistics',
          slotId: 'slot-statistics',
          playerId: 'jury',
          scoreUnitsTotal: 30,
          ratingCount: 2,
          lastResponseId: 'response-2',
          updatedAt: 2,
        }]}
        matchReports={[report]}
        now={Date.parse('2026-08-01T12:00:00.000Z')}
        loading={false}
        error={null}
        onBack={vi.fn()}
        onSelectPlayer={onSelectPlayer}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Jury' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Il tabellino' })).toBeInTheDocument()
    expect(screen.getByText('Pavone gonfiato')).toBeInTheDocument()
    expect(screen.getByText(/Referto disponibile per 1 partita su 1/)).toBeInTheDocument()

    await browserUser.click(screen.getByRole('button', { name: /Coppie e rivali/ }))
    expect(screen.getByText('Compagno portafortuna')).toBeInTheDocument()
    expect(screen.getAllByText('2 set vinti su 3 (66,7%) · 1 game fatto in più degli avversari')).toHaveLength(3)
    const teammateList = screen.getByRole('heading', { name: 'Come compagni' }).closest('section')
    expect(teammateList).not.toBeNull()
    expect(within(teammateList!).getByText('Alex')).toBeInTheDocument()

    await browserUser.click(screen.getByRole('button', { name: 'Apri le statistiche di Alex' }))
    expect(onSelectPlayer).toHaveBeenCalledWith('ale')
    expect(screen.getByRole('heading', { name: 'Alex' })).toBeInTheDocument()

    await browserUser.click(screen.getByRole('button', { name: /Storico/ }))
    expect(screen.getByRole('heading', { name: 'Storico personale' })).toBeInTheDocument()
    expect(screen.getByText('2–1')).toBeInTheDocument()
  })

  it('spiega lo stato vuoto senza mostrare zeri come prestazioni', () => {
    render(
      <PlayerStatisticsPage
        polls={[]}
        members={members}
        user={user}
        initialPlayerId="ale"
        feedbackSummaries={[]}
        matchReports={[]}
        now={Date.parse('2026-08-01T12:00:00.000Z')}
        loading={false}
        error={null}
        onBack={vi.fn()}
        onSelectPlayer={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Ancora nessuna partita' })).toBeInTheDocument()
    expect(screen.getByText(/dopo la prima partita conclusa e prenotata/)).toBeInTheDocument()
  })
})
