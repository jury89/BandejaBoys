import {
  buildGoogleCalendarUrl,
  buildOutlookCalendarUrl,
  buildSlotCalendar,
  slotCalendarFileName,
} from './calendar'
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
    expect(calendar).toContain('SUMMARY:Padel\\, amici\\; prossima settimana')
    expect(calendar).toContain('LOCATION:Oasi Boschetto')
    expect(calendar).toContain('STATUS:TENTATIVE')
    expect(calendar).toMatch(/^BEGIN:VCALENDAR\r\n/)
    expect(calendar).toMatch(/END:VCALENDAR\r\n$/)
  })

  it('marca come confermato il calendario di un campo prenotato', () => {
    const calendar = buildSlotCalendar(poll, setSlotBooking(slot, user, 20), 1)

    expect(calendar).toContain('STATUS:CONFIRMED')
    expect(calendar).toContain('DESCRIPTION:Campo prenotato.')
  })

  it('genera un nome file leggibile e stabile', () => {
    expect(slotCalendarFileName(slot)).toBe('padel-2026-07-28-1900.ics')
  })

  it('prepara Google Calendar con fuso di Roma e campi modificabili', () => {
    const url = new URL(buildGoogleCalendarUrl(poll, slot))

    expect(url.origin).toBe('https://calendar.google.com')
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
    expect(url.searchParams.get('text')).toBe('Padel, amici; prossima settimana')
    expect(url.searchParams.get('dates')).toBe('20260728T190000/20260728T203000')
    expect(url.searchParams.get('ctz')).toBe('Europe/Rome')
    expect(url.searchParams.get('location')).toBe('Oasi Boschetto')
  })

  it('prepara Outlook con data, durata e dettagli dello slot', () => {
    const url = new URL(buildOutlookCalendarUrl(poll, slot))

    expect(url.origin).toBe('https://outlook.office.com')
    expect(url.searchParams.get('rru')).toBe('addevent')
    expect(url.searchParams.get('subject')).toBe('Padel, amici; prossima settimana')
    expect(url.searchParams.get('startdt')).toBe('2026-07-28T19:00:00')
    expect(url.searchParams.get('enddt')).toBe('2026-07-28T20:30:00')
    expect(url.searchParams.get('location')).toBe('Oasi Boschetto')
  })
})
