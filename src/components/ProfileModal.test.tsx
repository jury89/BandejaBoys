import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SessionUser } from '../types'
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

    expect(onSave).toHaveBeenCalledWith('Brescio', undefined)
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

    expect(screen.getByRole('alert')).toHaveTextContent('sei un asino')
    expect(onSave).not.toHaveBeenCalled()
  })
})
