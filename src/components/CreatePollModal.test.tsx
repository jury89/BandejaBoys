import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CreatePollModal } from './CreatePollModal'
import type { SessionUser } from '../types'

const user: SessionUser = {
  id: 'jury',
  displayName: 'Jury',
  email: 'jury@example.test',
  createdAt: 1,
}

describe('editor degli slot', () => {
  it('non richiede un nome e crea il sondaggio dalla settimana scelta', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(
      <CreatePollModal
        user={user}
        onClose={vi.fn()}
        onCreate={onCreate}
        onDone={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText('Nome del sondaggio')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Settimana di gioco (lun–dom)'), {
      target: { value: '2026-08-05' },
    })
    expect(screen.getByLabelText('Settimana di gioco (lun–dom)')).toHaveValue('2026-08-03')
    expect(screen.getAllByLabelText('Data')[0]).toHaveValue('2026-08-04')
    expect(screen.getAllByLabelText('Data')[1]).toHaveValue('2026-08-06')
    fireEvent.click(screen.getByRole('button', { name: 'Pubblica sondaggio' }))

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ targetWeekStart: '2026-08-03' }),
      user,
    ))
    expect(onCreate.mock.calls[0][0]).not.toHaveProperty('title')
  })

  it('mantiene il focus sul selettore dei minuti dopo una modifica', () => {
    render(
      <CreatePollModal
        user={user}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onDone={vi.fn()}
      />,
    )

    const originalInput = screen.getAllByLabelText('Minuti')[0]
    originalInput.focus()

    fireEvent.change(originalInput, { target: { value: '00' } })

    expect(screen.getAllByLabelText('Minuti')[0]).toBe(originalInput)
    expect(originalInput).toHaveFocus()
  })

  it('duplica uno slot al giorno successivo mantenendo ora e durata', () => {
    render(
      <CreatePollModal
        user={user}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onDone={vi.fn()}
      />,
    )

    fireEvent.change(screen.getAllByLabelText('Data')[0], { target: { value: '2026-07-28' } })
    fireEvent.change(screen.getAllByLabelText('Ora')[0], { target: { value: '19' } })
    fireEvent.change(screen.getAllByLabelText('Minuti')[0], { target: { value: '00' } })
    fireEvent.change(screen.getAllByLabelText('Durata')[0], { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: 'Duplica slot 1 al giorno successivo' }))

    expect(screen.getAllByLabelText('Data')).toHaveLength(3)
    expect(screen.getAllByLabelText('Data')[1]).toHaveValue('2026-07-29')
    expect(screen.getAllByLabelText('Ora')[1]).toHaveValue('19')
    expect(screen.getAllByLabelText('Minuti')[1]).toHaveValue('00')
    expect(screen.getAllByLabelText('Durata')[1]).toHaveValue('120')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
