import { useMemo, useState, type FormEvent } from 'react'
import { CalendarPlus } from 'lucide-react'
import type { PadelPoll, SlotInput } from '../types'
import { defaultSlotForWeek, toDateTimeInput } from '../lib/domain'
import { Modal } from './Modal'

interface AddSlotModalProps {
  poll: PadelPoll
  onClose: () => void
  onSave: (input: SlotInput) => Promise<void>
  onDone: (message: string) => void
}

function initialSlot(poll: PadelPoll): SlotInput {
  const latest = [...poll.slots].sort((left, right) => right.startsAt.localeCompare(left.startsAt))[0]
  if (!latest) {
    return {
      startsAt: defaultSlotForWeek(poll.targetWeekStart, 1),
      durationMinutes: 90,
    }
  }

  const nextDay = new Date(latest.startsAt)
  nextDay.setDate(nextDay.getDate() + 1)
  return {
    startsAt: toDateTimeInput(nextDay),
    durationMinutes: latest.durationMinutes,
  }
}

export function AddSlotModal({ poll, onClose, onSave, onDone }: AddSlotModalProps) {
  const initial = useMemo(() => initialSlot(poll), [poll])
  const [startsAt, setStartsAt] = useState(initial.startsAt)
  const [durationMinutes, setDurationMinutes] = useState(initial.durationMinutes)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (Number.isNaN(new Date(startsAt).getTime())) {
      setError('Scegli una data e un orario validi.')
      return
    }

    setBusy(true)
    setError('')
    try {
      await onSave({ startsAt, durationMinutes })
      onDone('Slot aggiunto. Gli altri riceveranno un unico avviso raggruppato.')
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Non è stato possibile aggiungere lo slot.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Aggiungi uno slot" eyebrow={poll.title} onClose={onClose}>
      <form onSubmit={submit} className="form-stack">
        <p className="modal__lead">
          Se aggiungi più slot entro pochi minuti, gli amici riceveranno una sola notifica.
        </p>
        <label className="field">
          <span>Data e ora</span>
          <input
            type="datetime-local"
            step={1800}
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            autoFocus
            required
          />
        </label>
        <label className="field">
          <span>Durata</span>
          <select
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(Number(event.target.value))}
          >
            <option value={60}>60 min</option>
            <option value={90}>90 min</option>
            <option value={120}>120 min</option>
          </select>
        </label>
        {error && <p className="form-message form-message--error" role="alert">{error}</p>}
        <footer className="modal__actions">
          <button className="button button--ghost" type="button" onClick={onClose}>Annulla</button>
          <button className="button button--primary" type="submit" disabled={busy}>
            <CalendarPlus size={18} /> {busy ? 'Aggiunta…' : 'Aggiungi slot'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
