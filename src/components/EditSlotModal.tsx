import { useState, type FormEvent } from 'react'
import { CalendarClock, Clock3 } from 'lucide-react'
import type { PadelSlot } from '../types'
import { toDateTimeInput } from '../lib/domain'
import { slotDateParts } from '../lib/format'
import { Modal } from './Modal'

interface EditSlotModalProps {
  slot: PadelSlot
  onClose: () => void
  onSave: (startsAt: string, timeIsTentative: boolean) => Promise<void>
  onDone: (message: string) => void
}

export function EditSlotModal({ slot, onClose, onSave, onDone }: EditSlotModalProps) {
  const [startsAt, setStartsAt] = useState(toDateTimeInput(new Date(slot.startsAt)))
  const [timeIsTentative, setTimeIsTentative] = useState(Boolean(slot.timeIsTentative))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const current = slotDateParts(slot.startsAt)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (Number.isNaN(new Date(startsAt).getTime())) {
      setError('Scegli una data e un orario validi.')
      return
    }

    setBusy(true)
    setError('')
    try {
      await onSave(startsAt, timeIsTentative)
      onDone('Data e ora dello slot aggiornate.')
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Non è stato possibile aggiornare lo slot.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Modifica data e ora" eyebrow={`${current.full} · ${current.time}`} onClose={onClose}>
      <form onSubmit={submit} className="form-stack">
        <p className="modal__lead">Adesioni, riserve e prenotazione del campo resteranno associate allo slot.</p>
        <label className="field">
          <span>Nuova data e ora</span>
          <input
            type="datetime-local"
            step={1800}
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            autoFocus
            required
          />
        </label>
        <label className="time-certainty-option">
          <input
            type="checkbox"
            checked={timeIsTentative}
            onChange={(event) => setTimeIsTentative(event.target.checked)}
            aria-label="Orario indicativo"
          />
          <span className="time-certainty-option__icon" aria-hidden="true"><Clock3 size={18} /></span>
          <span className="time-certainty-option__copy">
            <strong>Orario indicativo</strong>
            <small>Resterà provvisorio finché il campo non viene segnato come prenotato.</small>
          </span>
        </label>
        {error && <p className="form-message form-message--error" role="alert">{error}</p>}
        <footer className="modal__actions">
          <button className="button button--ghost" type="button" onClick={onClose}>Annulla</button>
          <button className="button button--primary" type="submit" disabled={busy}>
            <CalendarClock size={18} /> {busy ? 'Salvataggio…' : 'Salva data e ora'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
