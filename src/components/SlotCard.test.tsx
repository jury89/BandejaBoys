import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SlotCard } from './SlotCard'
import type { PadelPoll, PadelSlot, SessionUser } from '../types'
import { DEFAULT_VENUE, setSlotBooking } from '../lib/domain'
import { repository } from '../lib/repository'

const user: SessionUser = {
  id: 'jury',
  displayName: 'Jury',
  email: 'jury@example.test',
  createdAt: 1,
}

const slot: PadelSlot = {
  id: 'slot-1',
  startsAt: '2026-07-28T19:00',
  durationMinutes: 90,
  venue: '',
  signups: [{ id: 'signup-1', userId: user.id, displayName: user.displayName, joinedAt: 1 }],
}

const poll: PadelPoll = {
  id: 'poll-1',
  title: 'Prossima settimana',
  targetWeekStart: '2026-07-27',
  createdBy: user.id,
  createdByName: user.displayName,
  createdAt: 1,
  updatedAt: 1,
  status: 'open',
  slots: [slot],
}

describe('azioni dello slot', () => {
  afterEach(() => vi.restoreAllMocks())

  it('spiega in modo accessibile cosa fa Passo il posto', () => {
    render(
      <SlotCard
        poll={poll}
        slot={slot}
        user={user}
        members={[user]}
        onPollChange={vi.fn()}
        onNotify={vi.fn()}
        onError={vi.fn()}
      />,
    )

    const action = screen.getByRole('button', { name: 'Passo il posto' })
    const help = screen.getByRole('button', { name: 'Come funziona Passo il posto' })
    const tooltip = screen.getByRole('tooltip')

    expect(action).toHaveAttribute('aria-describedby', tooltip.id)
    expect(help).toHaveAttribute('aria-describedby', tooltip.id)
    expect(tooltip).toHaveTextContent('prenderà la tua posizione e tu uscirai dallo slot')
    expect(tooltip).toHaveTextContent('Se era in riserva')
  })

  it('prenota con un tocco all’Oasi Boschetto anche con meno di quattro giocatori', async () => {
    const updatedPoll: PadelPoll = { ...poll, slots: [setSlotBooking(slot, user, 20)] }
    const setBooking = vi.spyOn(repository, 'setBooking').mockResolvedValue(updatedPoll)
    const onPollChange = vi.fn()
    const onNotify = vi.fn()
    render(
      <SlotCard
        poll={poll}
        slot={slot}
        user={user}
        members={[user]}
        onPollChange={onPollChange}
        onNotify={onNotify}
        onError={vi.fn()}
      />,
    )

    expect(slot.signups).toHaveLength(1)
    expect(screen.getByText(DEFAULT_VENUE)).toBeInTheDocument()
    expect(screen.getByText('Segna come prenotato')).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Segna il campo come prenotato all’Oasi Boschetto' }),
    )

    await waitFor(() => expect(setBooking).toHaveBeenCalledWith(poll.id, slot.id, { bookedBy: user }))
    expect(onPollChange).toHaveBeenCalledWith(updatedPoll)
    expect(onNotify).toHaveBeenCalledWith('Campo prenotato all’Oasi Boschetto. Si gioca!')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('modifica data e ora di uno slot esistente', async () => {
    const reschedule = vi.spyOn(repository, 'rescheduleSlot').mockResolvedValue(poll)
    const onNotify = vi.fn()
    render(
      <SlotCard
        poll={poll}
        slot={slot}
        user={user}
        members={[user]}
        onPollChange={vi.fn()}
        onNotify={onNotify}
        onError={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Modifica data e ora dello slot' }))
    fireEvent.change(screen.getByLabelText('Nuova data e ora'), {
      target: { value: '2026-07-29T20:30' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salva data e ora' }))

    await waitFor(() => expect(reschedule).toHaveBeenCalledWith(poll.id, slot.id, '2026-07-29T20:30'))
    expect(onNotify).toHaveBeenCalledWith('Data e ora dello slot aggiornate.')
  })

  it('aggiorna subito nome e pulsante dopo Ci sono senza attendere il listener realtime', async () => {
    const emptySlot = { ...slot, signups: [] }
    const initialPoll: PadelPoll = { ...poll, slots: [emptySlot] }
    const updatedPoll: PadelPoll = { ...poll, slots: [slot] }
    vi.spyOn(repository, 'joinSlot').mockResolvedValue(updatedPoll)

    function Harness() {
      const [current, setCurrent] = useState(initialPoll)
      return (
        <SlotCard
          poll={current}
          slot={current.slots[0]}
          user={user}
          members={[user]}
          onPollChange={setCurrent}
          onNotify={vi.fn()}
          onError={vi.fn()}
        />
      )
    }

    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Ci sono' }))

    expect(await screen.findByRole('button', { name: 'Ritirati' })).toBeInTheDocument()
    expect(screen.getByText('Jury')).toBeInTheDocument()
  })
})
