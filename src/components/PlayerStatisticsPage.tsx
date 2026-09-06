import { useMemo, useState } from 'react'
import {
  Activity,
  ArrowLeft,
  Bird,
  CalendarDays,
  ChevronRight,
  Clock3,
  Medal,
  Target,
  TrendingUp,
  Trophy,
  UserRound,
  UsersRound,
} from 'lucide-react'
import {
  getMatchFeedbackDefinition,
  getPlayerMatches,
  getPlayerStatistics,
  padelDateTimeToTimestamp,
} from '../lib/domain'
import { PADEL_TIME_ZONE, relationshipPerformanceLabel, slotDateParts } from '../lib/format'
import { resolvePlayerMatchNames } from '../lib/memberNames'
import type {
  MatchFeedbackSummary,
  MatchReport,
  MemberProfile,
  PadelPoll,
  PlayerMatch,
  PlayerStatisticsRelationship,
} from '../types'
import { ProfileAvatar } from './ProfileAvatar'

type StatisticsView = 'overview' | 'relations' | 'history'
type StatisticsPeriod = 'all' | 'last-10' | `year-${number}`

interface PlayerStatisticsPageProps {
  polls: PadelPoll[]
  members: MemberProfile[]
  user: MemberProfile
  initialPlayerId: string
  feedbackSummaries: MatchFeedbackSummary[]
  matchReports: MatchReport[]
  now: number
  loading: boolean
  error: string | null
  onBack: () => void
  onSelectPlayer: (playerId: string) => void
}

const yearFormatter = new Intl.DateTimeFormat('en', {
  year: 'numeric',
  timeZone: PADEL_TIME_ZONE,
})

const WEEKDAYS = [
  'domenica',
  'lunedì',
  'martedì',
  'mercoledì',
  'giovedì',
  'venerdì',
  'sabato',
] as const

function matchKey(match: Pick<PlayerMatch, 'pollId' | 'slot'>): string {
  return `${match.pollId}__${match.slot.id}`
}

function matchYear(match: PlayerMatch): number | null {
  const timestamp = padelDateTimeToTimestamp(match.slot.startsAt)
  if (!Number.isFinite(timestamp)) return null
  const year = Number(yearFormatter.format(timestamp))
  return Number.isFinite(year) ? year : null
}

function signedNumber(value: number): string {
  const formatted = new Intl.NumberFormat('it-IT').format(Math.abs(value))
  if (value === 0) return '0'
  return `${value > 0 ? '+' : '−'}${formatted}`
}

function percentage(value: number): string {
  return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(value)}%`
}

function durationLabel(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} min`
  if (minutes === 0) return `${hours} h`
  return `${hours} h ${minutes} min`
}

function clockLabel(minutes: number | null): string {
  if (minutes === null) return '—'
  const hour = String(Math.floor(minutes / 60)).padStart(2, '0')
  const minute = String(minutes % 60).padStart(2, '0')
  return `${hour}:${minute}`
}

function qualifiedRelationships(
  relationships: PlayerStatisticsRelationship[],
): PlayerStatisticsRelationship[] {
  return relationships.filter((relationship) => relationship.setsPlayed >= 3)
}

function bestRelationship(
  relationships: PlayerStatisticsRelationship[],
  direction: 'best' | 'worst',
): PlayerStatisticsRelationship | undefined {
  return [...qualifiedRelationships(relationships)].sort((left, right) => {
    if (left.winRate !== right.winRate) {
      return direction === 'best'
        ? right.winRate - left.winRate
        : left.winRate - right.winRate
    }
    if (left.gameDifference !== right.gameDifference) {
      return direction === 'best'
        ? right.gameDifference - left.gameDifference
        : left.gameDifference - right.gameDifference
    }
    return right.setsPlayed - left.setsPlayed
  })[0]
}

function relationshipSummary(
  relationship: PlayerStatisticsRelationship | undefined,
  emptyCopy: string,
): { name: string; detail: string } {
  if (!relationship) return { name: 'Ancora da scoprire', detail: emptyCopy }
  return {
    name: relationship.displayName,
    detail: relationshipPerformanceLabel(relationship),
  }
}

