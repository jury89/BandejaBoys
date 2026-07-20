import { render, screen } from '@testing-library/react'
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
    await user.type(screen.getByLabelText('Email'), 'jury@example.test')
    await user.type(screen.getByLabelText('Password'), 'segreto123')
    await user.click(screen.getByRole('button', { name: /Crea il mio account/ }))

    expect(await screen.findByText(/Mettiamo in campo/)).toBeInTheDocument()
    expect(screen.getByText('Jury')).toBeInTheDocument()
    expect(screen.getByText(/Demo locale/)).toBeInTheDocument()
  })
})

