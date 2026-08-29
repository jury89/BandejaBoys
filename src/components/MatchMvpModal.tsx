import { useState, type FormEvent } from 'react'
import { CalendarCheck2, Check, FlaskConical, Trophy } from 'lucide-react'
import type { MatchMvpPrompt } from '../types'
import { padelDateTimeToTimestamp } from '../lib/domain'
import { Modal } from './Modal'
import { ProfileAvatar } from './ProfileAvatar'

interface MatchMvpModalProps {
  prompt: MatchMvpPrompt
  testMode?: boolean
  onDismiss: () => Promise<void>
  onSubmit: (selectedPlayerId: string) => Promise<void>
}

function sessionLabel(startsAt: string): string {
  const date = new Date(padelDateTimeToTimestamp(startsAt))
  const day = new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Rome',
  }).format(date)
  const time = new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Rome',
  }).format(date)
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${time}`
}

export function MatchMvpModal({ prompt, testMode = false, onDismiss, onSubmit }: MatchMvpModalProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dismiss = () => {
    if (busy) return
    setBusy(true)
    setError(null)
    void onDismiss().catch((reason) => {
      setError(reason instanceof Error ? reason.message : 'Non siamo riusciti a chiudere la scheda.')
      setBusy(false)
    })
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!selectedPlayerId || busy) return
    setBusy(true)
    setError(null)
    void onSubmit(selectedPlayerId).catch((reason) => {
      setError(reason instanceof Error ? reason.message : 'Non siamo riusciti a salvare la scelta MVP.')
      setBusy(false)
    })
  }

  return (
    <Modal
      title="Chi ha fatto la differenza?"
      eyebrow={testMode ? 'Collaudo MVP · TEST' : 'MVP del match'}
      size="wide"
      onClose={dismiss}
    >
      <form className="match-mvp" onSubmit={submit}>
        {testMode && (
          <p className="match-mvp__test-note">
            <FlaskConical size={17} /> Modalità TEST: puoi provare la scelta, ma nessun MVP verrà salvato.
          </p>
        )}
        <div className="match-mvp__intro">
          <span className="match-mvp__trophy" aria-hidden="true"><Trophy size={24} /></span>
          <div>
            <p>Scegli un solo compagno: quello che per te è stato l’MVP della partita.</p>
            <span><CalendarCheck2 size={15} /> {sessionLabel(prompt.sessionStartsAt)}</span>
          </div>
        </div>

        <div className="match-mvp__players" role="radiogroup" aria-label="Scegli l’MVP della partita">
          {prompt.candidates.map((candidate, index) => (
            <button
              className={`mvp-candidate${selectedPlayerId === candidate.userId ? ' is-selected' : ''}`}
              key={candidate.userId}
              type="button"
              role="radio"
              aria-checked={selectedPlayerId === candidate.userId}
              onClick={() => setSelectedPlayerId(candidate.userId)}
            >
              <span className="mvp-candidate__number">0{index + 1}</span>
              <ProfileAvatar className="mvp-candidate__avatar" displayName={candidate.displayName} decorative />
              <span className="mvp-candidate__copy"><small>Compagno</small><strong>{candidate.displayName}</strong></span>
              <span className="mvp-candidate__mark" aria-hidden="true">
                {selectedPlayerId === candidate.userId ? <Check size={20} /> : <Trophy size={20} />}
              </span>
            </button>
          ))}
        </div>

        <p className="match-mvp__privacy">
          {testMode
            ? 'La chiusura e la scelta di questa prova non modificano partite, MVP o storico.'
            : 'La scelta viene salvata nello storico della partita. Se chiudi, questa scheda non comparirà più.'}
        </p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal__actions match-mvp__actions">
          <button className="button button--ghost" type="button" disabled={busy} onClick={dismiss}>
            {testMode ? 'Chiudi il test' : 'Salta definitivamente'}
          </button>
          <button className="button button--primary" type="submit" disabled={!selectedPlayerId || busy}>
            <Trophy size={18} /> {busy ? 'Salvataggio…' : testMode ? 'Completa il test' : 'Conferma MVP'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
