import { useState, type FormEvent } from 'react'
import { Bird, CalendarCheck2, Check, FlaskConical, Heart, Send } from 'lucide-react'
import type { MatchFeedbackLevel, MatchFeedbackPrompt } from '../types'
import { MATCH_FEEDBACK_LEVELS, padelDateTimeToTimestamp } from '../lib/domain'
import { Modal } from './Modal'
import { ProfileAvatar } from './ProfileAvatar'

interface MatchFeedbackModalProps {
  prompt: MatchFeedbackPrompt
  testMode?: boolean
  onDismiss: () => Promise<void>
  onSubmit: (ratings: Array<{ playerId: string; level: MatchFeedbackLevel }>) => Promise<void>
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

export function MatchFeedbackModal({
  prompt,
  testMode = false,
  onDismiss,
  onSubmit,
}: MatchFeedbackModalProps) {
  const [levelsByPlayer, setLevelsByPlayer] = useState<Record<string, MatchFeedbackLevel>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectedCount = prompt.candidates.filter((candidate) => levelsByPlayer[candidate.userId]).length
  const isComplete = selectedCount === prompt.candidates.length

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
    void onSubmit(prompt.candidates.map((candidate) => ({
      playerId: candidate.userId,
      level: levelsByPlayer[candidate.userId],
    }))).catch((reason) => {
      setError(reason instanceof Error ? reason.message : 'Non siamo riusciti a salvare i giudizi.')
      setBusy(false)
    })
  }

  return (
    <Modal
      title="Apri la voliera"
      eyebrow={testMode ? 'Collaudo giudizi · TEST' : 'Giudizi del match'}
      size="wide"
      onClose={dismiss}
    >
      <form className="match-feedback" onSubmit={submit}>
        {testMode && (
          <p className="match-feedback__test-note">
            <FlaskConical size={17} /> Modalità TEST: puoi completare tutto, ma nulla verrà salvato.
          </p>
        )}
        <div className="match-feedback__intro">
          <span className="match-feedback__bird" aria-hidden="true"><Bird size={25} /></span>
          <div>
            <p>Assegna a ogni compagno il volatile che si è meritato.</p>
            <span><CalendarCheck2 size={15} /> {sessionLabel(prompt.sessionStartsAt)}</span>
          </div>
          <strong>{selectedCount}/{prompt.candidates.length}</strong>
        </div>

        <p className="match-feedback__generosity">
          <Heart size={17} aria-hidden="true" />
          <span><strong>Sii generoso.</strong> Nel dubbio, scegli il volatile più alto.</span>
        </p>

        <div className="match-feedback__players">
          {prompt.candidates.map((candidate, candidateIndex) => (
            <fieldset className="feedback-player" key={candidate.userId}>
              <legend>
                <span className="feedback-player__number">0{candidateIndex + 1}</span>
                <ProfileAvatar
                  className="feedback-player__avatar"
                  displayName={candidate.displayName}
                  decorative
                />
                <span><small>Compagno</small><strong>{candidate.displayName}</strong></span>
                {levelsByPlayer[candidate.userId] && <Check size={20} aria-label="Giudizio scelto" />}
              </legend>
              <div className="feedback-ladder">
                {MATCH_FEEDBACK_LEVELS.map((definition) => {
                  const selected = levelsByPlayer[candidate.userId] === definition.level
                  return (
                    <label
                      className={`feedback-level feedback-level--${definition.level}${selected ? ' is-selected' : ''}`}
                      key={definition.level}
                    >
                      <input
                        type="radio"
                        name={`feedback-${candidate.userId}`}
                        value={definition.level}
                        checked={selected}
                        onChange={() => setLevelsByPlayer((current) => ({
                          ...current,
                          [candidate.userId]: definition.level,
                        }))}
                      />
                      <span className="feedback-level__marker" aria-hidden="true">
                        {selected ? <Check size={17} /> : <Bird size={17} />}
                      </span>
                      <span className="feedback-level__copy">
                        <strong>{definition.label}</strong>
                        <small>{definition.description}</small>
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          ))}
        </div>

        <p className="match-feedback__privacy">
          {testMode
            ? 'Puoi chiudere o completare questa prova: non modificherà partite, giudizi o FantaBandeja.'
            : 'I giudizi vengono salvati nello storico della partita. Se chiudi, questa scheda non comparirà più.'}
        </p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal__actions match-feedback__actions">
          <button className="button button--ghost" type="button" disabled={busy} onClick={dismiss}>
            {testMode ? 'Chiudi il test' : 'Salta definitivamente'}
          </button>
          <button className="button button--primary" type="submit" disabled={!isComplete || busy}>
            <Send size={18} /> {busy ? 'Salvataggio…' : testMode ? 'Completa il test' : 'Salva i giudizi'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
