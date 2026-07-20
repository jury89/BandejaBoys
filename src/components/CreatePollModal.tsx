import { useMemo, useState, type FormEvent } from 'react'
import { CalendarPlus, Plus, Trash2 } from 'lucide-react'
import type { CreatePollInput, SessionUser, SlotInput } from '../types'
import { defaultSlotForWeek, nextMondayDate } from '../lib/domain'
import { Modal } from './Modal'

interface CreatePollModalProps {
  user: SessionUser
  onClose: () => void
  onCreate: (input: CreatePollInput, creator: SessionUser) => Promise<void>
  onDone: (message: string) => void
}

export function CreatePollModal({ user, onClose, onCreate, onDone }: CreatePollModalProps) {
  const initialWeek = useMemo(() => nextMondayDate(), [])
  const [title, setTitle] = useState('Padel · prossima settimana')
  const [weekStart, setWeekStart] = useState(initialWeek)
  const [slots, setSlots] = useState<SlotInput[]>([
    { startsAt: defaultSlotForWeek(initialWeek, 1), durationMinutes: 90 },
    { startsAt: defaultSlotForWeek(initialWeek, 3), durationMinutes: 90 },
  ])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const updateSlotInput = (index: number, patch: Partial<SlotInput>) => {
    setSlots((current) => current.map((slot, itemIndex) => itemIndex === index ? { ...slot, ...patch } : slot))
  }

  const updateWeek = (value: string) => {
    setWeekStart(value)
    setSlots((current) => current.map((slot, index) => ({
      ...slot,
      startsAt: defaultSlotForWeek(value, index * 2 + 1),
    })))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onCreate({ title, targetWeekStart: weekStart, slots }, user)
      onDone('Sondaggio creato. È ora di raccogliere le adesioni.')
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Non è stato possibile creare il sondaggio.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Prepara il prossimo sondaggio" eyebrow="Nuova settimana" onClose={onClose} size="wide">
      <form onSubmit={submit} className="poll-form">
        <div className="poll-form__basics">
          <label className="field">
            <span>Nome del sondaggio</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label className="field">
            <span>Settimana di gioco</span>
            <input type="date" value={weekStart} onChange={(event) => updateWeek(event.target.value)} required />
          </label>
        </div>

        <div className="slot-editor">
          <div className="slot-editor__heading">
            <div>
              <h3>Slot proposti</h3>
              <p>Aggiungi le combinazioni di giorno e ora su cui votare.</p>
            </div>
            <button
              className="button button--secondary button--small"
              type="button"
              onClick={() => setSlots((current) => [
                ...current,
                { startsAt: defaultSlotForWeek(weekStart, current.length * 2 + 1), durationMinutes: 90 },
              ])}
            >
              <Plus size={16} /> Aggiungi slot
            </button>
          </div>

          <div className="slot-editor__list">
            {slots.map((slot, index) => (
              <div className="slot-editor__row" key={`${index}-${slot.startsAt}`}>
                <span className="slot-editor__number">{String(index + 1).padStart(2, '0')}</span>
                <label className="field">
                  <span>Data e ora</span>
                  <input
                    type="datetime-local"
                    value={slot.startsAt}
                    onChange={(event) => updateSlotInput(index, { startsAt: event.target.value })}
                    required
                  />
                </label>
                <label className="field field--duration">
                  <span>Durata</span>
                  <select
                    value={slot.durationMinutes}
                    onChange={(event) => updateSlotInput(index, { durationMinutes: Number(event.target.value) })}
                  >
                    <option value={60}>60 min</option>
                    <option value={90}>90 min</option>
                    <option value={120}>120 min</option>
                  </select>
                </label>
                <button
                  className="icon-button icon-button--danger"
                  type="button"
                  onClick={() => setSlots((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  disabled={slots.length === 1}
                  aria-label={`Elimina slot ${index + 1}`}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="form-message form-message--error" role="alert">{error}</p>}
        <footer className="modal__actions">
          <button className="button button--ghost" type="button" onClick={onClose}>Annulla</button>
          <button className="button button--primary" type="submit" disabled={busy}>
            <CalendarPlus size={18} /> {busy ? 'Creazione…' : 'Pubblica sondaggio'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}

