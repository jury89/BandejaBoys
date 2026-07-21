import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PadelPoll } from '../types'
import { AddSlotModal } from './AddSlotModal'

const latestStartsAt = new Date(2026, 6, 28, 18, 30).toISOString()
const poll: PadelPoll = {
  id: 'poll-1',
  title: 'Padel · prossima settimana',
  targetWeekStart: '2026-07-27',
  createdBy: 'jury',
  createdByName: 'Jury',
  createdAt: 1,
  updatedAt: 1,
  status: 'open',
  slots: [{
    id: 'slot-1',
    startsAt: latestStartsAt,
    durationMinutes: 120,
    venue: '',
    signups: [],
  }],
}

describe('aggiunta di uno slot', () => {
  it('propone il giorno successivo con la stessa ora e durata', () => {
    render(<AddSlotModal poll={poll} onClose={vi.fn()} onSave={vi.fn()} onDone={vi.fn()} />)

    expect(screen.getByLabelText('Data e ora')).toHaveValue('2026-07-29T18:30')
    expect(screen.getByLabelText('Data e ora')).toHaveAttribute('step', '1800')
    expect(screen.getByLabelText('Durata')).toHaveValue('120')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('salva il nuovo slot e spiega che la notifica sarà raggruppata', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onDone = vi.fn()
    render(<AddSlotModal poll={poll} onClose={vi.fn()} onSave={onSave} onDone={onDone} />)

    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi slot' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      startsAt: '2026-07-29T18:30',
      durationMinutes: 120,
    }))
    expect(onDone).toHaveBeenCalledWith(
      'Slot aggiunto. Gli altri riceveranno un unico avviso raggruppato.',
    )
  })

})
