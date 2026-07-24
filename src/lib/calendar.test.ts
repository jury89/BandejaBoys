import { buildSlotCalendar, slotCalendarFileName } from './calendar'
import { setSlotBooking } from './domain'
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
  signups: [],
}

const poll: PadelPoll = {
  id: 'poll-1',
  title: 'Padel, amici; prossima settimana',
  targetWeekStart: '2026-07-27',
  createdBy: user.id,
  createdByName: user.displayName,
  createdAt: 1,
  updatedAt: 1,
  status: 'open',
  slots: [slot],
}

describe('file calendario dello slot', () => {
  it('crea un evento indicativo con ora locale, durata e circolo', () => {
    const calendar = buildSlotCalendar(poll, slot, Date.UTC(2026, 6, 21, 12, 0))

    expect(calendar).toContain('DTSTAMP:20260721T120000Z')
    expect(calendar).toContain('DTSTART;TZID=Europe/Rome:20260728T190000')
    expect(calendar).toContain('DTEND;TZID=Europe/Rome:20260728T203000')
    expect(calendar).toContain('SUMMARY:Padel · 27 lug – 2 ago 2026')
    expect(calendar).toContain('LOCATION:Oasi Boschetto')
    expect(calendar).toContain('STATUS:TENTATIVE')
    expect(calendar).toMatch(/^BEGIN:VCALENDAR\r\n/)
    expect(calendar).toMatch(/END:VCALENDAR\r\n$/)
  })

  it('definisce Europe/Rome e mantiene le 09:00 come ora locale', () => {
    const morningSlot = { ...slot, startsAt: '2026-07-28T09:00' }
    const calendar = buildSlotCalendar(poll, morningSlot, Date.UTC(2026, 6, 21, 12, 0))

    expect(calendar).toContain('X-WR-TIMEZONE:Europe/Rome')
    expect(calendar).toContain('BEGIN:VTIMEZONE\r\nTZID:Europe/Rome')
    expect(calendar).toContain('BEGIN:DAYLIGHT\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0200')
    expect(calendar).toContain('BEGIN:STANDARD\r\nTZOFFSETFROM:+0200\r\nTZOFFSETTO:+0100')
    expect(calendar).toContain('DTSTART;TZID=Europe/Rome:20260728T090000')
    expect(calendar).toContain('DTEND;TZID=Europe/Rome:20260728T103000')
  })

  it('converte in ora di Roma gli istanti salvati in UTC', () => {
    const utcSlot = { ...slot, startsAt: '2026-07-28T17:00:00.000Z' }
    const calendar = buildSlotCalendar(poll, utcSlot, Date.UTC(2026, 6, 21, 12, 0))

    expect(calendar).toContain('DTSTART;TZID=Europe/Rome:20260728T190000')
    expect(calendar).toContain('DTEND;TZID=Europe/Rome:20260728T203000')
    expect(slotCalendarFileName(utcSlot)).toBe('padel-2026-07-28-1900.ics')
  })

  it('marca come confermato il calendario di un campo prenotato', () => {
    const calendar = buildSlotCalendar(poll, setSlotBooking(slot, user, 20), 1)

    expect(calendar).toContain('STATUS:CONFIRMED')
    expect(calendar).toContain('DESCRIPTION:Campo prenotato.')
  })

  it('genera un nome file leggibile e stabile', () => {
    expect(slotCalendarFileName(slot)).toBe('padel-2026-07-28-1900.ics')
  })

})
