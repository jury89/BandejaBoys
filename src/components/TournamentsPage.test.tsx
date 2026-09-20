import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SLOT_ADMIN_USER_ID } from '../lib/admin'
import { advanceTournament, makeTournament, makeTournamentScore, publishTournament, registerForTournament, startTournament } from '../lib/domain'
import type { Tournament, TournamentInput, TournamentScore } from '../lib/tournamentTypes'
import { TournamentsPage } from './TournamentsPage'

vi.mock('../lib/repository', async () => {
  const { localTournamentRepository } = await import('../lib/tournamentRepository')
  return { repository: localTournamentRepository() }
})
const now = Date.UTC(2026, 9, 1, 10)
const admin = { id: SLOT_ADMIN_USER_ID, displayName: 'Jury', email: 'jury@example.test', createdAt: 1 }
const members = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, displayName: `Giocatore ${i}`, email: `p${i}@example.test`, createdAt: 1 }))
const input: TournamentInput = { title: 'Torneo dei fagiani', startsAt: now + 7_200_000, venueId: 'sport-city-mantova', format: 'americano', pairing: 'rotating', capacity: 8, courts: 2, rounds: 3, pointsPerMatch: 24, scoreAccess: 'players' }
function fixture(overrides: Partial<TournamentInput> = {}, count = 4) {
  let t = publishTournament(makeTournament('qa', { ...input, ...overrides }, admin.id, now - 86_400_000), admin.id, now - 86_400_000)
  for (const u of members.slice(0, count)) t = registerForTournament(t, u, null, now - 86_400_000)
  return t
}
function seed(t: Tournament, scores: TournamentScore[] = []) {
  localStorage.setItem('bandeja-tournaments-v1', JSON.stringify({ tournaments: [t], scores: { [t.id]: scores } }))
  window.history.replaceState(null, '', `/#tornei/${t.id}`)
}
const show = (user = admin) => render(<TournamentsPage user={user} members={[admin, ...members]} onBack={vi.fn()} />)

