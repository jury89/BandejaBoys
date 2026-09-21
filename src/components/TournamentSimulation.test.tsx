import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SLOT_ADMIN_USER_ID } from '../lib/admin'
import { repository } from '../lib/repository'
import { SIMULATION_STORAGE } from '../lib/tournamentSimulation'
import { TournamentsPage } from './TournamentsPage'

vi.mock('../lib/repository', () => ({ repository: {
  subscribeTournaments: vi.fn(() => () => {}), subscribeTournament: vi.fn(() => () => {}), subscribeTournamentScores: vi.fn(() => () => {}),
  createTournament: vi.fn(), editTournament: vi.fn(), editTournamentOrganization: vi.fn(), actOnTournament: vi.fn(), registerForTournament: vi.fn(), leaveTournament: vi.fn(), saveTournamentGuest: vi.fn(), removeTournamentGuest: vi.fn(), saveTournamentScore: vi.fn(),
} }))
const admin = { id: SLOT_ADMIN_USER_ID, displayName: 'Jury', email: 'jury@example.test', createdAt: 1 }
const member = { ...admin, id: 'member', displayName: 'Altro membro' }
const show = (user = admin) => render(<TournamentsPage user={user} members={[admin, member]} onBack={vi.fn()} />)
function expectNoRemoteCalls() {
  for (const fn of Object.values(repository)) expect(fn).not.toHaveBeenCalled()
}
describe('simulation UI isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks(); localStorage.clear()
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 1, 10))
    window.history.replaceState(null, '', '/#tornei/simulazione')
  })
  afterEach(() => vi.restoreAllMocks())

  it('blocks a non-admin direct link without touching private storage or remote repositories', () => {
    show(member)
    expect(screen.getByText('Questa modalità è riservata a Jury.')).toBeInTheDocument()
    expect(localStorage.getItem(SIMULATION_STORAGE)).toBeNull()
    expectNoRemoteCalls()
  })
  it('shows the entry only to Jury, without the local-admin preview exception', () => {
    window.history.replaceState(null, '', '/#tornei')
    const view = show(member)
    expect(screen.queryByRole('button', { name: 'Simulazione privata' })).not.toBeInTheDocument()
    view.rerender(<TournamentsPage user={admin} members={[]} onBack={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Simulazione privata' })).toBeInTheDocument()
  })
  it('starts early and runs the timed rehearsal to the podium without any remote calls', async () => {
    const u = userEvent.setup(); show()
    expect(await screen.findByRole('region', { name: 'Strumenti della simulazione' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copia link torneo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pubblica al gruppo' })).not.toBeInTheDocument()
    expect(screen.getByText('10/10')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Salta alla chiusura iscrizioni' }))
    await u.click(screen.getByRole('button', { name: 'Sorteggia e prepara tabellone' }))
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Conferma' }))
    expect(screen.queryByRole('button', { name: 'Salta all’inizio del torneo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Avvia timer del turno' })).toBeEnabled()
    await u.click(screen.getByText('Strumenti di prova', { selector: 'summary' }))
    for (let i = 1; i <= 5; i++) {
      await u.click(screen.getByRole('button', { name: 'Avvia timer del turno' }))
      expect(screen.getByText('In corso', { selector: '.tournament-status' })).toBeInTheDocument()
      expect(screen.getByRole('timer')).toHaveTextContent('15:00')
      await u.click(screen.getByRole('button', { name: 'Compila risultati di prova' }))
      if (i === 1 || i === 5) {
        await u.click(screen.getByRole('button', { name: 'Concludi turno' }))
        expect(within(screen.getByRole('dialog')).getByText(/timer si fermerà per tutti/)).toBeInTheDocument()
        await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Conferma' }))
        expect(screen.getByRole('timer')).toHaveAccessibleName('Tempo rimasto alla chiusura')
      } else {
        await u.click(screen.getByRole('button', { name: 'Fai scadere il timer' }))
        expect(screen.getByRole('timer')).toHaveTextContent('00:00')
      }
      await u.click(screen.getByRole('button', { name: i === 5 ? 'Concludi torneo e assegna il podio' : 'Conferma turno e prosegui' }))
      await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Conferma' }))
    }
    expect(await screen.findByRole('heading', { name: 'Il podio e la classifica finale' })).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Partite' }))
    await u.click(screen.getByRole('button', { name: 'Ricomincia la simulazione' }))
    await u.click(screen.getByRole('button', { name: 'Conferma nuova simulazione' }))
    expect(screen.getByRole('button', { name: 'Salta alla chiusura iscrizioni' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Il podio e la classifica finale' })).not.toBeInTheDocument()
    expectNoRemoteCalls()
  })
  it('saves edits and manual scores only in the sandbox, and hides it on account switch', async () => {
    const u = userEvent.setup(), view = show()
    await u.click(screen.getByRole('button', { name: 'Modifica torneo' }))
    await u.clear(screen.getByLabelText('Nome del torneo')); await u.type(screen.getByLabelText('Nome del torneo'), 'La mia prova')
    await u.click(screen.getByRole('button', { name: 'Salva modifiche' }))
    expect(screen.getByRole('heading', { name: 'La mia prova' })).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Salta alla chiusura iscrizioni' }))
    await u.click(screen.getByRole('button', { name: 'Sorteggia e prepara tabellone' }))
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Conferma' }))
    await u.click(screen.getByRole('button', { name: 'Avvia timer del turno' }))
    await u.click(screen.getAllByRole('button', { name: /Inserisci risultato/ })[0])
    const fields = within(screen.getByRole('dialog')).getAllByRole('spinbutton')
    await u.type(fields[0], '4'); await u.type(fields[1], '4')
    await u.click(screen.getByRole('button', { name: 'Salva risultato' }))
    expect(screen.getByRole('button', { name: /Modifica risultato/ })).toBeInTheDocument()
    expectNoRemoteCalls()
    view.rerender(<TournamentsPage user={member} members={[member]} onBack={vi.fn()} />)
    expect(screen.queryByText('La mia prova')).not.toBeInTheDocument()
    expect(screen.getByText('Questa modalità è riservata a Jury.')).toBeInTheDocument()
    expectNoRemoteCalls()
  })
  it('recovers corrupted local rehearsal without removing demo or real data', async () => {
    localStorage.setItem(SIMULATION_STORAGE, '{broken')
    localStorage.setItem('bandeja-tournaments-v1', 'untouched')
    show(); const u = userEvent.setup()
    await u.click(screen.getByRole('button', { name: 'Prepara una nuova prova locale' }))
    expect(screen.getByText('10/10')).toBeInTheDocument()
    expect(localStorage.getItem('bandeja-tournaments-v1')).toBe('untouched')
    expectNoRemoteCalls()
  })
  it('handles a direct hash change to the private page without subscribing to a shared simulation document', () => {
    window.history.replaceState(null, '', '/#tornei'); show()
    vi.clearAllMocks()
    act(() => { window.history.replaceState(null, '', '/#tornei/simulazione'); fireEvent(window, new HashChangeEvent('hashchange')) })
    expect(screen.getByText('10/10')).toBeInTheDocument()
    expectNoRemoteCalls()
  })
})
