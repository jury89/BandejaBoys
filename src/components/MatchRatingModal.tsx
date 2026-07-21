import { useState, type FormEvent } from 'react'
import { CalendarCheck2, Check, Trophy } from 'lucide-react'
import type { MatchRatingPrompt, MatchRatingSubmission } from '../types'
import { padelDateTimeToTimestamp } from '../lib/domain'
import { Modal } from './Modal'
import { ProfileAvatar } from './ProfileAvatar'

interface MatchRatingModalProps {
  prompt: MatchRatingPrompt
  onDismiss: () => Promise<void>
  onSubmit: (submissions: MatchRatingSubmission[]) => Promise<void>
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

export function MatchRatingModal({ prompt, onDismiss, onSubmit }: MatchRatingModalProps) {
  const [scores, setScores] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isComplete = prompt.teammates.every((teammate) => scores[teammate.userId])

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
    if (!isComplete || busy) return
    setBusy(true)
    setError(null)
    const submissions = prompt.teammates.map((teammate) => ({
      ...teammate,
      score: scores[teammate.userId],
    }))
    void onSubmit(submissions).catch((reason) => {
      setError(reason instanceof Error ? reason.message : 'Non siamo riusciti a salvare i voti.')
      setBusy(false)
    })
  }

  return (
    <Modal title="Com’è andata in campo?" eyebrow="Pagelle post partita" size="wide" onClose={dismiss}>
      <form className="match-rating" onSubmit={submit}>
        <div className="match-rating__intro">
          <span className="match-rating__trophy" aria-hidden="true"><Trophy size={24} /></span>
          <div>
            <p>Valuta la prestazione dei tuoi tre compagni.</p>
            <span><CalendarCheck2 size={15} /> {sessionLabel(prompt.sessionStartsAt)}</span>
          </div>
        </div>

        <div className="match-rating__players">
          {prompt.teammates.map((teammate, index) => (
            <fieldset className="rating-player" key={teammate.userId}>
              <legend className="sr-only">Voto per {teammate.displayName}</legend>
              <div className="rating-player__identity">
                <span className="rating-player__number">0{index + 1}</span>
                <ProfileAvatar className="rating-player__avatar" displayName={teammate.displayName} decorative />
                <strong>{teammate.displayName}</strong>
                <span className={scores[teammate.userId] ? 'rating-player__score is-set' : 'rating-player__score'}>
                  {scores[teammate.userId] ?? '—'}
                </span>
              </div>
              <div className="rating-scale" role="group" aria-label={`Voto per ${teammate.displayName}`}>
                {Array.from({ length: 10 }, (_, scoreIndex) => scoreIndex + 1).map((score) => (
                  <button
                    key={score}
                    className={scores[teammate.userId] === score ? 'is-selected' : ''}
                    type="button"
                    aria-label={`Dai ${score} a ${teammate.displayName}`}
                    aria-pressed={scores[teammate.userId] === score}
                    onClick={() => setScores((current) => ({ ...current, [teammate.userId]: score }))}
                  >
                    {score}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
        </div>

        <p className="match-rating__privacy">I voti vengono salvati nello storico della partita. Se chiudi, questa scheda non comparirà più.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal__actions match-rating__actions">
          <button className="button button--ghost" type="button" disabled={busy} onClick={dismiss}>Salta definitivamente</button>
          <button className="button button--primary" type="submit" disabled={!isComplete || busy}>
            <Check size={18} /> {busy ? 'Salvataggio…' : 'Salva i voti'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
