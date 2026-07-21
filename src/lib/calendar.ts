import { DEFAULT_VENUE, getSlotPhase } from './domain'
import type { PadelPoll, PadelSlot } from '../types'

const CALENDAR_TIME_ZONE = 'Europe/Rome'

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function formatLocalCalendarDate(date: Date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    pad(date.getMinutes()),
    '00',
  ].join('')
}

function formatUtcCalendarDate(timestamp: number) {
  return new Date(timestamp).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function escapeCalendarText(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

export function buildSlotCalendar(poll: PadelPoll, slot: PadelSlot, now = Date.now()) {
  const startsAt = new Date(slot.startsAt)
  const endsAt = new Date(startsAt)
  endsAt.setMinutes(endsAt.getMinutes() + slot.durationMinutes)
  const confirmed = getSlotPhase(slot) === 'booked'
  const description = confirmed
    ? 'Campo prenotato. Ritrovo per la partita di padel dei Bandeja Boys.'
    : 'Orario indicativo: verrà confermato quando il campo sarà prenotato.'

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'PRODID:-//Bandeja Boys//Padel planner//IT',
    'BEGIN:VEVENT',
    `UID:${escapeCalendarText(`${poll.id}-${slot.id}@bandeja-boys.web.app`)}`,
    `DTSTAMP:${formatUtcCalendarDate(now)}`,
    `DTSTART;TZID=${CALENDAR_TIME_ZONE}:${formatLocalCalendarDate(startsAt)}`,
    `DTEND;TZID=${CALENDAR_TIME_ZONE}:${formatLocalCalendarDate(endsAt)}`,
    `SUMMARY:${escapeCalendarText(`Padel · ${poll.title}`)}`,
    `LOCATION:${escapeCalendarText(DEFAULT_VENUE)}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    `STATUS:${confirmed ? 'CONFIRMED' : 'TENTATIVE'}`,
    'URL:https://bandeja-boys.web.app',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

export function slotCalendarFileName(slot: PadelSlot) {
  return `padel-${slot.startsAt.slice(0, 16).replace('T', '-').replace(':', '')}.ics`
}

export function downloadSlotCalendar(poll: PadelPoll, slot: PadelSlot) {
  const calendar = buildSlotCalendar(poll, slot)
  const file = new Blob([calendar], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')

  link.href = url
  link.download = slotCalendarFileName(slot)
  link.target = '_blank'
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
