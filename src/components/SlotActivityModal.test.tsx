import { render, screen, within } from '@testing-library/react'
import type { PadelPoll, PadelSlot } from '../types'
import type { LocalActivityEvent } from '../lib/activity'
import { repository } from '../lib/repository'
import { SlotActivityModal } from './SlotActivityModal'

const slot: PadelSlot = {
  id: 'slot-1',
  startsAt: '2026-07-28T19:00',
  durationMinutes: 90,
  venue: '',
  signups: [],
}

const poll: PadelPoll = {
  id: 'poll-1',
  title: 'Padel · prossima settimana',
  targetWeekStart: '2026-07-27',
  createdBy: 'jury',
  createdByName: 'Jury',
  createdAt: 1,
  updatedAt: 1,
  status: 'open',
  slots: [slot],
}

describe('cronologia dello slot', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('mostra azione, autore e orario dal più recente', async () => {
    const latestTimestamp = Date.UTC(2026, 6, 25, 14, 30, 12)
    const activity: LocalActivityEvent[] = [
      {
        id: 'substitution',
        type: 'starter_substituted',
        actorId: 'tommy',
        actorName: 'Tommy',
        pollId: poll.id,
        pollTitle: poll.title,
        slotId: slot.id,
        slotStartsAt: slot.startsAt,
        occurredAt: latestTimestamp,
        details: {
          outgoingUserId: 'tommy',
          outgoingName: 'Tommy',
          replacementUserId: 'dade',
          replacementName: 'Dade',
        },
      },
      {
        id: 'rescheduled',
        type: 'slot_rescheduled',
        actorId: 'jury',
        actorName: 'Jury',
        pollId: poll.id,
        pollTitle: poll.title,
        slotId: slot.id,
        slotStartsAt: '2026-07-28T19:30',
        occurredAt: latestTimestamp - 60_000,
        details: { previousStartsAt: '2026-07-28T19:00' },
      },
    ]
    const getSlotActivity = vi.spyOn(repository, 'getSlotActivity').mockResolvedValue(activity)

    render(<SlotActivityModal poll={poll} slot={slot} onClose={vi.fn()} />)

    const timeline = await screen.findByRole('list', { name: 'Cronologia delle modifiche dello slot' })
    const items = within(timeline).getAllByRole('listitem')
    expect(getSlotActivity).toHaveBeenCalledWith(poll.id, slot.id)
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Sostituzione del titolare')).toBeInTheDocument()
    expect(within(items[0]).getByText('Dade ha preso il posto di Tommy.')).toBeInTheDocument()
    expect(within(items[0]).getByText('Tommy')).toBeInTheDocument()
    expect(items[0].querySelector('time')).toHaveTextContent('16:30:12')
    expect(items[0].querySelector('time')).toHaveAttribute(
      'datetime',
      new Date(latestTimestamp).toISOString(),
    )
    expect(within(items[1]).getByText('Data e ora aggiornate')).toBeInTheDocument()
    expect(within(items[1]).getByText(/Da Martedì 28 luglio alle 19:00 a Martedì 28 luglio alle 19:30/)).toBeInTheDocument()
  })

  it('spiega il limite storico quando lo slot non ha ancora eventi audit', async () => {
    vi.spyOn(repository, 'getSlotActivity').mockResolvedValue([])

    render(<SlotActivityModal poll={poll} slot={slot} onClose={vi.fn()} />)

    expect(await screen.findByText('Nessuna modifica registrata')).toBeInTheDocument()
    expect(screen.getByText(/precedenti all’introduzione della cronologia/)).toBeInTheDocument()
  })

  it('mostra nome e ruolo dell’ospite aggiunto dal membro', async () => {
    vi.spyOn(repository, 'getSlotActivity').mockResolvedValue([{
      id: 'guest-added',
      type: 'guest_added',
      actorId: 'jury',
      actorName: 'Jury',
      pollId: poll.id,
      pollTitle: poll.title,
      slotId: slot.id,
      slotStartsAt: slot.startsAt,
      occurredAt: Date.UTC(2026, 6, 25, 14, 30),
      details: {
        guestName: 'Ciccio',
        guestSignupId: 'signup-guest',
        role: 'reserve',
      },
    }])

    render(<SlotActivityModal poll={poll} slot={slot} onClose={vi.fn()} />)

    expect(await screen.findByText('Ospite aggiunto')).toBeInTheDocument()
    expect(screen.getByText('Ciccio è stato inserito come riserva.')).toBeInTheDocument()
    expect(screen.getByText('Jury')).toBeInTheDocument()
  })

  it('mostra una sostituzione storica ricostruita dal dato ancora presente nello slot', async () => {
    const substitutedAt = Date.UTC(2026, 6, 21, 13, 8, 19)
    const legacySlot: PadelSlot = {
      ...slot,
      signups: [{
        id: 'signup-dade',
        userId: 'dade',
        displayName: 'Dade',
        joinedAt: substitutedAt,
        substitutedFor: {
          userId: 'tommy',
          displayName: 'Tommy',
          at: substitutedAt,
        },
      }],
    }
    vi.spyOn(repository, 'getSlotActivity').mockResolvedValue([])

    render(<SlotActivityModal poll={poll} slot={legacySlot} onClose={vi.fn()} />)

    const timeline = await screen.findByRole('list', { name: 'Cronologia delle modifiche dello slot' })
    const item = within(timeline).getByRole('listitem')
    expect(within(item).getByText('Sostituzione del titolare')).toBeInTheDocument()
    expect(within(item).getByText('Dade ha preso il posto di Tommy.')).toBeInTheDocument()
    expect(within(item).getByText('Tommy')).toBeInTheDocument()
    expect(item.querySelector('time')).toHaveTextContent('21 lug 2026 · 15:08:19')
  })
})
