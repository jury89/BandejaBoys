import { render, screen } from '@testing-library/react'
import { SlotCard } from './SlotCard'
import type { PadelPoll, PadelSlot, SessionUser } from '../types'

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
  it('spiega in modo accessibile cosa fa Passo il posto', () => {
    render(
      <SlotCard
        poll={poll}
        slot={slot}
        user={user}
        members={[user]}
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
})
