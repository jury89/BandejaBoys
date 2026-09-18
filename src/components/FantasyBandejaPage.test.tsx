import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FantasyEntry, FantasyRound, MemberProfile, SessionUser } from '../types'
import styles from '../styles.css?raw'
import { FANTASY_SUMMER_2026_ENDS_AT } from '../lib/fantasySeasons'
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
      onBack={vi.fn()}
      onRetry={onRetry}
      onSave={onSave}
      {...overrides}
    />,
  )
  return { onRetry, onSave }
}

function courtRound(locksAt: number, totals = [10, 8, 8.5, 3.5]): FantasyRound {
  return {
    ...round, id: `court-${locksAt}`, locksAt, slotStartsAt: new Date(locksAt).toISOString(), status: 'scored',
    playerScores: round.participants.map((player, index) => ({
      ...player, scoringModel: 'feedback-v3', baseRating: [8, 6, 9, 4][index], ratingCount: 3, usedDefaultRating: false,
      feedbackLevel: 4, setWins: index < 2 ? 2 : 0, setLosses: index < 2 ? 0 : 2,
      gameDifference: index < 2 ? 12 : -12, resultBonus: index < 2 ? 1.5 : -0.5, differenceBonus: index < 2 ? 0.5 : 0,
      fantasyScore: totals[index], isMvp: false, isTopPerformer: index === 2,
    })),
  }
}

