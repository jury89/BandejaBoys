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
  const start = new Date(`${weekStart}T12:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return `${shortDayMonth(start)} — ${shortDayMonth(end)}`
}

export function pollWeekTitle(weekStart: string): string {
  const start = dateFromInput(weekStart)
  if (!start) return 'Padel'

  const end = new Date(start)
  end.setDate(end.getDate() + 6)

  if (start.getFullYear() === end.getFullYear()) {
    return `Padel · ${shortDayMonth(start)} – ${shortDayMonth(end)} ${end.getFullYear()}`
  }

  return `Padel · ${shortDayMonth(start)} ${start.getFullYear()} – ${shortDayMonth(end)} ${end.getFullYear()}`
}

export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName
}
