import { useState, type FormEvent } from 'react'
import { Clock3, UserRoundPlus } from 'lucide-react'
import type { PadelSlot, SignupRole } from '../types'
import { getStarters, guestNameError, MAX_STARTERS } from '../lib/domain'
import { Modal } from './Modal'

interface GuestPlayerModalProps {
  slot: PadelSlot
  onClose: () => void
  onAdd: (displayName: string, role: SignupRole) => Promise<void>
  onDone: (message: string) => void
}

export function GuestPlayerModal({
  slot,
  onClose,
  onAdd,
  onDone,
}: GuestPlayerModalProps) {
  const starterCount = getStarters(slot).length
  const starterPlacesAvailable = starterCount < MAX_STARTERS
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<SignupRole>(starterPlacesAvailable ? 'starter' : 'reserve')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const validationError = guestNameError(displayName)
    if (validationError) {
      setError(validationError)
      return
    }

    setBusy(true)
    setError('')
    try {
      await onAdd(displayName, role)
      onDone(
        role === 'starter'
          ? `${displayName.trim()} è stato aggiunto tra i titolari.`
          : `${displayName.trim()} è stato aggiunto alle riserve.`,
      )
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Non è stato possibile aggiungere l’ospite.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Porta un amico" eyebrow="Giocatore ospite" onClose={onClose}>
      <form className="form-stack guest-player-form" onSubmit={submit}>
        <div className="guest-player-form__intro">
          <span aria-hidden="true"><UserRoundPlus size={22} /></span>
          <p>
            Inseriscilo nello slot senza creare un account. Potrà giocare, ma non riceverà
            notifiche e non comparirà nelle pagelle.
          </p>
        </div>

        <label className={`field ${error ? 'field--error' : ''}`}>
          <span>Nome dell’ospite</span>
          <input
            autoFocus
            type="text"
            value={displayName}
            maxLength={40}
            placeholder="Es. Ciccio"
            autoComplete="off"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'guest-name-error' : undefined}
            onChange={(event) => {
              setDisplayName(event.target.value)
              if (error) setError('')
            }}
          />
        </label>
        {error && (
          <p className="form-message form-message--error guest-player-form__error" id="guest-name-error" role="alert">
            {error}
          </p>
        )}

        <fieldset className="guest-role-picker">
          <legend>Come lo segni?</legend>
          <label className={role === 'starter' ? 'is-selected' : ''}>
            <input
              type="radio"
              name="guest-role"
              value="starter"
              checked={role === 'starter'}
              disabled={!starterPlacesAvailable}
              onChange={() => setRole('starter')}
            />
            <span className="guest-role-picker__icon" aria-hidden="true"><UserRoundPlus size={18} /></span>
            <span>
              <strong>Titolare</strong>
              <small>
                {starterPlacesAvailable ? `${starterCount}/4 occupati` : '4/4 completi'}
              </small>
            </span>
          </label>
          <label className={role === 'reserve' ? 'is-selected' : ''}>
            <input
              type="radio"
              name="guest-role"
              value="reserve"
              checked={role === 'reserve'}
              onChange={() => setRole('reserve')}
            />
            <span className="guest-role-picker__icon" aria-hidden="true"><Clock3 size={18} /></span>
            <span>
              <strong>Riserva</strong>
              <small>In lista d’attesa</small>
            </span>
          </label>
        </fieldset>

        <footer className="modal__actions">
          <button className="button button--ghost" type="button" onClick={onClose}>Annulla</button>
          <button className="button button--primary" type="submit" disabled={busy}>
            <UserRoundPlus size={18} /> {busy ? 'Aggiunta…' : 'Aggiungi ospite'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
