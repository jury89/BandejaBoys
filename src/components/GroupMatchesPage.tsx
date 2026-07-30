import {
  ArrowLeft,
  CalendarCheck2,
  ClipboardList,
  Clock3,
  MapPin,
  Star,
  UsersRound,
} from 'lucide-react'
import { DEFAULT_VENUE, getStarters } from '../lib/domain'
import { formatRatingAverage, slotDateParts } from '../lib/format'
import type { GroupMatch, MemberProfile } from '../types'
import { MatchReportScoreboard } from './MatchReportScoreboard'
import { ProfileAvatar } from './ProfileAvatar'

interface GroupMatchesPageProps {
  matches: GroupMatch[]
  members: MemberProfile[]
  loading: boolean
  error: string | null
  onBack: () => void
}

function ratingCountLabel(count: number): string {
  return count === 1 ? '1 voto' : `${count} voti`
}

function GroupMatchCard({
  match,
  members,
}: {
  match: GroupMatch
  members: MemberProfile[]
}) {
  const date = slotDateParts(match.slot.startsAt)
  const starters = getStarters(match.slot)
  const venue = match.slot.venue || DEFAULT_VENUE
  const memberById = new Map(members.map((member) => [member.id, member]))

  return (
    <article className="personal-match personal-match--booked group-match">
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
          <span className="group-match__badge">Giocata</span>
        </div>
        <div className="personal-match__details">
          <span><Clock3 size={15} /> {match.slot.durationMinutes} min</span>
          <span><MapPin size={15} /> {venue}</span>
        </div>
      </div>

      <div className="group-match__content">
        <section className="group-match__panel group-match__ratings" aria-label="Pagellino dei giocatori">
          <header className="group-match__panel-heading">
            <span aria-hidden="true"><UsersRound size={18} /></span>
            <div>
              <small>Pagellino</small>
              <strong>Media dei giocatori</strong>
            </div>
          </header>
          <div className="group-match__players">
            {starters.map((signup) => {
              const member = memberById.get(signup.userId)
              const rating = match.playerRatings.find((item) => item.userId === signup.userId)
              const averageLabel = rating?.average === undefined
                ? null
                : formatRatingAverage(rating.average)
              const ratingLabel = averageLabel
                ? `${signup.displayName}: media ${averageLabel} su 10 da ${ratingCountLabel(rating?.count ?? 0)}`
                : `${signup.displayName}: nessun voto ricevuto`

              return (
                <div className="group-match__player" key={signup.id}>
                  <ProfileAvatar
                    className="group-match__avatar"
                    displayName={signup.displayName}
                    avatarDataUrl={member?.avatarDataUrl}
                    decorative
                  />
                  <div className="group-match__player-copy">
                    <strong>{signup.displayName}</strong>
                    <small>{averageLabel ? ratingCountLabel(rating?.count ?? 0) : signup.isGuest ? 'Ospite' : 'Non votato'}</small>
                  </div>
                  <span className={`group-match__player-score ${averageLabel ? 'has-rating' : ''}`} aria-label={ratingLabel}>
                    {averageLabel ? <Star size={13} fill="currentColor" aria-hidden="true" /> : null}
                    <strong>{averageLabel ?? '—'}</strong>
                    {averageLabel ? <small>/10</small> : null}
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        <section className={`group-match__panel group-match__result ${match.report ? 'is-complete' : 'is-empty'}`}>
          <header className="group-match__panel-heading">
            <span aria-hidden="true"><ClipboardList size={18} /></span>
            <div>
              <small>Risultato</small>
              <strong>
                {match.report
                  ? `${match.report.sets.length} ${match.report.sets.length === 1 ? 'set registrato' : 'set registrati'}`
                  : 'Referto non aggiunto'}
              </strong>
            </div>
          </header>
          {match.report ? (
            <MatchReportScoreboard report={match.report} />
          ) : (
            <p>Coppie e punteggi non sono ancora disponibili per questa partita.</p>
          )}
        </section>
      </div>
    </article>
  )
}

export function GroupMatchesPage({
  matches,
  members,
  loading,
  error,
  onBack,
}: GroupMatchesPageProps) {
  return (
    <main className="dashboard personal-matches group-matches">
      <button className="button button--ghost personal-matches__back" type="button" onClick={onBack}>
        <ArrowLeft size={18} /> Torna alla bacheca
      </button>

      <section className="personal-matches__hero group-matches__hero">
        <div>
          <p className="eyebrow">Lo spogliatoio Bandeja</p>
          <h1>Gli altri match</h1>
          <p>Le partite giocate dal gruppo senza di te, con pagellini e risultati dei set.</p>
        </div>
        <div className="personal-matches__score group-matches__score" aria-label={`${matches.length} partite giocate dagli altri`}>
          <span><strong>{matches.length}</strong>Partite</span>
        </div>
      </section>

      {error && <div className="group-matches__error" role="alert">{error}</div>}

      {loading ? (
        <div className="loading-state"><span /><p>Recuperiamo i match del gruppo…</p></div>
      ) : (
        <section className="personal-matches__section group-matches__section">
          <header className="personal-matches__section-heading">
            <div>
              <p className="eyebrow">Dagli spalti</p>
              <h2>Partite concluse</h2>
            </div>
            <strong>{matches.length}</strong>
          </header>
          {matches.length > 0 ? (
            <div className="personal-matches__list group-matches__list">
              {matches.map((match) => (
                <GroupMatchCard
                  key={`${match.pollId}-${match.slot.id}`}
                  match={match}
                  members={members}
                />
              ))}
            </div>
          ) : (
            <div className="personal-matches__empty">
              <CalendarCheck2 size={24} />
              <div>
                <strong>Nessun altro match giocato</strong>
                <p>Qui compariranno le partite concluse in cui non eri tra i quattro titolari.</p>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  )
}