function RelationshipList({
  title,
  relationships,
  membersById,
  onSelectPlayer,
}: {
  title: string
  relationships: PlayerStatisticsRelationship[]
  membersById: Map<string, MemberProfile>
  onSelectPlayer: (playerId: string) => void
}) {
  return (
    <section className="player-stats__relationship-list">
      <header>
        <h3>{title}</h3>
        <span>Set</span>
        <span>Vinti</span>
        <span>Game</span>
      </header>
      {relationships.length > 0 ? relationships.map((relationship) => {
        const member = membersById.get(relationship.userId)
        const content = (
          <>
            <span className="player-stats__relationship-person">
              <ProfileAvatar
                displayName={relationship.displayName}
                avatarDataUrl={member?.avatarDataUrl}
                className="player-stats__relationship-avatar"
                decorative
              />
              <strong>{relationship.displayName}</strong>
              {!member && <small>Ospite</small>}
            </span>
            <span>{relationship.setsPlayed}</span>
            <span>{percentage(relationship.winRate)}</span>
            <span className={relationship.gameDifference > 0 ? 'is-positive' : relationship.gameDifference < 0 ? 'is-negative' : ''}>
              {signedNumber(relationship.gameDifference)}
            </span>
            {member && <ChevronRight size={16} aria-hidden="true" />}
          </>
        )

        return member ? (
          <button
            type="button"
            key={relationship.userId}
            onClick={() => onSelectPlayer(relationship.userId)}
            aria-label={`Apri le statistiche di ${relationship.displayName}`}
          >
            {content}
          </button>
        ) : (
          <div key={relationship.userId}>{content}</div>
        )
      }) : (
        <p>Servono referti con almeno un set per costruire questo confronto.</p>
      )}
    </section>
  )
}

