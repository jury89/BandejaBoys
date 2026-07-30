import { useMemo, useState, type FormEvent } from 'react'
import { CalendarCheck2, Check, ClipboardList, Plus, Trash2 } from 'lucide-react'
import {
  getMatchPairings,
  matchSetInputsError,
  MAX_MATCH_SETS,
  MAX_MATCH_SET_SCORE,
} from '../lib/domain'
import { slotDateParts } from '../lib/format'
import type { MatchPairing, MatchSetInput, PlayerMatch } from '../types'
import { Modal } from './Modal'

interface MatchReportModalProps {
  match: PlayerMatch
  onClose: () => void
  onSave: (sets: MatchSetInput[]) => Promise<void>
}

interface SetDraft {
  id: string
  pairingIndex: number
  scoreA: string
  scoreB: string
}

function sameTeam(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((userId) => right.includes(userId))
}

function draftsFromMatch(match: PlayerMatch, pairings: MatchPairing[]): SetDraft[] {
  if (!match.report) {
    return [{ id: 'set-1', pairingIndex: 0, scoreA: '', scoreB: '' }]
  }

  return match.report.sets.map((set, index) => {
    const teamAIds = set.teamA.map((player) => player.userId)
    const pairingIndex = pairings.findIndex((pairing) => (
      sameTeam(teamAIds, pairing.teamA.map((player) => player.userId))
    ))
    return {
      id: set.id || `set-${index + 1}`,
      pairingIndex: Math.max(pairingIndex, 0),
      scoreA: String(set.scoreA),
      scoreB: String(set.scoreB),
    }
  })
}

function teamLabel(team: MatchPairing['teamA']): string {
  return team.map((player) => player.displayName).join(' + ')
}

function updatedLabel(timestamp: number): string {
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Rome',
  }).format(timestamp)
}

function saveErrorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  if (/permission-denied|insufficient permissions/i.test(message)) {
    return 'Non hai i permessi per salvare questo referto. Aggiorna l’app e riprova.'
  }
  return reason instanceof Error ? reason.message : 'Non siamo riusciti a salvare il referto.'
}

