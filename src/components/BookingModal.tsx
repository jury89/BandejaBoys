import { useState, type FormEvent } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { PadelSlot, SessionUser } from '../types'
import { slotDateParts } from '../lib/format'
import { Modal } from './Modal'

interface BookingModalProps {
  slot: PadelSlot
  user: SessionUser
  onClose: () => void
  onSave: (booking: { venue: string; bookedBy: SessionUser }) => Promise<void>
  onDone: (message: string) => void
}

export function BookingModal({ slot, user, onClose, onSave, onDone }: BookingModalProps) {
  const [venue, setVenue] = useState(slot.venue)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const date = slotDateParts(slot.startsAt)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!venue.trim()) {
      setError('Scrivi il nome del circolo o del campo.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSave({ venue, bookedBy: user })
      onDone('Campo segnato come prenotato. Si gioca!')
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Non è stato possibile salvare la prenotazione.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Conferma il campo" eyebrow={`${date.full} · ${date.time}`} onClose={onClose}>
      <form onSubmit={submit} className="form-stack">
        <p className="modal__lead">Una volta salvato, lo slot apparirà a tutti come partita confermata.</p>
        <label className="field">
          <span>Circolo o campo</span>
          <input value={venue} onChange={(event) => setVenue(event.target.value)} placeholder="Es. Padel Club Eur" autoFocus required />
        </label>
        {error && <p className="form-message form-message--error" role="alert">{error}</p>}
        <footer className="modal__actions">
          <button className="button button--ghost" type="button" onClick={onClose}>Annulla</button>
          <button className="button button--primary" type="submit" disabled={busy}>
            <CheckCircle2 size={18} /> {busy ? 'Salvataggio…' : 'Campo prenotato'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}

