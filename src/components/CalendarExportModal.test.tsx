import { fireEvent, render, screen } from '@testing-library/react'
import type { PadelPoll, PadelSlot } from '../types'
import { CalendarExportModal } from './CalendarExportModal'

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

describe('selettore del calendario', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('esporta Apple Calendar come file iCalendar', () => {
    vi.useFakeTimers()
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:padel-calendar')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const onClose = vi.fn()
    const onDone = vi.fn()

    render(
      <CalendarExportModal poll={poll} slot={slot} onClose={onClose} onDone={onDone} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Apple Calendar/ }))

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(click).toHaveBeenCalledOnce()
    expect(onDone).toHaveBeenCalledWith('Evento pronto per Apple Calendar.')
    expect(onClose).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(1_000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:padel-calendar')
  })

  it.each([
    ['Google Calendar', 'https://calendar.google.com/', 'Google Calendar aperto con i dati della partita.'],
    ['Outlook', 'https://outlook.office.com/', 'Outlook aperto con i dati della partita.'],
  ])('apre %s con i dati precompilati', (provider, origin, message) => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const onClose = vi.fn()
    const onDone = vi.fn()

    render(
      <CalendarExportModal poll={poll} slot={slot} onClose={onClose} onDone={onDone} />,
    )

    fireEvent.click(screen.getByRole('button', { name: new RegExp(provider) }))

    expect(open).toHaveBeenCalledWith(expect.stringMatching(origin), '_blank', 'noopener,noreferrer')
    expect(onDone).toHaveBeenCalledWith(message)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
