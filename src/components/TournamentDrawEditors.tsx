import { useState, type FormEvent } from 'react'
import type { MemberProfile, SessionUser } from '../types'
import { canEditTournamentRound, editTournamentMatches, tournamentUsesRotatingPairs } from '../lib/domain'
import type { Tournament, TournamentMatch, TournamentScore, TournamentTeam } from '../lib/tournamentTypes'
import { Modal } from './Modal'
import { useTournamentRuntime } from './tournamentRuntime'

function playerName(tournament: Tournament, members: MemberProfile[], id: string): string {
  return members.find(member => member.id === id)?.displayName ?? tournament.registrations[id]?.displayName ?? id
}

function teamFromPlayers(ids: [string, string]): TournamentTeam {
  return { id: JSON.stringify([...ids].sort()), playerIds: ids }
}

export function TournamentTeamsEditor({ tournament, members, user, onClose, onSaved }: {
  tournament: Tournament; members: MemberProfile[]; user: SessionUser; onClose: () => void; onSaved: () => void
}) {
  const { repository, simulation } = useTournamentRuntime()
  const [pairs, setPairs] = useState<Array<[string, string]>>(() => tournament.teams.map(team => [...team.playerIds]))
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const players = Object.keys(tournament.registrations).sort((a, b) => playerName(tournament, members, a).localeCompare(playerName(tournament, members, b), 'it'))
  const update = (index: number, position: number, id: string) => {
    setError('')
    setPairs(current => current.map((pair, pairIndex) => pairIndex === index
      ? pair.map((old, playerIndex) => playerIndex === position ? id : old) as [string, string] : pair))
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await repository.editTournamentTeams(tournament.id, pairs, tournament.drawRevision ?? 0, user)
      onSaved()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Coppie non salvate. Riprova.') }
    finally { setBusy(false) }
  }
  return <Modal title="Modifica coppie sorteggiate" eyebrow={simulation ? 'Simulazione privata · dati fittizi' : 'Tabellone del torneo'} onClose={onClose} size="wide">
    <form className="tournament-form" onSubmit={save}>
      <p>Scegli i due giocatori di ogni coppia. Ogni iscritto deve comparire una sola volta. Le partite useranno le coppie aggiornate, mantenendo turni e campi.</p>
      <div className="tournament-draw-list">{pairs.map((pair, index) => <fieldset className="tournament-draw-item" key={index}>
        <legend>Coppia {index + 1}</legend>
        <div className="tournament-draw-item__fields">{pair.map((id, position) => <label key={position}>Giocatore {position + 1}<select value={id} onChange={event => update(index, position, event.target.value)}>{players.map(playerId => <option key={playerId} value={playerId}>{playerName(tournament, members, playerId)}</option>)}</select></label>)}</div>
      </fieldset>)}</div>
      <p className="tournament-note">La modifica è disponibile prima del primo risultato e dell’avvio del timer. I compagni scelti reciprocamente dai giocatori non si cambiano qui.</p>
      {error && <p role="alert" className="form-error">{error}</p>}
      <button className="button button--primary" disabled={busy}>{busy ? 'Salvataggio…' : 'Salva coppie'}</button>
    </form>
  </Modal>
}

type Side = 'teamA' | 'teamB'
function changeTeam(matches: Record<string, TournamentMatch>, matchId: string, side: Side, team: TournamentTeam): Record<string, TournamentMatch> {
  return { ...matches, [matchId]: { ...matches[matchId], [side]: team } }
}

