import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FantasyEntry, FantasyRound, MemberProfile, SessionUser } from '../types'
import styles from '../styles.css?raw'
import { FantasyBandejaPage } from './FantasyBandejaPage'

const now = new Date('2026-08-03T12:00:00.000Z').getTime()
const members: MemberProfile[] = [
  { id: 'a', displayName: 'Ale', email: 'a@example.test', createdAt: 1 },
  { id: 'b', displayName: 'Baru', email: 'b@example.test', createdAt: 1 },
  { id: 'c', displayName: 'Brescio', email: 'c@example.test', createdAt: 1 },
  { id: 'd', displayName: 'Luigi', email: 'd@example.test', createdAt: 1 },
  { id: 'manager', displayName: 'Jury', email: 'manager@example.test', createdAt: 1 },
]
const manager = members[4] as SessionUser
const round: FantasyRound = {
  id: 'poll-1__slot-1',
  pollId: 'poll-1',
  pollTitle: 'Padel · 3 ago – 9 ago 2026',
  slotId: 'slot-1',
  slotStartsAt: '2026-08-04T17:30:00.000Z',
  slotEndsAt: new Date('2026-08-04T19:00:00.000Z').getTime(),
  locksAt: new Date('2026-08-04T17:30:00.000Z').getTime(),
  settlesAt: new Date('2026-08-06T19:00:00.000Z').getTime(),
  participantIds: ['a', 'b', 'c', 'd'],
  participants: members.slice(0, 4).map(({ id, displayName }) => ({
    userId: id,
    displayName,
  })),
  rosterKey: '["a","b","c","d"]',
  status: 'open',
  createdAt: now,
  updatedAt: now,
}

function renderPage(overrides: Partial<Parameters<typeof FantasyBandejaPage>[0]> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(
    <FantasyBandejaPage
      rounds={[round]}
      ownEntries={{}}
      roundEntries={{}}
      members={members}
      user={manager}
      now={now}
      loading={false}
      error={null}
      onBack={vi.fn()}
      onSave={onSave}
      {...overrides}
    />,
  )
  return { onSave }
}

