import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  ArrowLeft,
  BookOpenText,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Crown,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Trophy,
  UsersRound,
} from 'lucide-react'
import type {
  FantasyEntry,
  FantasyLeaderboardContribution,
  FantasyLeaderboardRow,
  FantasyPlayerScore,
  FantasyRound,
  FantasyRoundPlayer,
  FantasySelectionInput,
  MemberProfile,
  SessionUser,
} from '../types'
import {
  FANTASY_STARTER_LEAGUE_POINTS,
  FANTASY_TOP_PERFORMER_LEAGUE_POINTS,
  fantasyEntryIsCurrent,
  getFantasyLeaderboard,
  getMatchFeedbackDefinition,
} from '../lib/domain'
import { PADEL_TIME_ZONE } from '../lib/format'
import { resolveMemberName } from '../lib/memberNames'
import { Modal } from './Modal'
import { ProfileAvatar } from './ProfileAvatar'

interface FantasyBandejaPageProps {
  rounds: FantasyRound[]
  ownEntries: Record<string, FantasyEntry | undefined>
  roundEntries: Record<string, FantasyEntry[] | undefined>
  members: MemberProfile[]
  user: SessionUser
  now: number
  loading: boolean
  error: string | null
  onBack: () => void
  onRetry: () => void
  onSave: (roundId: string, input: FantasySelectionInput) => Promise<void>
}

interface FantasyRoundCardProps {
  round: FantasyRound
  savedEntry?: FantasyEntry
  members: MemberProfile[]
  user: SessionUser
  now: number
  onSave: (roundId: string, input: FantasySelectionInput) => Promise<void>
}

type FantasyView = 'play' | 'leaderboard' | 'results'

const FANTASY_VIEWS: FantasyView[] = ['play', 'leaderboard', 'results']
const INITIAL_VISIBLE_RESULTS = 4

const matchFormatter = new Intl.DateTimeFormat('it-IT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: PADEL_TIME_ZONE,
})

function sentenceCase(value: string): string {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value
}

function matchDate(round: FantasyRound): string {
  return sentenceCase(matchFormatter.format(new Date(round.locksAt)))
}