export function TournamentRoundsEditor({ tournament, scores, members, user, onClose, onSaved }: {
  tournament: Tournament; scores: TournamentScore[]; members: MemberProfile[]; user: SessionUser; onClose: () => void; onSaved: () => void
}) {
  const { repository, simulation } = useTournamentRuntime()
  const [matches, setMatches] = useState<Record<string, TournamentMatch>>(() => ({ ...tournament.matches }))
  const availableRounds = Array.from(new Set(Object.values(tournament.matches).map(match => match.round)))
    .filter(round => canEditTournamentRound(tournament, round, scores, user.id)).sort((a, b) => a - b)
  const [round, setRound] = useState(availableRounds[0] ?? tournament.currentRound)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const rotating = tournamentUsesRotatingPairs(tournament)
  const roundMatches = Object.values(matches).filter(match => match.round === round)
    .sort((a, b) => a.wave - b.wave || a.court - b.court)
  const players = Object.keys(tournament.registrations).sort((a, b) => playerName(tournament, members, a).localeCompare(playerName(tournament, members, b), 'it'))
  const pairName = (team: TournamentTeam) => team.playerIds.map(id => playerName(tournament, members, id)).join(' + ')
  const activeTeams = roundMatches.flatMap(match => [match.teamA, match.teamB])

  function selectTeam(matchId: string, side: Side, teamId: string) {
    setError('')
    setMatches(current => {
      const source = current[matchId][side]
      if (source.id === teamId) return current
      const destination = Object.values(current).filter(match => match.round === round)
        .flatMap(match => ([{ matchId: match.id, side: 'teamA' as const, team: match.teamA }, { matchId: match.id, side: 'teamB' as const, team: match.teamB }]))
        .find(slot => slot.team.id === teamId)
      if (!destination) return current
      return changeTeam(changeTeam(current, matchId, side, destination.team), destination.matchId, destination.side, source)
    })
  }

  function selectPlayer(matchId: string, side: Side, position: number, playerId: string) {
    setError('')
    setMatches(current => {
      const source = current[matchId][side].playerIds[position]
      if (source === playerId) return current
      const destination = Object.values(current).filter(match => match.round === round)
        .flatMap(match => (['teamA', 'teamB'] as const).flatMap(teamSide => match[teamSide].playerIds.map((id, index) => ({ matchId: match.id, side: teamSide, position: index, id }))))
        .find(slot => slot.id === playerId)
      if (!destination) return current
      const replace = (draw: Record<string, TournamentMatch>, id: string, teamSide: Side, index: number, value: string) => {
        const ids = [...draw[id][teamSide].playerIds] as [string, string]
        ids[index] = value
        return changeTeam(draw, id, teamSide, teamFromPlayers(ids))
      }
      // Update the destination first so swaps inside the same pair keep both players.
      return replace(replace(current, destination.matchId, destination.side, destination.position, source), matchId, side, position, playerId)
    })
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      // Show the same domain errors before attempting a write; the repository rechecks in a transaction.
      editTournamentMatches(tournament, matches, scores, user.id, tournament.drawRevision ?? 0)
      await repository.editTournamentMatches(tournament.id, matches, tournament.drawRevision ?? 0, user)
      onSaved()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Turni non salvati. Riprova.') }
    finally { setBusy(false) }
  }

  return <Modal title="Modifica turni e avversari" eyebrow={simulation ? 'Simulazione privata · dati fittizi' : 'Calendario del torneo'} onClose={onClose} size="wide">
    <form className="tournament-form" onSubmit={save}>
      <p>{rotating ? 'Sposta i giocatori tra le partite: selezionando un giocatore, i due si scambiano di posto.' : 'Cambia gli avversari scegliendo una coppia: le due coppie si scambiano di posto nello stesso turno.'} Campo, ondata e identità delle partite restano invariati.</p>
      <label>Turno da modificare<select value={round} onChange={event => { setRound(Number(event.target.value)); setError('') }}>{availableRounds.map(value => <option key={value} value={value}>Turno {value}</option>)}</select></label>
      <div className="tournament-draw-list">{roundMatches.map(match => <fieldset className="tournament-draw-item" key={match.id}>
        <legend>Campo {match.court}{tournament.scoringMode !== 'timed' ? ` · Ondata ${match.wave}` : ''}{match.stage === 'final' ? ' · Finale' : match.stage === 'bronze' ? ' · Finale 3° posto' : ''}</legend>
        <div className="tournament-draw-item__fields">{(['teamA', 'teamB'] as const).map((side, index) => rotating
          ? <div className="tournament-draw-pair" key={side}><strong>Squadra {index + 1}</strong>{match[side].playerIds.map((playerId, position) => <label key={position}>Giocatore {position + 1}<select value={playerId} onChange={event => selectPlayer(match.id, side, position, event.target.value)}>{players.map(id => <option key={id} value={id}>{playerName(tournament, members, id)}</option>)}</select></label>)}</div>
          : <label key={side}>Squadra {index + 1}<select value={match[side].id} onChange={event => selectTeam(match.id, side, event.target.value)}>{activeTeams.map(team => <option key={team.id} value={team.id}>{pairName(team)}</option>)}</select></label>)}</div>
      </fieldset>)}</div>
      <p className="tournament-note">Puoi cambiare solo turni senza risultati e non ancora avviati. Nel girone tutte le coppie devono comunque affrontarsi una volta; se cambi una sfida, può essere necessario sistemare anche un altro turno prima di salvare.</p>
      {error && <p role="alert" className="form-error">{error}</p>}
      <button className="button button--primary" disabled={busy}>{busy ? 'Salvataggio…' : 'Salva turni'}</button>
    </form>
  </Modal>
}
