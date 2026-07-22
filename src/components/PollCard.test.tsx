import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MemberProfile, PadelPoll, SessionUser } from '../types'
import { PollCard } from './PollCard'

vi.mock('../lib/repository', () => ({ repository: {} }))

const user: SessionUser = {
  id: 'jury',
  displayName: 'Jury',
  email: 'jury@example.test',
  createdAt: 1,
}

const members: MemberProfile[] = [user]

const poll: PadelPoll = {
  id: 'poll-1',
  title: 'Titolo storico',
  targetWeekStart: '2099-01-05',
  createdBy: 'jury',
  createdByName: 'Jury',
  createdAt: 1,
  updatedAt: 1,
  status: 'open',
  slots: [{
    id: 'slot-1',
    startsAt: '2099-01-06T19:30',
    durationMinutes: 90,
    venue: '',
    signups: [],
  }],
}

describe('sondaggio collassabile', () => {
  it('nasconde e ripristina tutti gli slot lasciando visibile l’intestazione', async () => {
    const interaction = userEvent.setup()
    render(
      <PollCard
        poll={poll}
        user={user}
        members={members}
        onPollChange={vi.fn()}
        onNotify={vi.fn()}
        onError={vi.fn()}
      />,
    )

    const collapse = screen.getByRole('button', { name: 'Nascondi gli slot di Padel · 5 gen – 11 gen 2099' })
    expect(collapse).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('region', { name: 'Slot di Padel · 5 gen – 11 gen 2099' })).toBeInTheDocument()

    await interaction.click(collapse)

    const expand = screen.getByRole('button', { name: 'Mostra gli slot di Padel · 5 gen – 11 gen 2099' })
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: 'Slot di Padel · 5 gen – 11 gen 2099' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Padel · 5 gen – 11 gen 2099' })).toBeInTheDocument()

    await interaction.click(expand)

    expect(screen.getByRole('region', { name: 'Slot di Padel · 5 gen – 11 gen 2099' })).toBeInTheDocument()
  })
})
