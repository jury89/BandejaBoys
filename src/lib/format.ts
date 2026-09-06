export const PADEL_TIME_ZONE = 'Europe/Rome'

export function relationshipPerformanceLabel({
  gameDifference,
  setWins,
  setsPlayed,
  winRate,
}: {
  gameDifference: number
  setWins: number
  setsPlayed: number
  winRate: number
}): string {
  const setResult = `${setWins} ${setWins === 1 ? 'set vinto' : 'set vinti'} su ${setsPlayed}`
  const gameCount = Math.abs(gameDifference)
  const gameResult = gameDifference === 0
    ? 'stesso numero di game degli avversari'
    : `${gameCount} game ${gameCount === 1 ? 'fatto' : 'fatti'} ${gameDifference > 0 ? 'in più' : 'in meno'} degli avversari`
  const percentage = `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(winRate)}%`
  return `${setResult} (${percentage}) · ${gameResult}`
}

const weekdayFormatter = new Intl.DateTimeFormat('it-IT', {
  weekday: 'short',
  timeZone: PADEL_TIME_ZONE,
})
const dayFormatter = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  timeZone: PADEL_TIME_ZONE,
})
const monthFormatter = new Intl.DateTimeFormat('it-IT', {
  month: 'short',
  timeZone: PADEL_TIME_ZONE,
})
const timeFormatter = new Intl.DateTimeFormat('it-IT', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: PADEL_TIME_ZONE,
})
const dateFormatter = new Intl.DateTimeFormat('it-IT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: PADEL_TIME_ZONE,
})
const dateInputFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: PADEL_TIME_ZONE,
})
const shortDayMonthFormatter = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

function dateFromInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const [, year, month, day] = match.map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    ? date
    : null
}

function mondayDateFromInput(value: string): Date | null {
  const date = dateFromInput(value)
  if (!date) return null

  const daysSinceMonday = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - daysSinceMonday)
  return date
}

function dateInputValue(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function shortDayMonth(date: Date): string {
  return shortDayMonthFormatter.format(date).replaceAll('.', '')
}

export function slotDateParts(iso: string) {
  const date = new Date(iso)
  return {
    weekday: weekdayFormatter.format(date).replace('.', '').toUpperCase(),
    day: dayFormatter.format(date),
    month: monthFormatter.format(date).replace('.', '').toUpperCase(),
    time: timeFormatter.format(date),
    full: dateFormatter.format(date),
  }
}

export function weekLabel(weekStart: string): string {
  const start = mondayDateFromInput(weekStart)
  if (!start) return ''

  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  return `${shortDayMonth(start)} — ${shortDayMonth(end)}`
}

export function pollWeekTitle(weekStart: string): string {
  const start = mondayDateFromInput(weekStart)
  if (!start) return 'Padel'

  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)

  if (start.getUTCFullYear() === end.getUTCFullYear()) {
    return `Padel · ${shortDayMonth(start)} – ${shortDayMonth(end)} ${end.getUTCFullYear()}`
  }

  return `Padel · ${shortDayMonth(start)} ${start.getUTCFullYear()} – ${shortDayMonth(end)} ${end.getUTCFullYear()}`
}

export function mondayOfWeek(value: string): string | null {
  const monday = mondayDateFromInput(value)
  return monday ? dateInputValue(monday) : null
}

export function weekStartForDateTime(value: string): string | null {
  const localDate = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.exec(value)?.[1]
  if (localDate) return mondayOfWeek(localDate)

  const instant = new Date(value)
  if (Number.isNaN(instant.getTime())) return null
  return mondayOfWeek(dateInputFormatter.format(instant))
}

export function slotWeekTitle(startsAt: string): string {
  const weekStart = weekStartForDateTime(startsAt)
  return weekStart ? pollWeekTitle(weekStart) : 'Padel'
}

export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName
}

export function formatRatingAverage(average: number): string {
  const roundedToHalfPoint = Math.round(average * 2) / 2
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(roundedToHalfPoint)
}
