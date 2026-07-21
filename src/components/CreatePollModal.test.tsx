import { fireEvent, render, screen } from '@testing-library/react'
import { CreatePollModal } from './CreatePollModal'
import type { SessionUser } from '../types'

const user: SessionUser = {
  id: 'jury',
  displayName: 'Jury',
  email: 'jury@example.test',
  createdAt: 1,
}

describe('editor degli slot', () => {
  it('mantiene il focus sul campo data e ora dopo una modifica', () => {
    render(
      <CreatePollModal
        user={user}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onDone={vi.fn()}
      />,
    )

    const originalInput = screen.getAllByLabelText('Data e ora')[0]
    expect(originalInput).toHaveAttribute('step', '1800')
    originalInput.focus()

    fireEvent.change(originalInput, { target: { value: '2026-07-28T19:00' } })

    expect(screen.getAllByLabelText('Data e ora')[0]).toBe(originalInput)
    expect(originalInput).toHaveFocus()
  })

  it('duplica uno slot al giorno successivo mantenendo ora, durata e indicazione provvisoria', () => {
    render(
      <CreatePollModal
        user={user}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onDone={vi.fn()}
      />,
    )

    fireEvent.change(screen.getAllByLabelText('Data e ora')[0], {
      target: { value: '2026-07-28T19:00' },
    })
    fireEvent.change(screen.getAllByLabelText('Durata')[0], { target: { value: '120' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Orario indicativo per slot 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Duplica slot 1 al giorno successivo' }))

    expect(screen.getAllByLabelText('Data e ora')).toHaveLength(3)
    expect(screen.getAllByLabelText('Data e ora')[1]).toHaveValue('2026-07-29T19:00')
    expect(screen.getAllByLabelText('Durata')[1]).toHaveValue('120')
    expect(screen.getByRole('checkbox', { name: 'Orario indicativo per slot 2' })).toBeChecked()
  })
})
