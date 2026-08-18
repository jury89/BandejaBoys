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
  it('crea gli slot dalle singole date senza richiedere nome o settimana', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(
      <CreatePollModal
        user={user}
        existingSlots={[]}
        onClose={vi.fn()}
        onCreate={onCreate}
        onDone={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText('Nome del sondaggio')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Settimana di gioco (lun–dom)')).not.toBeInTheDocument()
    fireEvent.change(screen.getAllByLabelText('Data')[0], { target: { value: '2026-08-25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Pubblica slot' }))

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      slots: expect.arrayContaining([
        expect.objectContaining({ startsAt: expect.stringContaining('2026-08-25T') }),
      ]),
    }), user))
    expect(onCreate.mock.calls[0][0]).not.toHaveProperty('title')
    expect(onCreate.mock.calls[0][0]).not.toHaveProperty('targetWeekStart')
  })

  it('mantiene il focus sul selettore dei minuti dopo una modifica', () => {
    render(
      <CreatePollModal
        user={user}
        existingSlots={[]}
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
        existingSlots={[]}
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

  it('avvisa ogni slot già esistente senza impedirne la pubblicazione', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(
      <CreatePollModal
        user={user}
        existingSlots={[
          { startsAt: '2026-07-28T17:00:00.000Z' },
          { startsAt: '2026-07-30T18:30:00.000Z' },
        ]}
        onClose={vi.fn()}
        onCreate={onCreate}
        onDone={vi.fn()}
      />,
    )

    fireEvent.change(screen.getAllByLabelText('Data')[0], { target: { value: '2026-07-28' } })
    fireEvent.change(screen.getAllByLabelText('Ora')[0], { target: { value: '19' } })
    fireEvent.change(screen.getAllByLabelText('Minuti')[0], { target: { value: '00' } })
    fireEvent.change(screen.getAllByLabelText('Data')[1], { target: { value: '2026-07-30' } })
    fireEvent.change(screen.getAllByLabelText('Ora')[1], { target: { value: '20' } })
    fireEvent.change(screen.getAllByLabelText('Minuti')[1], { target: { value: '30' } })

    expect(screen.getAllByRole('status')).toHaveLength(2)
    expect(screen.getAllByText(/Esiste già uno slot con questa data e ora/)).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Pubblica slot' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
  })
})