describe('TournamentsPage', () => {
  beforeEach(() => {
    localStorage.removeItem('bandeja-tournaments-v1')
    window.history.replaceState(null, '', '/#tornei')
    vi.spyOn(Date, 'now').mockReturnValue(now)
  })
  afterEach(() => vi.restoreAllMocks())
  it('admin chooses a described formula, venue, fixed pair mode and privately saves then publishes', async () => {
    const u = userEvent.setup(); show()
    await u.click(screen.getByRole('button', { name: /Crea torneo/ }))
    const modal = screen.getByRole('dialog')
    expect(within(modal).getAllByRole('radio')).toHaveLength(4)
    await u.type(within(modal).getByLabelText('Nome del torneo'), 'Coppa del gruppo')
    await u.click(within(modal).getByRole('radio', { name: /Girone all’italiana/ }))
    await u.selectOptions(within(modal).getByLabelText('Coppie fisse'), 'chosen-fixed')
    await u.selectOptions(within(modal).getByLabelText('Circolo'), 'tennis-club-mantova')
    expect(within(modal).getByLabelText('Chi può inserire i risultati')).toHaveValue('players')
    await u.click(within(modal).getByRole('button', { name: 'Salva bozza privata' }))
    expect(await screen.findByRole('heading', { name: 'Coppa del gruppo' })).toBeInTheDocument()
    expect(screen.getByText('Bozza privata')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Iscriviti al torneo' })).not.toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Pubblica al gruppo' }))
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Conferma' }))
    expect(await screen.findByRole('button', { name: 'Iscriviti al torneo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Modifica bozza' })).not.toBeInTheDocument()
  })
  it('members never see the creation button or private drafts', () => {
    localStorage.setItem('bandeja-tournaments-v1', JSON.stringify({ tournaments: [makeTournament('secret', input, admin.id, now)], scores: {} }))
    show(members[0])
    expect(screen.queryByRole('button', { name: /Crea torneo/ })).not.toBeInTheDocument()
    expect(screen.queryByText(input.title)).not.toBeInTheDocument()
    expect(screen.getByText('Il primo torneo aspetta voi')).toBeInTheDocument()
  })
  it('members join, choose a partner and withdraw without writing for anyone else', async () => {
    seed(fixture({ format: 'round-robin', pairing: 'chosen-fixed' }, 2))
    const u = userEvent.setup(); show(members[2])
    await u.click(await screen.findByRole('button', { name: 'Iscriviti al torneo' }))
    await u.selectOptions(screen.getByRole('combobox', { name: /Scegli il tuo compagno/ }), 'p0')
    expect(await screen.findByText('In attesa di Giocatore 0')).toBeInTheDocument()
    expect(screen.queryByText(/Coppia confermata con/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sorteggia/ })).not.toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Ritira iscrizione' }))
    expect(await screen.findByRole('button', { name: 'Iscriviti al torneo' })).toBeInTheDocument()
    expect(screen.getByText('2/8')).toBeInTheDocument()
  })
  it('closes registration on the exact cutoff, including a page left open across it', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    seed(fixture({ startsAt: now + 3_600_001 }))
    show(members[7])
    expect(screen.getByRole('button', { name: 'Iscriviti al torneo' })).toBeInTheDocument()
    vi.spyOn(Date, 'now').mockReturnValue(now + 1)
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(screen.queryByRole('button', { name: 'Iscriviti al torneo' })).not.toBeInTheDocument()
    expect(screen.getByText('Iscrizioni chiuse')).toBeInTheDocument()
    vi.useRealTimers()
  })
  it('a player can save/correct only their own current match and sees validation errors', async () => {
    const t = startTournament(fixture({ startsAt: now }, 8), admin.id, 42, now)
    seed(t); const u = userEvent.setup(); show(members[0])
    const buttons = await screen.findAllByRole('button', { name: /Inserisci risultato/ })
    expect(buttons).toHaveLength(1)
    await u.click(buttons[0])
    const modal = screen.getByRole('dialog'), fields = within(modal).getAllByRole('spinbutton')
    await u.type(fields[0], '14'); await u.type(fields[1], '9')
    await u.click(within(modal).getByRole('button', { name: 'Salva risultato' }))
    expect(await within(modal).findByRole('alert')).toHaveTextContent(/sommare 24/)
    await u.clear(fields[1]); await u.type(fields[1], '10')
    await u.click(within(modal).getByRole('button', { name: 'Salva risultato' }))
    expect(await screen.findByRole('button', { name: /Modifica risultato/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Conferma turno/ })).not.toBeInTheDocument()
  })
  it('spectators can read results but have no scoring controls', async () => {
    const t = startTournament(fixture({ startsAt: now }, 4), admin.id, 42, now)
    seed(t); show(members[7])
    expect(await screen.findByText('Classifica provvisoria')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /risultato/ })).not.toBeInTheDocument()
  })
  it('admin confirms the completed bronze/final and a podium appears without altering old results', async () => {
    let t = startTournament(fixture({ startsAt: now, format: 'knockout', pairing: 'random-fixed' }, 8), admin.id, 42, now)
    let scores = Object.values(t.matches).map(m => makeTournamentScore(t, m.id, 6, 3, admin.id, undefined, 0, now))
    t = advanceTournament(t, scores, admin.id, now)
    scores = [...scores, ...Object.values(t.matches).filter(m => m.round === 2).map(m => makeTournamentScore(t, m.id, 6, 4, admin.id, undefined, 0, now))]
    seed(t, scores); const u = userEvent.setup(); show()
    await u.click(await screen.findByRole('button', { name: 'Concludi torneo e assegna il podio' }))
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Conferma' }))
    expect(await screen.findByRole('heading', { name: 'Il podio e la classifica finale' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Modifica risultato/ })).not.toBeInTheDocument()
    expect(screen.getByText('Concluso')).toBeInTheDocument()
  })
})
