import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AdminSlotRosterModal } from './AdminSlotRosterModal'
import type { MemberProfile, PadelSlot } from '../types'

const members: MemberProfile[] = [
  { id: 'jury', displayName: 'Jury', email: 'jury@example.test', createdAt: 1 },
  { id: 'alex', displayName: 'Alex', email: 'alex@example.test', createdAt: 2 },
  { id: 'luigi', displayName: 'Luigi', email: 'luigi@example.test', createdAt: 3 },
  { id: 'brescio', displayName: 'brescio', email: 'brescio@example.test', createdAt: 4 },
  { id: 'dade', displayName: 'Dade', email: 'dade@example.test', createdAt: 5 },
  { id: 'marcos', displayName: 'MarcoS', email: 'marcos@example.test', createdAt: 6 },
]

const fullSlot: PadelSlot = {
  id: 'slot-1',
  startsAt: '2026-08-26T19:00',
  durationMinutes: 90,
  venue: '',
  signups: [
    { id: 'signup-jury', userId: 'jury', displayName: 'Jury', joinedAt: 1, role: 'starter' },
    { id: 'signup-alex', userId: 'alex', displayName: 'Alex', joinedAt: 2, role: 'starter' },
    { id: 'signup-luigi', userId: 'luigi', displayName: 'Luigi', joinedAt: 3, role: 'starter' },
    { id: 'signup-brescio', userId: 'brescio', displayName: 'brescio', joinedAt: 4, role: 'starter' },
    { id: 'signup-dade', userId: 'dade', displayName: 'Dade', joinedAt: 5, role: 'reserve' },
  ],
}

describe('gestione amministrativa dei giocatori', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('permette di spostare un titolare in riserva e blocca una quinta promozione', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined)

    render(
      <AdminSlotRosterModal
        slot={fullSlot}
        members={members}
        onClose={vi.fn()}
        onApply={onApply}
        onDone={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Promuovi titolare' })).toBeDisabled()
    fireEvent.click(screen.getAllByRole('button', { name: 'Passa a riserva' })[0])

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith({
        kind: 'set-role',
        signupId: 'signup-jury',
        role: 'reserve',
      })
    })
  })

  it('aggiunge un membro registrato direttamente nel ruolo scelto', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined)

    render(
      <AdminSlotRosterModal
        slot={{ ...fullSlot, signups: fullSlot.signups.slice(0, 2) }}
        members={members}
        onClose={vi.fn()}
        onApply={onApply}
        onDone={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Giocatore'), { target: { value: 'marcos' } })
    fireEvent.change(screen.getByLabelText('Ruolo'), { target: { value: 'reserve' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi giocatore' }))

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith({
        kind: 'add',
        member: { id: 'marcos', displayName: 'MarcoS' },
        role: 'reserve',
      })
    })
  })

  it('rimuove un giocatore dopo conferma', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(
      <AdminSlotRosterModal
        slot={fullSlot}
        members={members}
        onClose={vi.fn()}
        onApply={onApply}
        onDone={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi Dade dallo slot' }))

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith({ kind: 'remove', signupId: 'signup-dade' })
    })
  })
})
