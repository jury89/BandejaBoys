import { BellRing, CalendarCheck2, CalendarClock, CalendarDays, CheckCircle2, UsersRound } from 'lucide-react'
import type { SlotWeekGroup } from '../types'
import { getSlotPhase } from '../lib/domain'
import { slotDateParts } from '../lib/format'
import type { PollSlotFilter } from '../lib/slotFilters'

/** Classic presentation only: all subscriptions and mutations stay in Dashboard. */
export function ClassicBoardSummary({ groups }: { groups: SlotWeekGroup[] }) {
  const openWeeks = groups.filter(group => group.entries.some(({ poll }) => poll.status === 'open'))
  const slots = openWeeks.flatMap(group => group.entries.filter(({ poll }) => poll.status === 'open').map(({ slot }) => slot))
  const ready = slots.filter(slot => getSlotPhase(slot) === 'ready').length
  const next = slots.filter(slot => getSlotPhase(slot) === 'booked').sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0]
  return <section className="scoreboard" aria-label="Riepilogo">
    <div><span className="scoreboard__icon"><UsersRound size={20} /></span><p><strong>{openWeeks.length}</strong><span>Settimane<br />attive</span></p></div>
    <div className={ready > 0 ? 'scoreboard__urgent' : ''}><span className="scoreboard__icon"><BellRing size={20} /></span><p><strong>{ready}</strong><span>Pronti da<br />prenotare</span></p></div>
    <div className="scoreboard__next"><span className="scoreboard__icon"><CheckCircle2 size={20} /></span>{next
      ? <p><strong>{slotDateParts(next.startsAt).day} {slotDateParts(next.startsAt).month}</strong><span>Prossima partita<br />alle {slotDateParts(next.startsAt).time}</span></p>
      : <p><strong>—</strong><span>Nessun campo<br />confermato</span></p>}</div>
  </section>
}

export function ClassicBoardFilters({ value, counts, onChange }: { value: PollSlotFilter; counts: Record<'all' | 'booking' | 'booked', number>; onChange: (value: PollSlotFilter) => void }) {
  return <nav className="feed-filter" aria-label="Filtra gli slot"><div className="feed-filter__inner">
    {([
      { key: 'all', label: 'Tutti', accessible: `Tutti, ${counts.all} slot`, icon: CalendarDays },
      { key: 'booking', label: 'Da prenotare', accessible: `Slot da prenotare, ${counts.booking}`, icon: CalendarClock },
      { key: 'booked', label: 'Prenotati', accessible: `Slot prenotati, ${counts.booked}`, icon: CalendarCheck2 },
    ] as const).map(({ key, label, accessible, icon: Icon }) => <button key={key} type="button" className={value === key ? 'is-active' : ''} aria-label={accessible} aria-pressed={value === key} onClick={() => onChange(key)}><Icon size={17} /><span>{label}</span><strong>{counts[key]}</strong></button>)}
  </div></nav>
}
