import { DEFAULT_VENUE, getSlotPhase } from './domain'
import type { PadelPoll, PadelSlot } from '../types'

const CALENDAR_TIME_ZONE = 'Europe/Rome'
const APP_URL = 'https://bandeja-boys.web.app'

function normalizeLocalDateTime(value: string) {
  return `${value.slice(0, 16)}:00`
}

function addMinutesToLocalDateTime(value: string, minutes: number) {
  const date = new Date(`${normalizeLocalDateTime(value)}Z`)
  date.setUTCMinutes(date.getUTCMinutes() + minutes)
  return date.toISOString().slice(0, 19)
}

function formatLocalCalendarDate(value: string) {
  return value.replace(/[-:]/g, '')
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

function calendarTitle(poll: PadelPoll) {
  const title = poll.title.trim()
  return /^padel\b/i.test(title) ? title : `Padel · ${title}`
}

function calendarDescription(slot: PadelSlot) {
  return getSlotPhase(slot) === 'booked'
    ? 'Campo prenotato. Ritrovo per la partita di padel dei Bandeja Boys.'
    : 'Orario indicativo: verrà confermato quando il campo sarà prenotato.'
}

function calendarEventData(poll: PadelPoll, slot: PadelSlot) {
  return {
    title: calendarTitle(poll),
    description: calendarDescription(slot),
    startsAt: normalizeLocalDateTime(slot.startsAt),
    endsAt: addMinutesToLocalDateTime(slot.startsAt, slot.durationMinutes),
  }
}

export function buildSlotCalendar(poll: PadelPoll, slot: PadelSlot, now = Date.now()) {
  const event = calendarEventData(poll, slot)
  const confirmed = getSlotPhase(slot) === 'booked'

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'PRODID:-//Bandeja Boys//Padel planner//IT',
    'BEGIN:VEVENT',
    `UID:${escapeCalendarText(`${poll.id}-${slot.id}@bandeja-boys.web.app`)}`,
    `DTSTAMP:${formatUtcCalendarDate(now)}`,
    `DTSTART;TZID=${CALENDAR_TIME_ZONE}:${formatLocalCalendarDate(event.startsAt)}`,
    `DTEND;TZID=${CALENDAR_TIME_ZONE}:${formatLocalCalendarDate(event.endsAt)}`,
    `SUMMARY:${escapeCalendarText(event.title)}`,
    `LOCATION:${escapeCalendarText(DEFAULT_VENUE)}`,
    `DESCRIPTION:${escapeCalendarText(event.description)}`,
    `STATUS:${confirmed ? 'CONFIRMED' : 'TENTATIVE'}`,
    `URL:${APP_URL}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

export function buildGoogleCalendarUrl(poll: PadelPoll, slot: PadelSlot) {
  const event = calendarEventData(poll, slot)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatLocalCalendarDate(event.startsAt)}/${formatLocalCalendarDate(event.endsAt)}`,
    details: `${event.description}\n\n${APP_URL}`,
    location: DEFAULT_VENUE,
    ctz: CALENDAR_TIME_ZONE,
  })

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function buildOutlookCalendarUrl(poll: PadelPoll, slot: PadelSlot) {
  const event = calendarEventData(poll, slot)
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: event.startsAt,
    enddt: event.endsAt,
    body: `${event.description}\n\n${APP_URL}`,
    location: DEFAULT_VENUE,
  })

  return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`
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