describe('FantaBandeja', () => {
  it('apre il regolamento completo e permette di chiuderlo', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Come si gioca' }))

    const dialog = screen.getByRole('dialog', { name: 'Come si gioca' })
    expect(within(dialog).getByText('Entra da spettatore')).toBeInTheDocument()
    expect(within(dialog).getByText('Punteggio giocatore')).toBeInTheDocument()
    expect(within(dialog).getByText(/chi gioca in campo riceve 2 punti/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/l’MVP ne riceve 3/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/Dopo 24 ore il risultato/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/A 48 ore il round si chiude comunque/i)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Chiudi' }))
    expect(screen.queryByRole('dialog', { name: 'Come si gioca' })).not.toBeInTheDocument()
  })

  it('permette a uno spettatore di scegliere due giocatori e il capitano', async () => {
    const user = userEvent.setup()
    const { onSave } = renderPage()
    const court = screen.getByLabelText('I quattro titolari disponibili')

    await user.click(within(court).getByRole('button', { name: /Ale/i }))
    await user.click(within(court).getByRole('button', { name: /Luigi/i }))
    const captainArea = screen.getByText('Chi porta la fascia?').parentElement!
    await user.click(within(captainArea).getByRole('button', { name: /Luigi/i }))
    await user.click(screen.getByRole('button', { name: 'Salva formazione' }))

    expect(onSave).toHaveBeenCalledWith(round.id, {
      playerIds: ['a', 'd'],
      captainId: 'd',
    })
    expect(screen.getByText('Scelta segreta fino al via')).toBeInTheDocument()
  })

  it('mantiene lime entrambi i giocatori selezionati anche quando l’ultimo resta in hover', async () => {
    const user = userEvent.setup()
    renderPage()
    const court = screen.getByLabelText('I quattro titolari disponibili')

    await user.click(within(court).getByRole('button', { name: /Ale/i }))
    await user.click(within(court).getByRole('button', { name: /Baru/i }))

    const selectedPlayers = within(court).getAllByRole('button', { pressed: true })
    expect(selectedPlayers).toHaveLength(2)
    selectedPlayers.forEach((player) => expect(player).toHaveClass('is-selected'))
    expect(styles).toContain('.fantasy-player:not(.is-selected):hover:not(:disabled)')
  })

  it('non fa giocare uno dei quattro titolari', () => {
    renderPage({ user: members[0] as SessionUser })

    expect(screen.getByText('Tu sei in campo.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salva formazione' })).not.toBeInTheDocument()
    within(screen.getByLabelText('I quattro titolari disponibili'))
      .getAllByRole('button')
      .forEach((button) => expect(button).toBeDisabled())
  })

  it('rende pubbliche le formazioni soltanto dopo il blocco', () => {
    const entry: FantasyEntry = {
      id: 'manager',
      roundId: round.id,
      pollId: round.pollId,
      slotId: round.slotId,
      managerId: 'manager',
      managerName: 'Jury',
      playerIds: ['a', 'd'],
      captainId: 'd',
      rosterKey: round.rosterKey,
      locksAt: round.locksAt,
      createdAt: now,
      updatedAt: now,
    }
    const lockedNow = round.locksAt + 1
    renderPage({
      now: lockedNow,
      roundEntries: { [round.id]: [entry] },
    })

    expect(screen.getByText('Formazioni bloccate')).toBeInTheDocument()
    expect(screen.getByText('Ale + Luigi')).toBeInTheDocument()
    expect(screen.getByText('La tua')).toBeInTheDocument()
  })

  it('nasconde un round sospeso invece di mostrarne la rosa obsoleta', () => {
    renderPage({ rounds: [{ ...round, status: 'pending' }] })

    expect(screen.getByText('Spogliatoi ancora vuoti')).toBeInTheDocument()
    expect(screen.queryByLabelText('I quattro titolari disponibili')).not.toBeInTheDocument()
    expect(screen.queryByText('Round annullato')).not.toBeInTheDocument()
  })

  it('espande il conteggio di un giocatore mostrando voto e modificatori', async () => {
    const user = userEvent.setup()
    const scoredRound: FantasyRound = {
      ...round,
      status: 'scored',
      playerScores: [{
        userId: 'a',
        displayName: 'Ale',
        baseRating: 5,
        ratingCount: 3,
        usedDefaultRating: false,
        setWins: 2,
        setLosses: 1,
        gameDifference: 1,
        resultBonus: 1.5,
        differenceBonus: 0,
        fantasyScore: 6.5,
        isMvp: false,
      }],
      standings: [],
      settledAt: round.settlesAt,
    }
    renderPage({ rounds: [scoredRound], now: round.settlesAt + 1 })

    const toggle = screen.getByRole('button', { name: 'Mostra il calcolo del punteggio di Ale' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const breakdown = screen.getByRole('region', { name: 'Calcolo punteggio di Ale' })
    expect(within(breakdown).getByLabelText('Calcolo: 5 +1,5 0 uguale 6,5')).toBeInTheDocument()
    expect(within(breakdown).getByText('Voto base')).toBeInTheDocument()
    expect(within(breakdown).getByText('3 pagelle ricevute')).toBeInTheDocument()
    expect(within(breakdown).getByText('2 vinti · 1 perso')).toBeInTheDocument()
    expect(within(breakdown).getAllByText('+1,5')).toHaveLength(2)
    expect(within(breakdown).getByText('Differenza totale +1')).toBeInTheDocument()
    expect(styles).toContain('.fantasy-player-score.is-expanded')

    await user.click(toggle)
    expect(screen.queryByRole('region', { name: 'Calcolo punteggio di Ale' })).not.toBeInTheDocument()
  })
})