function lockCountdown(locksAt: number, now: number): string {
  const minutes = Math.max(0, Math.ceil((locksAt - now) / 60_000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.ceil(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'ora' : 'ore'}`
  const days = Math.ceil(hours / 24)
  return `${days} ${days === 1 ? 'giorno' : 'giorni'}`
}

function memberFor(members: MemberProfile[], userId: string): MemberProfile | undefined {
  return members.find((member) => member.id === userId)
}

function resolvedPlayer(
  player: FantasyRoundPlayer,
  members: MemberProfile[],
): FantasyRoundPlayer {
  return {
    ...player,
    displayName: resolveMemberName(members, player.userId, player.displayName),
  }
}

function PlayerAvatar({
  player,
  members,
}: {
  player: FantasyRoundPlayer
  members: MemberProfile[]
}) {
  const member = memberFor(members, player.userId)
  return (
    <ProfileAvatar
      displayName={resolveMemberName(members, player.userId, player.displayName)}
      avatarDataUrl={member?.avatarDataUrl}
      decorative
    />
  )
}

function FantasyRulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Come si gioca"
      eyebrow="Regolamento FantaBandeja"
      onClose={onClose}
      size="wide"
    >
      <div className="fantasy-rulebook">
        <p className="fantasy-rulebook__lead">
          Segui la partita da fuori, schiera la coppia giusta e conquista punti
          con le prestazioni reali dei Bandeja Boys.
        </p>

        <ol className="fantasy-rulebook__steps">
          <li>
            <span>1</span>
            <div>
              <h3>Entra da spettatore</h3>
              <p>
                Il round si apre quando il campo è prenotato e ci sono quattro
                titolari registrati. I quattro giocatori in campo non possono
                partecipare al proprio round.
              </p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <h3>Schiera due giocatori</h3>
              <p>
                Scegli due dei quattro titolari e assegna la fascia a uno di
                loro. Puoi cambiare formazione fino all’orario d’inizio.
              </p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <h3>Giocata segreta</h3>
              <p>
                Prima del via soltanto tu puoi vedere la tua scelta. Al fischio
                d’inizio tutte le formazioni vengono bloccate e rese pubbliche.
              </p>
            </div>
          </li>
          <li>
            <span>4</span>
            <div>
              <h3>Scala la classifica</h3>
              <p>
                I primi tre del round ricevono 5, 3 e 1 punto. La classifica
                generale somma i punti ottenuti in tutte le partite. Chi gioca
                in campo riceve {FANTASY_STARTER_LEAGUE_POINTS} punti;
                {' '}chi ottiene il giudizio medio migliore ne riceve {FANTASY_TOP_PERFORMER_LEAGUE_POINTS}.
              </p>
            </div>
          </li>
        </ol>

        <section className="fantasy-rulebook__score" aria-labelledby="fantasy-score-title">
          <header>
            <Trophy size={22} />
            <div>
              <p className="eyebrow">Punteggio giocatore</p>
              <h3 id="fantasy-score-title">Come nasce il totale</h3>
            </div>
          </header>
          <dl>
            <div>
              <dt>Base</dt>
              <dd>La media dei giudizi ricevuti determina il punteggio base; senza giudizi vale Fagiano spaesato.</dd>
            </div>
            <div>
              <dt>Risultato</dt>
              <dd>+1,5 con più set vinti, −0,5 con più set persi.</dd>
            </div>
            <div>
              <dt>Game</dt>
              <dd>+0,5 a chi condivide la miglior differenza game positiva.</dd>
            </div>
            <div>
              <dt>Capitano</dt>
              <dd>Punteggio ×1,5 e altri +2 se ha ricevuto il giudizio medio migliore.</dd>
            </div>
          </dl>
        </section>

        <p className="fantasy-rulebook__note">
          <Clock3 size={18} />
          Dopo 24 ore il risultato viene calcolato se ci sono il referto e tutte
          le schede dei giudizi chiuse. A 48 ore il round si chiude comunque; senza
          referto viene annullato.
        </p>
      </div>
    </Modal>
  )
}

function FantasyCourt({
  round,
  members,
  selectedIds,
  interactive,
  onToggle,
}: {
  round: FantasyRound
  members: MemberProfile[]
  selectedIds: string[]
  interactive: boolean
  onToggle?: (userId: string) => void
}) {
  return (
    <div className="fantasy-court" aria-label="I quattro titolari disponibili">
      <span className="fantasy-court__net" aria-hidden="true" />
      {round.participants.map((rawPlayer, index) => {
        const player = resolvedPlayer(rawPlayer, members)
        const selected = selectedIds.includes(player.userId)
        return (
          <button
            className={`fantasy-player ${selected ? 'is-selected' : ''}`}
            type="button"
            key={player.userId}
            aria-pressed={selected}
            disabled={!interactive}
            onClick={() => onToggle?.(player.userId)}
          >
            <span className="fantasy-player__number">{index + 1}</span>
            <PlayerAvatar player={player} members={members} />
            <span className="fantasy-player__name">{player.displayName}</span>
            {selected && <span className="fantasy-player__check"><Check size={15} /></span>}
          </button>
        )
      })}
    </div>
  )
}

function FantasyRoundCard({
  round,
  savedEntry,
  members,
  user,
  now,
  onSave,
}: FantasyRoundCardProps) {
  const savedEntryIsCurrent = fantasyEntryIsCurrent(round, savedEntry)
  const [selectedIds, setSelectedIds] = useState<string[]>(
    savedEntryIsCurrent && savedEntry ? savedEntry.playerIds : [],
  )
  const [captainId, setCaptainId] = useState(
    savedEntryIsCurrent && savedEntry ? savedEntry.captainId : '',
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const isStarter = round.participantIds.includes(user.id)

  const togglePlayer = (userId: string) => {
    setSaveError('')
    setSelectedIds((current) => {
      if (current.includes(userId)) {
        if (captainId === userId) setCaptainId('')
        return current.filter((id) => id !== userId)
      }
      if (current.length < 2) return [...current, userId]
      if (captainId === current[0]) setCaptainId('')
      return [current[1], userId]
    })
  }

  const save = async () => {
    if (selectedIds.length !== 2 || !captainId) return
    setSaving(true)
    setSaveError('')
    try {
      await onSave(round.id, {
        playerIds: [selectedIds[0], selectedIds[1]],
        captainId,
      })
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Salvataggio non riuscito.')
    } finally {
      setSaving(false)
    }
  }

  const selectedPlayers = selectedIds
    .map((userId) => round.participants.find((player) => player.userId === userId))
    .filter((player): player is FantasyRoundPlayer => Boolean(player))

  return (
    <article className="fantasy-round-card">
      <header className="fantasy-round-card__header">
        <div className="fantasy-round-card__match">
          <span><CalendarDays size={18} /></span>
          <div>
            <p>{round.pollTitle}</p>
            <h3>{matchDate(round)}</h3>
          </div>
        </div>
        <div className="fantasy-round-card__deadline">
          <Clock3 size={15} />
          <span>Blocca tra</span>
          <strong>{lockCountdown(round.locksAt, now)}</strong>
        </div>
      </header>

      {isStarter ? (
        <div className="fantasy-round-card__ineligible">
          <ShieldCheck size={24} />
          <div>
            <strong>Tu sei in campo.</strong>
            <p>I quattro titolari non giocano questo round fantasy: lascia che siano gli altri a puntare su di te.</p>
          </div>
        </div>
      ) : (
        <div className="fantasy-round-card__instructions">
          <div><strong>1.</strong><span>Scegli due giocatori</span></div>
          <div><strong>2.</strong><span>Nomina il capitano</span></div>
          <span>{selectedIds.length}/2 scelti</span>
        </div>
      )}

      <FantasyCourt
        round={round}
        members={members}
        selectedIds={selectedIds}
        interactive={!isStarter}
        onToggle={togglePlayer}
      />

      {!isStarter && (
        <div className="fantasy-round-card__selection">
          {selectedPlayers.length > 0 ? (
            <>
              <p><Crown size={16} /> Chi porta la fascia?</p>
              <div className="fantasy-captain-options">
                {selectedPlayers.map((player) => (
                  <button
                    type="button"
                    key={player.userId}
                    className={captainId === player.userId ? 'is-captain' : ''}
                    aria-pressed={captainId === player.userId}
                    onClick={() => setCaptainId(player.userId)}
                  >
                    <PlayerAvatar player={player} members={members} />
                    <span>{resolvedPlayer(player, members).displayName}</span>
                    <Crown size={16} />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="fantasy-round-card__placeholder">
              <UsersRound size={20} />
              Tocca due titolari sul campo per comporre la coppia.
            </div>
          )}

          {!savedEntryIsCurrent && savedEntry && (
            <div className="fantasy-round-card__warning" role="status">
              <CircleAlert size={17} />
              La formazione reale è cambiata: ricomponi la tua coppia.
            </div>
          )}
          {saveError && (
            <div className="fantasy-round-card__warning" role="alert">
              <CircleAlert size={17} /> {saveError}
            </div>
          )}
          <div className="fantasy-round-card__save">
            <span><EyeOff size={16} /> Scelta segreta fino al via</span>
            <button
              className="button button--primary"
              type="button"
              disabled={selectedIds.length !== 2 || !captainId || saving}
              onClick={() => void save()}
            >
              {saving ? 'Salvataggio…' : savedEntryIsCurrent ? 'Aggiorna formazione' : 'Salva formazione'}
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

function LockedRound({
  round,
  entries,
  members,
  user,
}: {
  round: FantasyRound
  entries?: FantasyEntry[]
  members: MemberProfile[]
  user: SessionUser
}) {
  const currentEntries = entries?.filter((entry) => fantasyEntryIsCurrent(round, entry))

  return (
    <article className="fantasy-locked-round">
      <header>
        <div>
          <p className="eyebrow">Formazioni bloccate</p>
          <h3>{matchDate(round)}</h3>
          <span>{round.pollTitle}</span>
        </div>
        <LockKeyhole size={22} />
      </header>
      {entries === undefined ? (
        <div className="fantasy-locked-round__state">Recuperiamo le formazioni…</div>
      ) : currentEntries?.length === 0 ? (
        <div className="fantasy-locked-round__state">Nessuno ha schierato una coppia per questo round.</div>
      ) : (
        <ol className="fantasy-entry-list">
          {currentEntries?.map((entry) => (
            <li key={entry.managerId} className={entry.managerId === user.id ? 'is-mine' : ''}>
              <div>
                <strong>
                  {resolveMemberName(members, entry.managerId, entry.managerName)}
                  {entry.managerId === user.id && <small>La tua</small>}
                </strong>
                <span>
                  {entry.playerIds.map((playerId) => resolveMemberName(
                    members,
                    playerId,
                    round.participants.find((player) => player.userId === playerId)?.displayName ?? playerId,
                  )).join(' + ')}
                </span>
              </div>
              <span>
                <Crown size={15} />
                {resolveMemberName(
                  members,
                  entry.captainId,
                  round.participants.find((player) => player.userId === entry.captainId)?.displayName ?? entry.captainId,
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
      <footer><Clock3 size={15} /> Calcolo da 24 ore con referto e giudizi chiusi.</footer>
    </article>
  )
}

function RoundResult({
  round,
  members,
  user,
  defaultExpanded = false,
}: {
  round: FantasyRound
  members: MemberProfile[]
  user: SessionUser
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const detailsId = `fantasy-result-details-${round.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  const toggleLabel = `${expanded ? 'Nascondi' : 'Mostra'} il risultato di ${matchDate(round)}`

  if (round.status === 'void') {
    return (
      <article className={`fantasy-result fantasy-result--void ${expanded ? 'is-expanded' : ''}`}>
        <button
          className="fantasy-result__toggle fantasy-result__toggle--void"
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={toggleLabel}
          onClick={() => setExpanded((current) => !current)}
        >
          <CircleAlert size={22} />
          <div><p>Round annullato</p><h3>{matchDate(round)}</h3></div>
          <ChevronDown className="fantasy-result__chevron" size={20} aria-hidden="true" />
        </button>
        <div id={detailsId} className="fantasy-result__details" hidden={!expanded}>
          <p>{round.voidReason || 'Il round non poteva essere calcolato.'}</p>
        </div>
      </article>
    )
  }

  const winner = round.standings?.find((standing) => standing.rank === 1) ?? round.standings?.[0]
  const ownStanding = round.standings?.find((standing) => standing.managerId === user.id)
  const winnerName = winner
    ? resolveMemberName(members, winner.managerId, winner.managerName)
    : null

  return (
    <article className={`fantasy-result ${expanded ? 'is-expanded' : ''}`}>
      <button
        className="fantasy-result__toggle"
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        aria-label={toggleLabel}
        onClick={() => setExpanded((current) => !current)}
      >
        <div className="fantasy-result__header">
          <div>
            <p className="eyebrow">Classifica di giornata</p>
            <h3>{matchDate(round)}</h3>
            <span>{round.pollTitle}</span>
          </div>
          <Trophy size={23} aria-hidden="true" />
        </div>
        <div className="fantasy-result__summary">
          <span><Trophy size={16} aria-hidden="true" /> {winnerName ? `Vince ${winnerName}` : 'Nessuna formazione valida'}</span>
          {ownStanding && (
            <span>
              Tu: {fantasyNumber(ownStanding.totalScore)} punti · +{ownStanding.leaguePoints} campionato
            </span>
          )}
        </div>
        <ChevronDown className="fantasy-result__chevron" size={20} aria-hidden="true" />
      </button>
      <div id={detailsId} className="fantasy-result__details" hidden={!expanded}>
        {(round.standings?.length ?? 0) > 0 ? (
          <ol className="fantasy-result__standings">
            {round.standings?.map((standing) => (
              <li key={standing.managerId} className={standing.managerId === user.id ? 'is-mine' : ''}>
                <strong className="fantasy-result__rank">{standing.rank}</strong>
                <div>
                  <p>
                    {resolveMemberName(members, standing.managerId, standing.managerName)}
                    {standing.managerId === user.id && <small>Tu</small>}
                  </p>
                  <span>
                    {standing.playerIds.map((playerId) => resolveMemberName(
                      members,
                      playerId,
                      round.participants.find((player) => player.userId === playerId)?.displayName ?? playerId,
                    )).join(' + ')}
                    {' · '}
                    <Crown size={13} />
                    {resolveMemberName(
                      members,
                      standing.captainId,
                      round.participants.find((player) => player.userId === standing.captainId)?.displayName ?? standing.captainId,
                    )}
                  </span>
                </div>
                <p className="fantasy-result__points">
                  <strong>{standing.totalScore.toLocaleString('it-IT', { maximumFractionDigits: 2 })}</strong>
                  <span>+{standing.leaguePoints} pt</span>
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="fantasy-result__empty">Nessuna formazione valida è stata schierata.</p>
        )}
        <div className="fantasy-player-scores">
          {(round.playerScores ?? []).map((score) => (
            <FantasyPlayerScoreRow
              key={score.userId}
              roundId={round.id}
              score={score}
              members={members}
            />
          ))}
        </div>
      </div>
    </article>
  )
}

function fantasyNumber(value: number): string {
  return value.toLocaleString('it-IT', { maximumFractionDigits: 2 })
}

function fantasyModifier(value: number): string {
  if (value > 0) return `+${fantasyNumber(value)}`
  if (value < 0) return `−${fantasyNumber(Math.abs(value))}`
  return '0'
}

function setRecord(score: FantasyPlayerScore): string {
  const won = `${score.setWins} ${score.setWins === 1 ? 'vinto' : 'vinti'}`
  const lost = `${score.setLosses} ${score.setLosses === 1 ? 'perso' : 'persi'}`
  return `${won} · ${lost}`
}

function ratingSource(score: FantasyPlayerScore): string {
  if (score.usedDefaultRating) {
    return `Voto d’ufficio · ${score.ratingCount} ${score.ratingCount === 1 ? 'pagella ricevuta' : 'pagelle ricevute'}`
  }
  return `${score.ratingCount} pagelle ricevute`
}

function mvpVoteSource(score: FantasyPlayerScore): string {
  const votes = score.mvpVotes ?? 0
  return `${votes} ${votes === 1 ? 'preferenza ricevuta' : 'preferenze ricevute'}`
}

function feedbackSource(score: FantasyPlayerScore): string {
  const definition = getMatchFeedbackDefinition(score.feedbackLevel ?? 3)
  if (score.usedDefaultRating) return `${definition.label} d’ufficio`
  return `${definition.label} · ${score.ratingCount} ${score.ratingCount === 1 ? 'giudizio' : 'giudizi'}`
}

function FantasyPlayerScoreRow({
  roundId,
  score,
  members,
}: {
  roundId: string
  score: FantasyPlayerScore
  members: MemberProfile[]
}) {
  const [expanded, setExpanded] = useState(false)
  const playerName = resolveMemberName(members, score.userId, score.displayName)
  const detailId = `fantasy-score-${roundId}-${score.userId}`
  const usesMvpScoring = score.scoringModel === 'mvp-v2'
  const usesFeedbackScoring = score.scoringModel === 'feedback-v3'
  const modifiers = [score.resultBonus, score.differenceBonus]
  if (usesMvpScoring) modifiers.push(score.mvpBonus ?? 0)
  const formulaLabel = [
    `Calcolo: ${fantasyNumber(score.baseRating)}`,
    ...modifiers.map(fantasyModifier),
    `uguale ${fantasyNumber(score.fantasyScore)}`,
  ].join(' ')

  return (
    <div className={`fantasy-player-score ${expanded ? 'is-expanded' : ''}`}>
      <button
        className="fantasy-player-score__toggle"
        type="button"
        aria-expanded={expanded}
        aria-controls={detailId}
        aria-label={`${expanded ? 'Nascondi' : 'Mostra'} il calcolo del punteggio di ${playerName}`}
        onClick={() => setExpanded((current) => !current)}
      >
        <PlayerAvatar player={score} members={members} />
        <span className="fantasy-player-score__identity">
          <strong>{playerName}</strong>
          <small>
            {usesFeedbackScoring
              ? feedbackSource(score)
              : usesMvpScoring
              ? `Base ${fantasyNumber(score.baseRating)} · ${mvpVoteSource(score)}`
              : `Pagella ${fantasyNumber(score.baseRating)}${score.usedDefaultRating ? ' d’ufficio' : ''}`}
          </small>
        </span>
        <strong className="fantasy-player-score__total">{fantasyNumber(score.fantasyScore)}</strong>
        {(score.isTopPerformer || score.isMvp) && (
          <Sparkles size={15} aria-label={score.isTopPerformer ? 'Miglior giudizio medio' : 'MVP'} />
        )}
        <ChevronDown className="fantasy-player-score__chevron" size={16} aria-hidden="true" />
      </button>

      {expanded && (
        <div
          className="fantasy-player-score__details"
          id={detailId}
          role="region"
          aria-label={`Calcolo punteggio di ${playerName}`}
        >
          <p className="fantasy-player-score__formula" aria-label={formulaLabel}>
            <span>{fantasyNumber(score.baseRating)}</span>
            <small>{fantasyModifier(score.resultBonus)}</small>
            <small>{fantasyModifier(score.differenceBonus)}</small>
            {usesMvpScoring && <small>{fantasyModifier(score.mvpBonus ?? 0)}</small>}
            <em>=</em>
            <strong>{fantasyNumber(score.fantasyScore)}</strong>
          </p>
          <dl>
            <div>
              <dt>
                {usesFeedbackScoring ? 'Giudizio base' : usesMvpScoring ? 'Base comune' : 'Voto base'}
                <small>
                  {usesFeedbackScoring
                    ? feedbackSource(score)
                    : usesMvpScoring ? 'Uguale per tutti i titolari' : ratingSource(score)}
                </small>
              </dt>
              <dd>{fantasyNumber(score.baseRating)}</dd>
            </div>
            <div>
              <dt>Bilancio set<small>{setRecord(score)}</small></dt>
              <dd>{fantasyModifier(score.resultBonus)}</dd>
            </div>
            <div>
              <dt>Bonus differenza game<small>Differenza totale {fantasyModifier(score.gameDifference)}</small></dt>
              <dd>{fantasyModifier(score.differenceBonus)}</dd>
            </div>
            {usesMvpScoring && (
              <div>
                <dt>Bonus MVP<small>{mvpVoteSource(score)}</small></dt>
                <dd>{fantasyModifier(score.mvpBonus ?? 0)}</dd>
              </div>
            )}
          </dl>
          <footer>
            <span>Totale FantaBandeja</span>
            <strong>{fantasyNumber(score.fantasyScore)}</strong>
          </footer>
        </div>
      )}
    </div>
  )
}

function Leaderboard({
  rows,
  user,
  members,
}: {
  rows: FantasyLeaderboardRow[]
  user: SessionUser
  members: MemberProfile[]
}) {
  return (
    <section className="fantasy-leaderboard" aria-labelledby="fantasy-leaderboard-title">
      <header>
        <div>
          <p className="eyebrow">Campionato</p>
          <h2 id="fantasy-leaderboard-title">Classifica generale</h2>
        </div>
        <Trophy size={25} />
      </header>
      {rows.length > 0 ? (
        <ol>
          {rows.map((row) => (
            <LeaderboardRow
              key={row.managerId}
              row={row}
              isCurrentUser={row.managerId === user.id}
              displayName={resolveMemberName(members, row.managerId, row.managerName)}
            />
          ))}
        </ol>
      ) : (
        <p className="fantasy-leaderboard__empty">La classifica nascerà con il primo round calcolato.</p>
      )}
    </section>
  )
}

function contributionLabel(contribution: FantasyLeaderboardContribution): string {
  if (contribution.source === 'top-performer') return 'Miglior giudizio medio · bonus presenza'
  if (contribution.source === 'mvp') return 'MVP in campo · bonus presenza'
  if (contribution.source === 'starter') return 'Titolare in campo · bonus presenza'
  return `${contribution.rank}° posto · ${fantasyNumber(contribution.rawFantasyPoints)} fantasy pt`
}

function LeaderboardRow({
  row,
  isCurrentUser,
  displayName,
}: {
  row: FantasyLeaderboardRow
  isCurrentUser: boolean
  displayName: string
}) {
  const [expanded, setExpanded] = useState(false)
  const detailsId = `fantasy-leaderboard-details-${row.managerId.replace(/[^a-zA-Z0-9_-]/g, '-')}`

  return (
    <li className={`fantasy-leaderboard__row${isCurrentUser ? ' is-mine' : ''}${expanded ? ' is-expanded' : ''}`}>
      <button
        className="fantasy-leaderboard__toggle"
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        aria-label={`${expanded ? 'Nascondi' : 'Mostra'} dettaglio punti di ${displayName}`}
        onClick={() => setExpanded((value) => !value)}
      >
        <strong>{row.rank}</strong>
        <span className="fantasy-leaderboard__identity">
          <span>
            <strong>{displayName}</strong>
            {isCurrentUser && <small>Tu</small>}
          </span>
          <small>{row.wins} vittorie · {row.roundsPlayed} round · {fantasyNumber(row.rawFantasyPoints)} fantasy pt</small>
        </span>
        <strong>{row.leaguePoints}<small>pt</small></strong>
        <ChevronDown className="fantasy-leaderboard__chevron" size={18} aria-hidden="true" />
      </button>
      {expanded && (
        <div
          id={detailsId}
          className="fantasy-leaderboard__details"
          role="region"
          aria-label={`Dettaglio punti di ${displayName}`}
        >
          <p className="fantasy-leaderboard__sum">
            <span>Totale campionato</span>
            <strong>{row.contributions.map(({ leaguePoints }) => leaguePoints).join(' + ')} = {row.leaguePoints} pt</strong>
          </p>
          <ul>
            {row.contributions.map((contribution) => (
              <li key={`${contribution.roundId}:${contribution.source}`}>
                <CalendarDays size={18} aria-hidden="true" />
                <span>
                  <strong>{sentenceCase(matchFormatter.format(new Date(contribution.playedAt)))}</strong>
                  <small>{contribution.pollTitle} · {contributionLabel(contribution)}</small>
                </span>
                <strong>+{contribution.leaguePoints} pt</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

export function FantasyBandejaPage({
  rounds,
  ownEntries,
  roundEntries,
  members,
  user,
  now,
  loading,
  error,
  onBack,
  onRetry,
  onSave,
}: FantasyBandejaPageProps) {
  const [rulesOpen, setRulesOpen] = useState(false)
  const [selectedView, setSelectedView] = useState<FantasyView | null>(null)
  const [visibleResultCount, setVisibleResultCount] = useState(INITIAL_VISIBLE_RESULTS)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const visibleRounds = useMemo(
    () => rounds.filter((round) => round.status !== 'pending'),
    [rounds],
  )
  const orderedRounds = useMemo(
    () => [...visibleRounds].sort((left, right) => left.locksAt - right.locksAt),
    [visibleRounds],
  )
  const openRounds = orderedRounds.filter((round) => round.status === 'open' && now < round.locksAt)
  const lockedRounds = orderedRounds.filter((round) => round.status === 'open' && now >= round.locksAt)
  const finishedRounds = [...orderedRounds]
    .filter((round) => round.status === 'scored' || round.status === 'void')
    .sort((left, right) => right.locksAt - left.locksAt)
  const leaderboard = getFantasyLeaderboard(visibleRounds)
  const resultRoundsCount = lockedRounds.length + finishedRounds.length
  const visibleFinishedRounds = finishedRounds.slice(0, visibleResultCount)
  const remainingResultsCount = Math.max(0, finishedRounds.length - visibleFinishedRounds.length)
  const defaultView: FantasyView = openRounds.length > 0
    ? 'play'
    : resultRoundsCount > 0
      ? 'results'
      : 'leaderboard'
  const activeView = selectedView ?? defaultView

  const chooseView = (view: FantasyView) => setSelectedView(view)
  const focusViewTab = (view: FantasyView) => {
    chooseView(view)
    tabRefs.current[FANTASY_VIEWS.indexOf(view)]?.focus()
  }
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, view: FantasyView) => {
    const currentIndex = FANTASY_VIEWS.indexOf(view)
    let targetIndex: number | null = null

    if (event.key === 'ArrowRight') targetIndex = (currentIndex + 1) % FANTASY_VIEWS.length
    if (event.key === 'ArrowLeft') targetIndex = (currentIndex - 1 + FANTASY_VIEWS.length) % FANTASY_VIEWS.length
    if (event.key === 'Home') targetIndex = 0
    if (event.key === 'End') targetIndex = FANTASY_VIEWS.length - 1
    if (targetIndex === null) return

    event.preventDefault()
    focusViewTab(FANTASY_VIEWS[targetIndex])
  }

  return (
    <main className="dashboard fantasy-page">
      <button className="button button--ghost fantasy-page__back" type="button" onClick={onBack}>
        <ArrowLeft size={18} /> Torna alla bacheca
      </button>

      <section className="fantasy-hero">
        <div>
          <p className="eyebrow">Il fantasy del gruppo</p>
          <h1>
            <span className="fantasy-hero__title-main">Fanta</span>
            <span className="fantasy-hero__title-accent">Bandeja</span>
          </h1>
          <p className="fantasy-hero__intro">
            Scegli la coppia. Affida la fascia. Prenditi la gloria senza nemmeno
            entrare in campo.
          </p>
          <button
            className="fantasy-hero__rules-button"
            type="button"
            onClick={() => setRulesOpen(true)}
          >
            <BookOpenText size={18} />
            Come si gioca
          </button>
        </div>
        <div className="fantasy-hero__mark" aria-hidden="true">
          <Trophy size={44} />
          <span>FB</span>
        </div>
      </section>

      {rulesOpen && <FantasyRulesModal onClose={() => setRulesOpen(false)} />}

      <nav className="fantasy-hub-nav" aria-label="Sezioni FantaBandeja" role="tablist">
        <button
          ref={(node) => { tabRefs.current[0] = node }}
          id="fantasy-tab-play"
          type="button"
          role="tab"
          aria-selected={activeView === 'play'}
          aria-controls="fantasy-panel-play"
          tabIndex={activeView === 'play' ? 0 : -1}
          className={activeView === 'play' ? 'is-active' : ''}
          onClick={() => chooseView('play')}
          onKeyDown={(event) => handleTabKeyDown(event, 'play')}
        >
          <CalendarDays size={20} />
          <span><strong>Partite</strong><small>Formazioni aperte</small></span>
          <em aria-label={`${openRounds.length} formazioni aperte`}>{openRounds.length}</em>
        </button>
        <button
          ref={(node) => { tabRefs.current[1] = node }}
          id="fantasy-tab-leaderboard"
          type="button"
          role="tab"
          aria-selected={activeView === 'leaderboard'}
          aria-controls="fantasy-panel-leaderboard"
          tabIndex={activeView === 'leaderboard' ? 0 : -1}
          className={activeView === 'leaderboard' ? 'is-active' : ''}
          onClick={() => chooseView('leaderboard')}
          onKeyDown={(event) => handleTabKeyDown(event, 'leaderboard')}
        >
          <Trophy size={20} />
          <span><strong>Classifica</strong><small>Campionato</small></span>
          <em>{leaderboard.length}</em>
        </button>
        <button
          ref={(node) => { tabRefs.current[2] = node }}
          id="fantasy-tab-results"
          type="button"
          role="tab"
          aria-selected={activeView === 'results'}
          aria-controls="fantasy-panel-results"
          tabIndex={activeView === 'results' ? 0 : -1}
          className={activeView === 'results' ? 'is-active' : ''}
          onClick={() => chooseView('results')}
          onKeyDown={(event) => handleTabKeyDown(event, 'results')}
        >
          <ShieldCheck size={20} />
          <span><strong>Risultati</strong><small>In calcolo e conclusi</small></span>
          <em>{resultRoundsCount}</em>
        </button>
      </nav>

      {loading ? (
        <div className="loading-state"><span /><p>Prepariamo il tabellone fantasy…</p></div>
      ) : error ? (
        <div className="fantasy-page__error" role="alert">
          <CircleAlert size={24} />
          <div>
            <strong>FantaBandeja non disponibile</strong>
            <p>{error}</p>
            <div className="fantasy-page__error-actions">
              <button className="button button--primary" type="button" onClick={onRetry}>Riprova</button>
              <button className="button button--ghost" type="button" onClick={onBack}>Torna alla bacheca</button>
            </div>
          </div>
        </div>
      ) : visibleRounds.length === 0 ? (
        <section className="fantasy-empty">
          <Trophy size={34} />
          <p className="eyebrow">Spogliatoi ancora vuoti</p>
          <h2>Il prossimo round nasce con una partita prenotata.</h2>
          <p>Servono quattro titolari registrati e il campo confermato. Appena ci sono, potrai schierare la coppia.</p>
        </section>
      ) : (
        <>
          {activeView === 'play' && (
            <div
              id="fantasy-panel-play"
              className="fantasy-view"
              role="tabpanel"
              aria-labelledby="fantasy-tab-play"
            >
              {openRounds.length === 0 ? (
                <section className="fantasy-empty fantasy-empty--section">
                  <CalendarDays size={34} />
                  <p className="eyebrow">Nessuna formazione aperta</p>
                  <h2>Non ci sono coppie da schierare.</h2>
                  <p>I round già iniziati passano nei Risultati; la prossima formazione comparirà qui.</p>
                </section>
              ) : (
                <section className="fantasy-section" aria-labelledby="fantasy-open-title">
                  <header className="fantasy-section__heading">
                    <div><p className="eyebrow">Mercato aperto</p><h2 id="fantasy-open-title">Schiera la coppia</h2></div>
                    <strong>{openRounds.length}</strong>
                  </header>
                  <div className="fantasy-round-list">
                    {openRounds.map((round) => (
                      <FantasyRoundCard
                        key={`${round.id}:${round.rosterKey}:${round.locksAt}:${ownEntries[round.id]?.updatedAt ?? 0}`}
                        round={round}
                        savedEntry={ownEntries[round.id]}
                        members={members}
                        user={user}
                        now={now}
                        onSave={onSave}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {activeView === 'leaderboard' && (
            <div
              id="fantasy-panel-leaderboard"
              className="fantasy-view"
              role="tabpanel"
              aria-labelledby="fantasy-tab-leaderboard"
            >
              <Leaderboard rows={leaderboard} user={user} members={members} />
            </div>
          )}

          {activeView === 'results' && (
            <div
              id="fantasy-panel-results"
              className="fantasy-view"
              role="tabpanel"
              aria-labelledby="fantasy-tab-results"
            >
              {resultRoundsCount > 0 ? (
                <>
                  {lockedRounds.length > 0 && (
                    <section className="fantasy-section" aria-labelledby="fantasy-locked-title">
                      <header className="fantasy-section__heading">
                        <div><p className="eyebrow">Risultato in corso</p><h2 id="fantasy-locked-title">Round in calcolo</h2></div>
                        <LockKeyhole size={22} />
                      </header>
                      <div className="fantasy-round-list fantasy-round-list--compact">
                        {lockedRounds.map((round) => (
                          <LockedRound
                            key={round.id}
                            round={round}
                            entries={roundEntries[round.id]}
                            members={members}
                            user={user}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {finishedRounds.length > 0 && (
                    <section className="fantasy-section" aria-labelledby="fantasy-results-title">
                      <header className="fantasy-section__heading">
                        <div><p className="eyebrow">Archivio</p><h2 id="fantasy-results-title">Risultati dei round</h2></div>
                        <strong>{finishedRounds.length}</strong>
                      </header>
                      <div className="fantasy-round-list fantasy-round-list--compact">
                        {visibleFinishedRounds.map((round, index) => (
                          <RoundResult
                            key={round.id}
                            round={round}
                            members={members}
                            user={user}
                            defaultExpanded={index === 0}
                          />
                        ))}
                      </div>
                      {remainingResultsCount > 0 && (
                        <button
                          className="button button--ghost fantasy-results__more"
                          type="button"
                          onClick={() => setVisibleResultCount((count) => count + INITIAL_VISIBLE_RESULTS)}
                        >
                          Mostra altri {Math.min(INITIAL_VISIBLE_RESULTS, remainingResultsCount)} round
                        </button>
                      )}
                    </section>
                  )}
                </>
              ) : (
                <section className="fantasy-empty fantasy-empty--section">
                  <ShieldCheck size={34} />
                  <p className="eyebrow">Archivio vuoto</p>
                  <h2>Nessun round è ancora terminato.</h2>
                  <p>Risultati, formazioni e dettaglio dei punteggi appariranno qui dopo il calcolo.</p>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </main>
  )
}
