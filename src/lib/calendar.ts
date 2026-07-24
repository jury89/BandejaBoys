import {
  DEFAULT_VENUE,
  getSlotPhase,
  padelDateTimeToTimestamp,
  toDateTimeInput,
} from './domain'
import type { PadelPoll, PadelSlot } from '../types'
import { pollWeekTitle } from './format'

const CALENDAR_TIME_ZONE = 'Europe/Rome'
const APP_URL = 'https://bandeja-boys.web.app'
const CALENDAR_TIME_ZONE_COMPONENT = [
  'BEGIN:VTIMEZONE',
  `TZID:${CALENDAR_TIME_ZONE}`,
  `X-LIC-LOCATION:${CALENDAR_TIME_ZONE}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
] as const

function normalizeLocalDateTime(value: string) {
  return `${toDateTimeInput(new Date(padelDateTimeToTimestamp(value)))}:00`
}

function addMinutesToLocalDateTime(value: string, minutes: number) {
  const timestamp = padelDateTimeToTimestamp(value) + minutes * 60 * 1000
  return `${toDateTimeInput(new Date(timestamp))}:00`
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
  return pollWeekTitle(poll.targetWeekStart)
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
    `X-WR-TIMEZONE:${CALENDAR_TIME_ZONE}`,
    ...CALENDAR_TIME_ZONE_COMPONENT,
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

export function slotCalendarFileName(slot: PadelSlot) {
  const localDateTime = normalizeLocalDateTime(slot.startsAt)
  return `padel-${localDateTime.slice(0, 16).replace('T', '-').replace(':', '')}.ics`
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