describe('FantaBandeja', () => {
  it('mostra piazzamenti invernali, zero punti e somma auditabile senza cambiare l’archivio estivo', async () => {
    const user = userEvent.setup()
    const summer = courtRound(FANTASY_SUMMER_2026_ENDS_AT - 1)
    const winter = courtRound(FANTASY_SUMMER_2026_ENDS_AT)
    renderPage({ rounds: [summer, winter], now: winter.locksAt + 3 * 86_400_000 })
    expect(screen.getByText('In campo si gioca per il podio: 5, 3, 1 e 0 punti. Formazioni Fanta, stesse regole.')).toBeInTheDocument()
    expect(screen.queryByText('Si chiude domenica 27 settembre alle 23:59.')).not.toBeInTheDocument()
    expect(screen.getByText('1° in campo · +5 pt campionato')).toBeInTheDocument()
    expect(screen.getByText('4° in campo · +0 pt campionato')).toBeInTheDocument()
    expect(screen.getByLabelText('Miglior giudizio medio')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mostra il calcolo del punteggio di Ale' }))
    const details = screen.getByRole('region', { name: 'Calcolo punteggio di Ale' })
    expect(within(details).getByText('Miglior giocatore della partita')).toBeInTheDocument()
    expect(within(details).getByText('5 punti in classifica')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /Classifica/i }))
    await user.click(screen.getByRole('button', { name: 'Mostra dettaglio punti di Ale' }))
    expect(screen.getByRole('region', { name: 'Dettaglio punti di Ale' })).toHaveTextContent('1° in campo · Miglior giocatore · 10 fantasy pt')
    expect(screen.getByRole('region', { name: 'Dettaglio punti di Ale' })).toHaveTextContent('5 = 5 pt')
    await user.click(screen.getByRole('button', { name: /Estate 2026.*Archivio/ }))
    expect(screen.getByRole('button', { name: /dettaglio punti di Ale/ })).toHaveTextContent('2pt')
    expect(screen.getByRole('button', { name: /dettaglio punti di Brescio/ })).toHaveTextContent('3pt')
    expect(screen.queryByText(/1° in campo/)).not.toBeInTheDocument()
  })

  it('spiega i pari merito invernali e il riepilogo personale di chi è in campo', async () => {
    const user = userEvent.setup()
    const winter = courtRound(FANTASY_SUMMER_2026_ENDS_AT, [10, 10, 8, 7])
    renderPage({ rounds: [winter], now: winter.locksAt + 3 * 86_400_000, user: members[0] })
    expect(screen.getByText('Tu in campo: 1° ex aequo · +5 campionato')).toBeInTheDocument()
    expect(screen.getAllByText('1° in campo ex aequo · +5 pt campionato')).toHaveLength(2)
    expect(screen.getByText('3° in campo · +1 pt campionato')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Come si gioca' }))
    const dialog = screen.getByRole('dialog', { name: 'Come si gioca' })
    expect(within(dialog).getByRole('heading', { name: 'Punti in campo · Inverno 2026/27' })).toBeInTheDocument()
    expect(within(dialog).getByText(/due primi ricevono 5 punti ciascuno/)).toBeInTheDocument()
    expect(within(dialog).getByText(/bonus capitano resta legato soltanto al giudizio medio/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/Chi gioca in campo riceve 2 punti/)).not.toBeInTheDocument()
  })

  it('in estate annuncia la novità senza applicarla e il regolamento segue la stagione consultata', async () => {
    const user = userEvent.setup()
    renderPage({ now: FANTASY_SUMMER_2026_ENDS_AT + 1 })
    await user.click(screen.getByRole('button', { name: /Estate 2026.*Archivio/ }))
    await user.click(screen.getByRole('button', { name: 'Come si gioca' }))
    const dialog = screen.getByRole('dialog', { name: 'Come si gioca' })
    expect(within(dialog).getByRole('heading', { name: 'Punti in campo · Estate 2026' })).toBeInTheDocument()
    expect(within(dialog).getByText(/Chi gioca in campo riceve 2 punti/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Le partite estive conservano le regole attuali anche se calcolate più tardi/)).toBeInTheDocument()
  })

  it('mostra soltanto la stagione corrente e il countdown prima della chiusura', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'Estate 2026' })).toBeInTheDocument()
    expect(screen.getByRole('timer', { name: /Alla chiusura/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Estate 2026.*In corso/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Inverno 2026\/27/ })).not.toBeInTheDocument()
  })

  it('separa classifica invernale e archivio estivo dalla data della partita', async () => {
    const user = userEvent.setup()
    const winterNow = FANTASY_SUMMER_2026_ENDS_AT + 60_000
    const scoredRound = (id: string, locksAt: number, leaguePoints: number): FantasyRound => ({
      ...round,
      id,
      pollId: id,
      slotId: id,
      slotStartsAt: new Date(locksAt).toISOString(),
      slotEndsAt: locksAt + 90 * 60_000,
      locksAt,
      settlesAt: locksAt + 24 * 60 * 60_000,
      status: 'scored',
      standings: [{
        managerId: manager.id,
        managerName: manager.displayName,
        playerIds: ['a', 'b'],
        captainId: 'a',
        totalScore: 18,
        captainRating: 7,
        baseRatingTotal: 13,
        rank: 1,
        leaguePoints,
      }],
      playerScores: [],
      settledAt: locksAt + 60_000,
    })
    const summerRound = scoredRound('summer-round', FANTASY_SUMMER_2026_ENDS_AT - 60_000, 5)
    const winterRound = scoredRound('winter-round', FANTASY_SUMMER_2026_ENDS_AT + 60_000, 3)

    renderPage({ rounds: [summerRound, winterRound], now: winterNow })

    expect(screen.getByRole('heading', { name: 'Inverno 2026/27' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Inverno 2026\/27.*In corso/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Estate 2026.*Archivio/ })).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByRole('tab', { name: /Classifica/i }))
    expect(screen.getByRole('button', { name: /dettaglio punti di Jury/i })).toHaveTextContent('3pt')

    await user.click(screen.getByRole('button', { name: /Estate 2026.*Archivio/ }))
    expect(screen.getByText('Sola consultazione.')).toBeInTheDocument()
    expect(screen.getByRole('timer', { name: /Stagione conclusa: 0 giorni/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dettaglio punti di Jury/i })).toHaveTextContent('5pt')
  })

  it('apre il regolamento completo e permette di chiuderlo', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Come si gioca' }))

    const dialog = screen.getByRole('dialog', { name: 'Come si gioca' })
    expect(within(dialog).getByText('Entra da spettatore')).toBeInTheDocument()
    expect(within(dialog).getByText('Punteggio giocatore')).toBeInTheDocument()
    expect(within(dialog).getByText(/chi gioca in campo riceve 2 punti/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/chi ottiene il giudizio medio migliore ne riceve 3/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/dopo 10 minuti di sicurezza/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/dopo 24 ore/i)).toBeInTheDocument()
    expect(within(dialog).getByText(/annullato a 48 ore/i)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Chiudi' }))
    expect(screen.queryByRole('dialog', { name: 'Come si gioca' })).not.toBeInTheDocument()
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

  it('mostra lo stato reale di referto, voti e finestra di consolidamento', () => {
    const afterMatch = round.slotEndsAt + 5 * 60_000
    const readyAt = afterMatch + 5 * 60_000
    renderPage({
      now: afterMatch,
      rounds: [{
        ...round,
        locksAt: round.locksAt - 1,
        hasMatchReport: true,
        feedbackResponseCount: 4,
        settlementReadyAt: readyAt,
      }],
    })

    expect(screen.getByText('Tutto pronto · risultato tra pochi minuti.')).toBeInTheDocument()
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
    const obsoleteEntry: FantasyEntry = {
      ...entry,
      id: 'a',
      managerId: 'a',
      managerName: 'Ale',
      playerIds: ['b', 'c'],
      captainId: 'b',
      rosterKey: '["a","b","c","manager"]',
    }
    const lockedNow = round.locksAt + 1
    renderPage({
      now: lockedNow,
      roundEntries: { [round.id]: [entry, obsoleteEntry] },
    })

    expect(screen.getByText('Formazioni bloccate')).toBeInTheDocument()
    expect(screen.getByText('Ale + Luigi')).toBeInTheDocument()
    expect(screen.getByText('La tua')).toBeInTheDocument()
    expect(screen.queryByText('Baru + Brescio')).not.toBeInTheDocument()
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
