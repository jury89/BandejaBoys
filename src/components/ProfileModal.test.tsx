import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SessionUser } from '../types'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../lib/notificationPreferences'
import { ProfileModal } from './ProfileModal'

const player: SessionUser = {
  id: 'jury',
  displayName: 'Jury',
  email: 'jury@example.test',
  createdAt: 1,
}

describe('profilo giocatore', () => {
  it('permette di cambiare soltanto il nome', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<ProfileModal user={player} onClose={vi.fn()} onSave={onSave} onDone={vi.fn()} />)

    const name = screen.getByLabelText('Nome visibile')
    await user.clear(name)
    await user.type(name, 'Brescio')
    await user.click(screen.getByRole('button', { name: 'Salva profilo' }))

    expect(onSave).toHaveBeenCalledWith(
      'Brescio',
      undefined,
      DEFAULT_NOTIFICATION_PREFERENCES,
      undefined,
    )
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /Email/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email non modificabile')).toHaveTextContent(player.email)
  })

  it('rifiuta un nuovo nome che contiene Evi', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<ProfileModal user={player} onClose={vi.fn()} onSave={onSave} onDone={vi.fn()} />)

    const name = screen.getByLabelText('Nome visibile')
    await user.clear(name)
    await user.type(name, 'SuperEviNinja')
    await user.click(screen.getByRole('button', { name: 'Salva profilo' }))

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('sei un asino')
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAttribute('aria-describedby', 'profile-name-feedback')
    expect(name.nextElementSibling).toBe(alert)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('salva una scelta indipendente per ogni tipo di notifica', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<ProfileModal user={player} onClose={vi.fn()} onSave={onSave} onDone={vi.fn()} />)

    const monday = screen.getByRole('switch', { name: 'Ricevi Sveglia del lunedì' })
    const twoHours = screen.getByRole('switch', { name: 'Ricevi Partita tra 2 ore' })
    expect(monday).toBeChecked()
    expect(twoHours).toBeChecked()

    await user.click(monday)
    await user.click(twoHours)
    await user.click(screen.getByRole('button', { name: 'Salva profilo' }))

    expect(onSave).toHaveBeenCalledWith('Jury', undefined, {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      mondayMotivation: false,
      reminder2h: false,
    }, undefined)
  })

  it('salva giorno e fascia del posto fisso', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<ProfileModal user={player} onClose={vi.fn()} onSave={onSave} onDone={vi.fn()} />)

    await user.click(screen.getByRole('switch', { name: 'Attiva posto fisso' }))
    await user.selectOptions(screen.getByLabelText('Giorno del posto fisso'), '3')
    await user.selectOptions(screen.getByLabelText('Inizio fascia posto fisso'), String(18 * 60 + 30))
    await user.selectOptions(screen.getByLabelText('Fine fascia posto fisso'), String(20 * 60 + 30))
    await user.click(screen.getByRole('button', { name: 'Salva profilo' }))

    expect(onSave).toHaveBeenCalledWith(
      'Jury',
      undefined,
      DEFAULT_NOTIFICATION_PREFERENCES,
      { weekday: 3, startMinutes: 18 * 60 + 30, endMinutes: 20 * 60 + 30 },
    )
  })

  it('segnala le fasce che si sovrappongono a tre posti fissi esistenti', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    const members = [
      player,
      ...['uno', 'due', 'tre'].map((id, index) => ({
        id,
        displayName: id,
        email: `${id}@example.test`,
        createdAt: index + 2,
        fixedSeatPreference: { weekday: 2 as const, startMinutes: 18 * 60 + 30, endMinutes: 19 * 60 + 30 },
      })),
    ]
    render(
      <ProfileModal
        user={player}
        members={members}
        onClose={vi.fn()}
        onSave={onSave}
        onDone={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('switch', { name: 'Attiva posto fisso' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Fascia già completa')
    await user.click(screen.getByRole('button', { name: 'Salva profilo' }))

    expect(screen.getByText(/Questa fascia ha già tre posti fissi/)).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })
})