export function PlayerStatisticsPage({
  polls,
  members,
  user,
  initialPlayerId,
  feedbackSummaries,
  matchReports,
  now,
  loading,
  error,
  onBack,
  onSelectPlayer,
}: PlayerStatisticsPageProps) {
  const players = useMemo(() => {
    const playersById = new Map<string, MemberProfile>([[user.id, user]])
    members.forEach((member) => playersById.set(member.id, member))
    return [...playersById.values()].sort((left, right) => {
      if (left.id === user.id) return -1
      if (right.id === user.id) return 1
      return left.displayName.localeCompare(right.displayName, 'it')
    })
  }, [members, user])
  const membersById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  )
  const safeInitialPlayerId = membersById.has(initialPlayerId) ? initialPlayerId : user.id
  const [selectedPlayerId, setSelectedPlayerId] = useState(safeInitialPlayerId)
  const [period, setPeriod] = useState<StatisticsPeriod>('all')
  const [view, setView] = useState<StatisticsView>('overview')

  const selectedPlayer = membersById.get(selectedPlayerId) ?? user
  const allMatches = useMemo(() => (
    getPlayerMatches(
      polls,
      selectedPlayer.id,
      now,
      feedbackSummaries,
      matchReports,
    ).past.map((match) => resolvePlayerMatchNames(players, match))
  ), [feedbackSummaries, matchReports, now, players, polls, selectedPlayer.id])
  const availableYears = useMemo(() => (
    [...new Set(allMatches.map(matchYear).filter((year): year is number => year !== null))]
      .sort((left, right) => right - left)
  ), [allMatches])
  const matches = useMemo(() => {
    if (period === 'last-10') return allMatches.slice(0, 10)
    if (period.startsWith('year-')) {
      const selectedYear = Number(period.replace('year-', ''))
      return allMatches.filter((match) => matchYear(match) === selectedYear)
    }
    return allMatches
  }, [allMatches, period])
  const statistics = useMemo(
    () => getPlayerStatistics(matches, selectedPlayer.id, feedbackSummaries),
    [feedbackSummaries, matches, selectedPlayer.id],
  )
  const performancesByMatch = useMemo(
    () => new Map(statistics.performances.map((performance) => (
      [`${performance.pollId}__${performance.slotId}`, performance]
    ))),
    [statistics.performances],
  )
  const bestTeammate = relationshipSummary(
    bestRelationship(statistics.teammates, 'best'),
    'Servono almeno 3 set insieme.',
  )
  const favoriteOpponent = relationshipSummary(
    bestRelationship(statistics.opponents, 'best'),
    'Servono almeno 3 set contro.',
  )
  const nemesis = relationshipSummary(
    bestRelationship(statistics.opponents, 'worst'),
    'Servono almeno 3 set contro.',
  )
  const feedbackDefinition = statistics.feedbackLevel
    ? getMatchFeedbackDefinition(statistics.feedbackLevel)
    : null

  const selectPlayer = (playerId: string) => {
    setSelectedPlayerId(playerId)
    setPeriod('all')
    onSelectPlayer(playerId)
  }

  return (
    <main className="dashboard player-stats">
      <button className="button button--ghost player-stats__back" type="button" onClick={onBack}>
        <ArrowLeft size={18} /> Torna alla bacheca
      </button>

      <section className="player-stats__hero">
        <div className="player-stats__identity">
          <ProfileAvatar
            displayName={selectedPlayer.displayName}
            avatarDataUrl={selectedPlayer.avatarDataUrl}
            className="player-stats__hero-avatar"
          />
          <div>
            <p>Il profilo di campo</p>
            <h1>{selectedPlayer.displayName}</h1>
            <span>{selectedPlayer.id === user.id ? 'Questa sei tu, fagiano.' : 'Numeri ufficiali della voliera.'}</span>
          </div>
        </div>
        <div className="player-stats__court-score" aria-label={`${statistics.appearances} presenze, ${percentage(statistics.setWinRate)} set vinti, differenza game ${signedNumber(statistics.gameDifference)}`}>
          <i aria-hidden="true" />
          <span><strong>{statistics.appearances}</strong>Presenze</span>
          <span><strong>{statistics.setsPlayed > 0 ? percentage(statistics.setWinRate) : '—'}</strong>Set vinti</span>
          <span><strong>{statistics.setsPlayed > 0 ? signedNumber(statistics.gameDifference) : '—'}</strong>Game</span>
        </div>
      </section>

      <section className="player-stats__controls" aria-label="Scegli giocatore e periodo">
        <div className="player-stats__player-picker" role="group" aria-label="Giocatori">
          {players.map((player) => (
            <button
              type="button"
              className={player.id === selectedPlayer.id ? 'is-active' : ''}
              aria-pressed={player.id === selectedPlayer.id}
              key={player.id}
              onClick={() => selectPlayer(player.id)}
            >
              <ProfileAvatar
                displayName={player.displayName}
                avatarDataUrl={player.avatarDataUrl}
                className="player-stats__picker-avatar"
                decorative
              />
              <span>{player.id === user.id ? 'Tu' : player.displayName}</span>
            </button>
          ))}
        </div>
        <label>
          <span>Periodo</span>
          <select value={period} onChange={(event) => setPeriod(event.target.value as StatisticsPeriod)}>
            <option value="all">Tutto lo storico</option>
            <option value="last-10">Ultime 10 partite</option>
            {availableYears.map((year) => (
              <option value={`year-${year}`} key={year}>Stagione {year}</option>
            ))}
          </select>
        </label>
      </section>

      <nav className="player-stats__tabs" aria-label="Sezioni delle statistiche">
        <button type="button" className={view === 'overview' ? 'is-active' : ''} aria-pressed={view === 'overview'} onClick={() => setView('overview')}>
          <Activity size={17} /> <span>Panoramica</span>
        </button>
        <button type="button" className={view === 'relations' ? 'is-active' : ''} aria-pressed={view === 'relations'} onClick={() => setView('relations')}>
          <UsersRound size={17} /> <span>Coppie e rivali</span>
        </button>
        <button type="button" className={view === 'history' ? 'is-active' : ''} aria-pressed={view === 'history'} onClick={() => setView('history')}>
          <CalendarDays size={17} /> <span>Storico</span>
        </button>
      </nav>

      {error && <div className="player-stats__error" role="alert">{error}</div>}
      {loading ? (
        <div className="loading-state"><span /><p>Prepariamo la scheda del giocatore…</p></div>
      ) : statistics.appearances === 0 ? (
        <section className="player-stats__empty">
          <UserRound size={28} />
          <div>
            <h2>Ancora nessuna partita</h2>
            <p>Le statistiche nasceranno dopo la prima partita conclusa e prenotata.</p>
          </div>
        </section>
      ) : view === 'overview' ? (
        <div className="player-stats__overview">
          <section className="player-stats__scorecard">
            <header>
              <div>
                <p>Numeri di campo</p>
                <h2>Il tabellino</h2>
              </div>
              <Target size={24} aria-hidden="true" />
            </header>
            <dl>
              <div><dt>Set</dt><dd><strong>{statistics.setWins}</strong> vinti · {statistics.setLosses} persi</dd></div>
              <div><dt>Game</dt><dd><strong>{statistics.gamesFor}</strong> fatti · {statistics.gamesAgainst} subiti</dd></div>
              <div><dt>Serate positive</dt><dd><strong>{statistics.positiveMatches}</strong> su {statistics.reportedMatches} con referto</dd></div>
              <div><dt>Tempo in campo</dt><dd><strong>{durationLabel(statistics.totalMinutes)}</strong></dd></div>
            </dl>
            <footer>
              {statistics.reportedMatches === 1 ? 'Referto disponibile' : 'Referti disponibili'} per {statistics.reportedMatches} {statistics.reportedMatches === 1 ? 'partita' : 'partite'} su {statistics.appearances}.
              Le partite senza referto contano solo come presenza e minuti.
            </footer>
          </section>

          <section className="player-stats__curiosities">
            <header>
              <div>
                <p>Identikit del fagiano</p>
                <h2>Curiosità</h2>
              </div>
              <Bird size={24} aria-hidden="true" />
            </header>
            <ul>
              <li><CalendarDays size={17} /><span>Giorno del cuore</span><strong>{statistics.favoriteWeekday === null ? '—' : WEEKDAYS[statistics.favoriteWeekday]}</strong></li>
              <li><Clock3 size={17} /><span>Orario preferito</span><strong>{clockLabel(statistics.favoriteStartMinutes)}</strong></li>
              <li><TrendingUp size={17} /><span>Striscia migliore</span><strong>{statistics.longestSetWinStreak} set</strong></li>
              <li><Trophy size={17} /><span>Vittoria più larga</span><strong>{statistics.biggestSetWin === null ? '—' : `+${statistics.biggestSetWin} game`}</strong></li>
              <li><Activity size={17} /><span>Peggior imbarcata</span><strong>{statistics.biggestSetLoss === null ? '—' : `−${statistics.biggestSetLoss} game`}</strong></li>
              <li><Medal size={17} /><span>Tie-break</span><strong>{statistics.tieBreakWins} vinti · {statistics.tieBreakLosses} persi</strong></li>
            </ul>
          </section>

          <section className="player-stats__verdict">
            <span className="player-stats__verdict-icon" aria-hidden="true"><Bird size={24} /></span>
            <div>
              <p>Verdetto della voliera</p>
              <h2>{feedbackDefinition?.label ?? 'Ancora nessun giudizio'}</h2>
              <span>
                {feedbackDefinition
                  ? `${feedbackDefinition.description} Media di ${statistics.feedbackCount} giudizi in ${statistics.feedbackMatches} partite.`
                  : 'Quando arriveranno i giudizi del gruppo, qui comparirà soltanto la media aggregata.'}
              </span>
            </div>
          </section>
        </div>
      ) : view === 'relations' ? (
        <div className="player-stats__relations">
          <section className="player-stats__relationship-highlights">
            <header>
              <p>Intese e conti in sospeso</p>
              <h2>Lo spogliatoio sa tutto</h2>
              <span>Le etichette richiedono almeno tre set insieme o contro.</span>
            </header>
            <dl>
              <div><dt>Compagno portafortuna</dt><dd>{bestTeammate.name}</dd><span>{bestTeammate.detail}</span></div>
              <div><dt>Cliente preferito</dt><dd>{favoriteOpponent.name}</dd><span>{favoriteOpponent.detail}</span></div>
              <div><dt>Bestia nera</dt><dd>{nemesis.name}</dd><span>{nemesis.detail}</span></div>
            </dl>
          </section>
          <div className="player-stats__relationship-grid">
            <RelationshipList title="Come compagni" relationships={statistics.teammates} membersById={membersById} onSelectPlayer={selectPlayer} />
            <RelationshipList title="Come avversari" relationships={statistics.opponents} membersById={membersById} onSelectPlayer={selectPlayer} />
          </div>
        </div>
      ) : (
        <section className="player-stats__history">
          <header>
            <div>
              <p>Partita dopo partita</p>
              <h2>Storico personale</h2>
            </div>
            <strong>{matches.length}</strong>
          </header>
          <div className="player-stats__history-list">
            {matches.map((match) => {
              const date = slotDateParts(match.slot.startsAt)
              const performance = performancesByMatch.get(matchKey(match))
              const verdict = match.receivedFeedback
                ? getMatchFeedbackDefinition(match.receivedFeedback.level).label
                : null
              return (
                <article key={matchKey(match)}>
                  <div className="player-stats__history-date" aria-hidden="true">
                    <span>{date.weekday}</span>
                    <strong>{date.day}</strong>
                    <small>{date.month}</small>
                  </div>
                  <div className="player-stats__history-match">
                    <p>{match.pollTitle}</p>
                    <h3>{date.time}</h3>
                    <span>{match.slot.durationMinutes} min · {match.slot.venue}</span>
                  </div>
                  {performance && performance.setsPlayed > 0 ? (
                    <div className="player-stats__history-result">
                      <strong>{performance.setWins}–{performance.setLosses}</strong>
                      <span>set · {signedNumber(performance.gameDifference)} game</span>
                    </div>
                  ) : (
                    <div className="player-stats__history-result is-empty">
                      <strong>—</strong><span>Referto assente</span>
                    </div>
                  )}
                  <div className="player-stats__history-verdict">
                    {verdict ? <><Bird size={14} /> <span>{verdict}</span></> : <span>Nessun giudizio</span>}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}
    </main>
  )
}
