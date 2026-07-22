const weekdayFormatter = new Intl.DateTimeFormat('it-IT', { weekday: 'short' })
const dayFormatter = new Intl.DateTimeFormat('it-IT', { day: '2-digit' })
const monthFormatter = new Intl.DateTimeFormat('it-IT', { month: 'short' })
const timeFormatter = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' })
const dateFormatter = new Intl.DateTimeFormat('it-IT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
const shortDayMonthFormatter = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'short',
})

function dateFromInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const [, year, month, day] = match.map(Number)
  const date = new Date(year, month - 1, day, 12)
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day
    ? date
    : null
}

function mondayDateFromInput(value: string): Date | null {
  const date = dateFromInput(value)
  if (!date) return null

  const daysSinceMonday = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - daysSinceMonday)
  return date
}

function dateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
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
  end.setDate(end.getDate() + 6)
  return `${shortDayMonth(start)} — ${shortDayMonth(end)}`
}

export function pollWeekTitle(weekStart: string): string {
  const start = mondayDateFromInput(weekStart)
  if (!start) return 'Padel'

  const end = new Date(start)
  end.setDate(end.getDate() + 6)

  if (start.getFullYear() === end.getFullYear()) {
    return `Padel · ${shortDayMonth(start)} – ${shortDayMonth(end)} ${end.getFullYear()}`
  }

  return `Padel · ${shortDayMonth(start)} ${start.getFullYear()} – ${shortDayMonth(end)} ${end.getFullYear()}`
}

export function mondayOfWeek(value: string): string | null {
  const monday = mondayDateFromInput(value)
  return monday ? dateInputValue(monday) : null
}

export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName
}
