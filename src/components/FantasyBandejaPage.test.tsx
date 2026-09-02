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
  const onRetry = vi.fn()
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
      readOnly={false}
      onBack={vi.fn()}
      onRetry={onRetry}
      onSave={onSave}
      {...overrides}
    />,
  )
  return { onRetry, onSave }
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
    expect(within(dialog).getByText(/chi ottiene il giudizio medio migliore ne riceve 3/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/Dopo 24 ore il risultato/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/A 48 ore il round si chiude comunque/i)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Chiudi' }))
    expect(screen.queryByRole('dialog', { name: 'Come si gioca' })).not.toBeInTheDocument()
  })

  it('in modalità archivio mostra solo classifica e risultati senza azioni di gioco', async () => {
    const user = userEvent.setup()
    const scoredRound: FantasyRound = {
      ...round,
      id: 'poll-past__slot-past',
      pollId: 'poll-past',
      slotId: 'slot-past',
      slotStartsAt: '2026-07-30T16:30:00.000Z',
      slotEndsAt: now - 90 * 60_000,
      locksAt: now - 180 * 60_000,
      settlesAt: now - 60_000,
      status: 'scored',
      standings: [],
      playerScores: [],
      settledAt: now - 30_000,
    }

    renderPage({ rounds: [round, scoredRound], readOnly: true })

    expect(screen.getByRole('heading', { name: 'La stagione è finita.' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Partite/i })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Classifica/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('button', { name: /Salva formazione/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Regole della stagione' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Risultati/i }))
    expect(screen.getByText('Risultati dei round')).toBeInTheDocument()
  })

  it('separa prossimi round, classifica e risultati in tre viste navigabili', async () => {
    const user = userEvent.setup()
    const scoredRound: FantasyRound = {
      ...round,
      id: 'poll-past__slot-past',
      pollId: 'poll-past',
      slotId: 'slot-past',
      slotStartsAt: '2026-07-30T16:30:00.000Z',
      slotEndsAt: now - 90 * 60_000,
      locksAt: now - 180 * 60_000,
      settlesAt: now - 60_000,
      status: 'scored',
      standings: [{
        managerId: 'manager',
        managerName: 'Jury',
        playerIds: ['a', 'b'],
        captainId: 'a',
        totalScore: 18,
        captainRating: 7,
        baseRatingTotal: 13,
        rank: 1,
        leaguePoints: 5,
      }],
      playerScores: [],
      settledAt: now - 30_000,
    }
    renderPage({ rounds: [round, scoredRound] })

    const playTab = screen.getByRole('tab', { name: /Partite/i })
    expect(playTab).toHaveAttribute('aria-selected', 'true')
    expect(playTab).toHaveAttribute('tabindex', '0')
    expect(screen.getByText('Schiera la coppia')).toBeInTheDocument()
    expect(screen.queryByText('Classifica generale')).not.toBeInTheDocument()
    expect(screen.queryByText('Risultati dei round')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Classifica/i }))
    expect(screen.getByText('Classifica generale')).toBeInTheDocument()
    expect(screen.queryByLabelText('I quattro titolari disponibili')).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Risultati/i }))
    expect(screen.getByText('Risultati dei round')).toBeInTheDocument()
    expect(screen.queryByText('Classifica generale')).not.toBeInTheDocument()
  })

  it('naviga le tab con frecce, Home ed End secondo il pattern ARIA', async () => {
    const user = userEvent.setup()
    renderPage()

    const playTab = screen.getByRole('tab', { name: /Partite/i })
    playTab.focus()
    await user.keyboard('{ArrowRight}')

    const leaderboardTab = screen.getByRole('tab', { name: /Classifica/i })
    expect(leaderboardTab).toHaveFocus()
    expect(leaderboardTab).toHaveAttribute('aria-selected', 'true')
    expect(playTab).toHaveAttribute('tabindex', '-1')

    await user.keyboard('{End}')
    const resultsTab = screen.getByRole('tab', { name: /Risultati/i })
    expect(resultsTab).toHaveFocus()
    expect(resultsTab).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{Home}')
    expect(playTab).toHaveFocus()
    expect(playTab).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowLeft}')
    expect(resultsTab).toHaveFocus()
  })

  it('porta i round in calcolo in cima ai risultati e lascia Partite alle formazioni aperte', async () => {
    const user = userEvent.setup()
    renderPage({ now: round.locksAt + 1 })

    const resultsTab = screen.getByRole('tab', { name: /Risultati/i })
    expect(resultsTab).toHaveAttribute('aria-selected', 'true')
    expect(resultsTab).toHaveTextContent('1')
    expect(screen.getByLabelText('0 formazioni aperte')).toHaveTextContent('0')
    expect(screen.getByText('Round in calcolo')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Partite/i }))
    expect(screen.getByText('Non ci sono coppie da schierare.')).toBeInTheDocument()
    expect(screen.queryByText('Round in calcolo')).not.toBeInTheDocument()
  })

  it('mostra i round in calcolo prima dello storico nella tab Risultati', async () => {
    const user = userEvent.setup()
    const lockedRound = { ...round, id: 'locked', locksAt: now - 1 }
    const scoredRound: FantasyRound = {
      ...round,
      id: 'scored',
      status: 'scored',
      locksAt: now - 86_400_000,
      standings: [],
      playerScores: [],
      settledAt: now - 80_000_000,
    }
    renderPage({ rounds: [lockedRound, scoredRound] })

    await user.click(screen.getByRole('tab', { name: /Risultati/i }))
    const inProgressTitle = screen.getByText('Round in calcolo')
    const historyTitle = screen.getByText('Risultati dei round')
    expect(inProgressTitle.compareDocumentPosition(historyTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('permette di riprovare dopo un errore di caricamento', async () => {
    const user = userEvent.setup()
    const { onRetry } = renderPage({ error: 'Connessione non disponibile.' })

    expect(screen.getByRole('alert')).toHaveTextContent('Connessione non disponibile.')
    await user.click(screen.getByRole('button', { name: 'Riprova' }))
    expect(onRetry).toHaveBeenCalledOnce()
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

  it('espande ogni nome in classifica mostrando la somma dei punti round per round', async () => {
    const user = userEvent.setup()
    const scoredRound: FantasyRound = {
      ...round,
      status: 'scored',
      standings: [{
        managerId: 'manager',
        managerName: 'Jury',
        playerIds: ['a', 'b'],
        captainId: 'a',
        totalScore: 18,
        captainRating: 7,
        baseRatingTotal: 13,
        rank: 1,
        leaguePoints: 5,
      }],
      playerScores: [{
        userId: 'a',
        displayName: 'Ale',
        baseRating: 7,
        ratingCount: 3,
        usedDefaultRating: false,
        setWins: 2,
        setLosses: 1,
        gameDifference: 3,
        resultBonus: 1.5,
        differenceBonus: 0.5,
        fantasyScore: 9,
        isMvp: true,
      }],
      settledAt: round.settlesAt,
    }
    renderPage({ rounds: [scoredRound], now: round.settlesAt + 1 })

    await user.click(screen.getByRole('tab', { name: /Classifica/i }))
    const managerToggle = screen.getByRole('button', { name: 'Mostra dettaglio punti di Jury' })
    expect(managerToggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(managerToggle)

    const managerDetails = screen.getByRole('region', { name: 'Dettaglio punti di Jury' })
    expect(managerToggle).toHaveAttribute('aria-expanded', 'true')
    expect(within(managerDetails).getByText('5 = 5 pt')).toBeInTheDocument()
    expect(within(managerDetails).getByText(/1° posto · 18 fantasy pt/)).toBeInTheDocument()

    const playerToggle = screen.getByRole('button', { name: 'Mostra dettaglio punti di Ale' })
    await user.click(playerToggle)
    const playerDetails = screen.getByRole('region', { name: 'Dettaglio punti di Ale' })
    expect(within(playerDetails).getByText('3 = 3 pt')).toBeInTheDocument()
    expect(within(playerDetails).getByText(/MVP in campo · bonus presenza/)).toBeInTheDocument()
  })

  it('collassa lo storico, apre il round più recente e carica i risultati a gruppi', async () => {
    const user = userEvent.setup()
    const scoredRounds = Array.from({ length: 6 }, (_, index): FantasyRound => ({
      ...round,
      id: `poll-${index}__slot-${index}`,
      pollId: `poll-${index}`,
      slotId: `slot-${index}`,
      pollTitle: `Round storico ${index + 1}`,
      locksAt: now - (index + 1) * 86_400_000,
      slotEndsAt: now - (index + 1) * 86_400_000 + 5_400_000,
      status: 'scored',
      standings: [{
        managerId: 'manager',
        managerName: 'Jury',
        playerIds: ['a', 'b'],
        captainId: 'a',
        totalScore: 18 - index,
        captainRating: 7,
        baseRatingTotal: 13,
        rank: 1,
        leaguePoints: 5,
      }],
      playerScores: [],
      settledAt: now - index * 86_400_000,
    }))
    renderPage({ rounds: scoredRounds })

    const resultToggles = screen.getAllByRole('button', { name: /il risultato di/i })
    expect(resultToggles).toHaveLength(4)
    expect(resultToggles[0]).toHaveAttribute('aria-expanded', 'true')
    expect(resultToggles[1]).toHaveAttribute('aria-expanded', 'false')
    expect(within(resultToggles[0]).getByText('Vince Jury')).toBeInTheDocument()
    expect(within(resultToggles[0]).getByText('Tu: 18 punti · +5 campionato')).toBeInTheDocument()

    await user.click(resultToggles[1])
    expect(resultToggles[1]).toHaveAttribute('aria-expanded', 'true')

    await user.click(screen.getByRole('button', { name: 'Mostra altri 2 round' }))
    expect(screen.getAllByRole('button', { name: /il risultato di/i })).toHaveLength(6)
    expect(screen.queryByRole('button', { name: /Mostra altri/i })).not.toBeInTheDocument()
  })

  it('mantiene una soglia leggibile per metadati e controlli mobile', () => {
    expect(styles).toContain('--muted: #526b75')
    expect(styles).toContain('.fantasy-result__toggle')
    expect(styles).toContain('font-size: 0.75rem')
    expect(styles).toContain('min-height: 44px')
  })
})
