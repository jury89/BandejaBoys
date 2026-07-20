const weekdayFormatter = new Intl.DateTimeFormat('it-IT', { weekday: 'short' })
const dayFormatter = new Intl.DateTimeFormat('it-IT', { day: '2-digit' })
const monthFormatter = new Intl.DateTimeFormat('it-IT', { month: 'short' })
const timeFormatter = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' })
const dateFormatter = new Intl.DateTimeFormat('it-IT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

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
  const short = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' })
  return `${short.format(start)} — ${short.format(end)}`
}

export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName
}

