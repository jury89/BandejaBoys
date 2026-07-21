import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider } from '../AuthContext'
import { App } from '../App'

describe('accesso locale', () => {
  beforeEach(() => localStorage.clear())

  it('permette di creare un account e apre la bacheca', async () => {
    const user = userEvent.setup()
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    )

    await user.click(await screen.findByRole('button', { name: 'Crea account' }))
    await user.type(screen.getByLabelText('Nome visibile'), 'Jury')
    await user.type(screen.getByLabelText('Email'), 'jury.rossi@example.test')
    await user.type(screen.getByLabelText('Password'), 'segreto123')
    await user.click(screen.getByRole('button', { name: /Crea il mio account/ }))

    expect(await screen.findByText(/Mettiamo in campo/)).toBeInTheDocument()
    expect(screen.getByText('Jury')).toBeInTheDocument()
    expect(screen.queryByText('jury.rossi')).not.toBeInTheDocument()
    expect(screen.getByText(/Demo locale/)).toBeInTheDocument()
  }, 15_000)

  it('aggiorna la bacheca dopo la modifica di data e ora di uno slot', async () => {
    const user = userEvent.setup()
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    )

    await user.click(await screen.findByRole('button', { name: 'Crea account' }))
    await user.type(screen.getByLabelText('Nome visibile'), 'Jury')
    await user.type(screen.getByLabelText('Email'), 'jury@example.test')
    await user.type(screen.getByLabelText('Password'), 'segreto123')
    await user.click(screen.getByRole('button', { name: /Crea il mio account/ }))

    const editButtons = await screen.findAllByRole('button', { name: 'Modifica data e ora dello slot' })
    fireEvent.click(editButtons[0])
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-08-15' } })
    fireEvent.change(screen.getByLabelText('Ora'), { target: { value: '18' } })
    fireEvent.change(screen.getByLabelText('Minuti'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva data e ora' }))

    expect(await screen.findByText('18:30')).toBeInTheDocument()
    expect(screen.getByText('Data e ora dello slot aggiornate.')).toBeInTheDocument()
  }, 15_000)

  it('filtra la bacheca tra tutti gli slot, quelli da prenotare e quelli prenotati', async () => {
    const user = userEvent.setup()
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    )

    await user.click(await screen.findByRole('button', { name: 'Crea account' }))
    await user.type(screen.getByLabelText('Nome visibile'), 'Jury')
    await user.type(screen.getByLabelText('Email'), 'jury@example.test')
    await user.type(screen.getByLabelText('Password'), 'segreto123')
    await user.click(screen.getByRole('button', { name: /Crea il mio account/ }))

    const allFilter = await screen.findByRole('button', { name: /^Tutti/ })
    const unbookedFilter = screen.getByRole('button', { name: /^Slot da prenotare/ })
    const bookedFilter = screen.getByRole('button', { name: /^Slot prenotati/ })
    expect(allFilter).toHaveAttribute('aria-pressed', 'true')

    await user.click(unbookedFilter)
    expect(unbookedFilter).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('heading', { name: 'Slot da prenotare' })).toBeInTheDocument()
    expect(screen.getByText('Padel · prossima settimana')).toBeInTheDocument()

    await user.click(bookedFilter)
    expect(bookedFilter).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByText('Nessuno slot prenotato.')).toBeInTheDocument()

    await user.click(allFilter)
    expect(await screen.findByText('Padel · prossima settimana')).toBeInTheDocument()
  }, 15_000)
})