export function MatchReportModal({ match, onClose, onSave }: MatchReportModalProps) {
  const pairings = useMemo(() => getMatchPairings(match.slot), [match.slot])
  const [sets, setSets] = useState<SetDraft[]>(() => draftsFromMatch(match, pairings))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const date = slotDateParts(match.slot.startsAt)

  const updateSet = (id: string, update: Partial<SetDraft>) => {
    setSets((current) => current.map((set) => set.id === id ? { ...set, ...update } : set))
    setError(null)
  }

  const addSet = () => {
    if (sets.length >= MAX_MATCH_SETS || pairings.length === 0) return
    setSets((current) => [
      ...current,
      {
        id: `set-${current.length + 1}`,
        pairingIndex: current.length % pairings.length,
        scoreA: '',
        scoreB: '',
      },
    ])
    setError(null)
  }

  const removeSet = (id: string) => {
    if (sets.length <= 1) return
    setSets((current) => current
      .filter((set) => set.id !== id)
      .map((set, index) => ({ ...set, id: `set-${index + 1}` })))
    setError(null)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (busy) return

    if (pairings.length !== 3) {
      setError('Servono esattamente quattro titolari per compilare il referto.')
      return
    }
    if (sets.some((set) => set.scoreA.trim() === '' || set.scoreB.trim() === '')) {
      setError('Inserisci entrambi i punteggi per ogni set.')
      return
    }

    const inputs = sets.map((set) => ({
      teamAUserIds: pairings[set.pairingIndex].teamA.map((player) => player.userId) as [
        string,
        string,
      ],
      scoreA: Number(set.scoreA),
      scoreB: Number(set.scoreB),
    }))
    const inputError = matchSetInputsError(match.slot, inputs)
    if (inputError) {
      setError(inputError)
      return
    }

    setBusy(true)
    setError(null)
    void onSave(inputs).catch((reason) => {
      setError(saveErrorMessage(reason))
      setBusy(false)
    })
  }

  return (
    <Modal
      title={match.report ? 'Modifica il referto' : 'Com’è finita?'}
      eyebrow="Risultato della partita"
      size="wide"
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <form className="match-report-form" onSubmit={submit}>
        <div className="match-report-form__intro">
          <span aria-hidden="true"><ClipboardList size={24} /></span>
          <div>
            <strong>{match.pollTitle}</strong>
            <p><CalendarCheck2 size={15} /> {date.full} · {date.time}</p>
          </div>
        </div>

        <div className="match-report-form__heading">
          <div>
            <p className="eyebrow">Set giocati</p>
            <h3>Componi le coppie e segna il risultato</h3>
          </div>
          <span>{sets.length}/{MAX_MATCH_SETS}</span>
        </div>

        <div className="match-report-form__sets">
          {sets.map((set, index) => {
            const pairing = pairings[set.pairingIndex] ?? pairings[0]
            return (
              <fieldset className="match-set-editor" key={set.id}>
                <legend className="sr-only">Set {index + 1}</legend>
                <header className="match-set-editor__header">
                  <div>
                    <span>0{index + 1}</span>
                    <strong>Set {index + 1}</strong>
                  </div>
                  <button
                    className="icon-button match-set-editor__remove"
                    type="button"
                    disabled={sets.length === 1 || busy}
                    aria-label={`Rimuovi set ${index + 1}`}
                    onClick={() => removeSet(set.id)}
                  >
                    <Trash2 size={17} />
                  </button>
                </header>

                <label className="field match-set-editor__pairing">
                  <span>Coppie in campo</span>
                  <select
                    value={set.pairingIndex}
                    disabled={busy}
                    aria-label={`Coppie del set ${index + 1}`}
                    onChange={(event) => updateSet(set.id, {
                      pairingIndex: Number(event.target.value),
                    })}
                  >
                    {pairings.map((option, optionIndex) => (
                      <option key={teamLabel(option.teamA)} value={optionIndex}>
                        {teamLabel(option.teamA)} — {teamLabel(option.teamB)}
                      </option>
                    ))}
                  </select>
                </label>

                {pairing && (
                  <div className="match-set-scoreboard">
                    <div className="match-set-scoreboard__team">
                      <small>Coppia A</small>
                      <strong>{teamLabel(pairing.teamA)}</strong>
                    </div>
                    <label className="match-set-scoreboard__score">
                      <span className="sr-only">Punteggio {teamLabel(pairing.teamA)}, set {index + 1}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max={MAX_MATCH_SET_SCORE}
                        step="1"
                        value={set.scoreA}
                        disabled={busy}
                        aria-label={`Punteggio ${teamLabel(pairing.teamA)}, set ${index + 1}`}
                        onChange={(event) => updateSet(set.id, { scoreA: event.target.value })}
                      />
                    </label>
                    <span className="match-set-scoreboard__divider" aria-hidden="true">—</span>
                    <label className="match-set-scoreboard__score">
                      <span className="sr-only">Punteggio {teamLabel(pairing.teamB)}, set {index + 1}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max={MAX_MATCH_SET_SCORE}
                        step="1"
                        value={set.scoreB}
                        disabled={busy}
                        aria-label={`Punteggio ${teamLabel(pairing.teamB)}, set ${index + 1}`}
                        onChange={(event) => updateSet(set.id, { scoreB: event.target.value })}
                      />
                    </label>
                    <div className="match-set-scoreboard__team match-set-scoreboard__team--right">
                      <small>Coppia B</small>
                      <strong>{teamLabel(pairing.teamB)}</strong>
                    </div>
                  </div>
                )}
              </fieldset>
            )
          })}
        </div>

        <button
          className="button button--ghost match-report-form__add"
          type="button"
          disabled={sets.length >= MAX_MATCH_SETS || pairings.length === 0 || busy}
          onClick={addSet}
        >
          <Plus size={18} /> Aggiungi set
        </button>

        {match.report && (
          <p className="match-report-form__audit">
            Ultima modifica di <strong>{match.report.updatedByName}</strong> · {updatedLabel(match.report.updatedAt)}
          </p>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal__actions match-report-form__actions">
          <button className="button button--ghost" type="button" disabled={busy} onClick={onClose}>
            Annulla
          </button>
          <button className="button button--primary" type="submit" disabled={busy || pairings.length !== 3}>
            <Check size={18} /> {busy ? 'Salvataggio…' : match.report ? 'Aggiorna referto' : 'Salva referto'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
