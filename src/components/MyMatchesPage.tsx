import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  MapPin,
  Star,
} from 'lucide-react'
import { DEFAULT_VENUE } from '../lib/domain'
import { slotDateParts } from '../lib/format'
import type { PlayerMatch, PlayerMatchLists } from '../types'

interface MyMatchesPageProps {
  matches: PlayerMatchLists
  loading: boolean
  onBack: () => void
  onSelectMatch: (match: PlayerMatch) => void
}

interface MatchListProps {
  eyebrow: string
  title: string
  matches: PlayerMatch[]
  emptyTitle: string
  emptyBody: string
  past?: boolean
  onSelectMatch?: (match: PlayerMatch) => void
}

function MatchItem({
  match,
  past = false,
  onSelect,
}: {
  match: PlayerMatch
  past?: boolean
  onSelect?: (match: PlayerMatch) => void
}) {
  const date = slotDateParts(match.slot.startsAt)
  const booked = Boolean(match.slot.bookedAt)
  const venue = booked ? (match.slot.venue || DEFAULT_VENUE) : 'Campo da prenotare'
  const status = past ? 'Giocata' : booked ? 'Campo confermato' : 'Da prenotare'
  const receivedRating = past ? match.receivedRating : undefined
  const averageLabel = receivedRating
    ? new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(receivedRating.average)
    : null

  return (
    <article className={`personal-match ${booked ? 'personal-match--booked' : 'personal-match--pending'} ${onSelect ? 'personal-match--interactive' : ''}`}>
      {onSelect && (
        <button
          className="personal-match__link"
          type="button"
          aria-label={`Apri ${match.pollTitle} del ${date.full} alle ${date.time} nella bacheca`}
          onClick={() => onSelect(match)}
        >
          <span className="sr-only">Apri lo slot nella bacheca</span>
        </button>
      )}
      <div className="personal-match__date" aria-hidden="true">
        <span>{date.weekday}</span>
        <strong>{date.day}</strong>
        <small>{date.month}</small>
      </div>
      <div className="personal-match__body">
        <div className="personal-match__heading">
          <div>
            <p>{match.pollTitle}</p>
            <h3><time dateTime={match.slot.startsAt}>{date.time}</time></h3>
          </div>
          <span className="personal-match__starter">Titolare</span>
        </div>
        <div className="personal-match__details">
          <span><Clock3 size={15} /> {match.slot.durationMinutes} min</span>
          <span><MapPin size={15} /> {venue}</span>
        </div>
      </div>
      <div className={`personal-match__status ${booked ? 'is-booked' : 'is-pending'}`}>
        {booked ? <CheckCircle2 size={17} /> : <CalendarClock size={17} />}
        <span>{status}</span>
        {receivedRating && averageLabel && (
          <span
            className="personal-match__rating"
            aria-label={`Media di ${receivedRating.count} ${receivedRating.count === 1 ? 'voto ricevuto' : 'voti ricevuti'}: ${averageLabel} su 10`}
          >
            <Star size={14} fill="currentColor" aria-hidden="true" />
            <span>Media</span>
            <strong>{averageLabel}</strong>
            <small>/10</small>
          </span>
        )}
        {onSelect && <ArrowRight className="personal-match__open-icon" size={17} aria-hidden="true" />}
      </div>
    </article>
  )
}

function MatchList({ eyebrow, title, matches, emptyTitle, emptyBody, past = false, onSelectMatch }: MatchListProps) {
  return (
    <section className="personal-matches__section">
      <header className="personal-matches__section-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <strong>{matches.length}</strong>
      </header>
      {matches.length > 0 ? (
        <div className="personal-matches__list">
          {matches.map((match) => (
            <MatchItem
              key={`${match.pollId}-${match.slot.id}`}
              match={match}
              past={past}
              onSelect={onSelectMatch}
            />
          ))}
        </div>
      ) : (
        <div className="personal-matches__empty">
          {past ? <CalendarCheck2 size={24} /> : <CalendarClock size={24} />}
          <div><strong>{emptyTitle}</strong><p>{emptyBody}</p></div>
        </div>
      )}
    </section>
  )
}

export function MyMatchesPage({ matches, loading, onBack, onSelectMatch }: MyMatchesPageProps) {
  return (
    <main className="dashboard personal-matches">
      <button className="button button--ghost personal-matches__back" type="button" onClick={onBack}>
        <ArrowLeft size={18} /> Torna alla bacheca
      </button>

      <section className="personal-matches__hero">
        <div>
          <p className="eyebrow">Il tuo calendario Bandeja</p>
          <h1>I miei match</h1>
          <p>Tutte le partite in cui sei tra i quattro titolari, prima e dopo il fischio d’inizio.</p>
        </div>
        <div className="personal-matches__score" aria-label={`${matches.upcoming.length} prossimi match e ${matches.past.length} partite giocate`}>
          <span><strong>{matches.upcoming.length}</strong>Prossimi</span>
          <i />
          <span><strong>{matches.past.length}</strong>Giocati</span>
        </div>
      </section>

      {loading ? (
        <div className="loading-state"><span /><p>Recuperiamo i tuoi match…</p></div>
      ) : (
        <div className="personal-matches__grid">
          <MatchList
            eyebrow="In agenda"
            title="Prossimi match"
            matches={matches.upcoming}
            onSelectMatch={onSelectMatch}
            emptyTitle="Nessun match in programma"
            emptyBody="Uno slot comparirà qui quando avrà quattro titolari e tu sarai tra loro."
          />
          <MatchList
            past
            eyebrow="Il tuo storico"
            title="Partite giocate"
            matches={matches.past}
            emptyTitle="Nessuna partita nello storico"
            emptyBody="Qui trovi i match conclusi per cui il campo era stato confermato."
          />
        </div>
      )}
    </main>
  )
}
