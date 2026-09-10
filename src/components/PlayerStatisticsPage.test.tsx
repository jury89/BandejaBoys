import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState, type ComponentProps } from 'react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { MatchReport, MemberProfile, PadelPoll } from '../types'
import styles from '../styles.css?raw'
import { PlayerStatisticsPage } from './PlayerStatisticsPage'

vi.mock('../InterfaceContext', () => ({ useInterfaceMode: () => 'nuova', clearInterfaceOverride: vi.fn() }))

function StatisticsHarness(props: ComponentProps<typeof PlayerStatisticsPage>) {
  const [selectedPlayerId, setSelectedPlayerId] = useState(props.selectedPlayerId)
  return <PlayerStatisticsPage {...props} selectedPlayerId={selectedPlayerId} onSelectPlayer={(id) => {
    setSelectedPlayerId(id)
    props.onSelectPlayer(id)
  }} />
}

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
  it('mantiene le linee di servizio a 3,05 metri dal fondo del campo', () => {
    expect(styles).toContain('--padel-service-line-inset: 15.25%')
    expect(styles).toContain('right: var(--padel-service-line-inset)')
    expect(styles).toContain('left: var(--padel-service-line-inset)')
  })

  it('mostra il profilo, cambia giocatore e rende consultabili rapporti e storico', async () => {
    const onSelectPlayer = vi.fn()
    const browserUser = userEvent.setup()
    render(
      <StatisticsHarness
        polls={[poll]}
        members={members}
        user={user}
        selectedPlayerId="jury"
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

    const picker = screen.getByLabelText('Cerca giocatore').closest('details')!
    fireEvent.click(picker.querySelector('summary')!)
    await browserUser.type(screen.getByLabelText('Cerca giocatore'), 'aLeX')
    expect(within(screen.getByRole('group', { name: 'Giocatori' })).getAllByRole('button')).toHaveLength(1)
    await browserUser.clear(screen.getByLabelText('Cerca giocatore'))
    await browserUser.type(screen.getByLabelText('Cerca giocatore'), 'nessuno')
    expect(screen.getByText('Nessun giocatore trovato.')).toBeInTheDocument()
    await browserUser.clear(screen.getByLabelText('Cerca giocatore'))

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

  it('spiega lo stato vuoto e mantiene il focus sul selettore dopo il cambio giocatore', async () => {
    const browserUser = userEvent.setup()
    render(
      <StatisticsHarness
        polls={[]}
        members={members}
        user={user}
        selectedPlayerId="ale"
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

    const picker = screen.getByLabelText('Cerca giocatore').closest('details')!
    const summary = picker.querySelector('summary')!
    await browserUser.click(summary)
    await browserUser.click(within(screen.getByRole('group', { name: 'Giocatori' })).getByRole('button', { name: 'Tu' }))
    expect(picker).not.toHaveAttribute('open')
    expect(summary).toHaveFocus()
    expect(screen.getByRole('heading', { name: 'Jury' })).toBeInTheDocument()
  })

  it('segue il giocatore scelto dal contenitore senza perdere la vista corrente', async () => {
    const browserUser = userEvent.setup()
    const props = {
      polls: [poll], members, user, feedbackSummaries: [], matchReports: [report],
      now: Date.parse('2026-08-01T12:00:00.000Z'), loading: false, error: null,
      onBack: vi.fn(), onSelectPlayer: vi.fn(),
    }
    const { rerender } = render(<PlayerStatisticsPage {...props} selectedPlayerId="jury" />)
    await browserUser.click(screen.getByRole('button', { name: /Storico/ }))

    rerender(<PlayerStatisticsPage {...props} selectedPlayerId="ale" />)
    expect(screen.getByRole('heading', { name: 'Alex' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Storico/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Storico personale' })).toBeInTheDocument()

    rerender(<PlayerStatisticsPage {...props} selectedPlayerId="sconosciuto" />)
    expect(screen.getByRole('heading', { name: 'Jury' })).toBeInTheDocument()
  })
})
