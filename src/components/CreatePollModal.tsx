import { useMemo, useRef, useState, type FormEvent } from 'react'
import { CalendarPlus, CopyPlus, Plus, Trash2 } from 'lucide-react'
import type { CreatePollInput, SessionUser, SlotInput } from '../types'
import { defaultSlotForWeek, nextMondayDate } from '../lib/domain'
import { Modal } from './Modal'

interface CreatePollModalProps {
  user: SessionUser
  onClose: () => void
  onCreate: (input: CreatePollInput, creator: SessionUser) => Promise<void>
  onDone: (message: string) => void
}

interface EditableSlot extends SlotInput {
  editorId: string
}

function nextDayAtSameTime(value: string) {
  const [datePart, timePart] = value.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  if (!timePart || !year || !month || !day) return value

  const nextDate = new Date(Date.UTC(year, month - 1, day + 1))
  return `${nextDate.toISOString().slice(0, 10)}T${timePart}`
}

export function CreatePollModal({ user, onClose, onCreate, onDone }: CreatePollModalProps) {
  const initialWeek = useMemo(() => nextMondayDate(), [])
  const nextEditorId = useRef(3)
  const [title, setTitle] = useState('Padel · prossima settimana')
  const [weekStart, setWeekStart] = useState(initialWeek)
  const [slots, setSlots] = useState<EditableSlot[]>([
    { editorId: 'slot-1', startsAt: defaultSlotForWeek(initialWeek, 1), durationMinutes: 90 },
    { editorId: 'slot-2', startsAt: defaultSlotForWeek(initialWeek, 3), durationMinutes: 90 },
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

  const duplicateSlot = (index: number) => {
    setSlots((current) => {
      const source = current[index]
      if (!source || current.length >= 14) return current

      const duplicate: EditableSlot = {
        ...source,
        editorId: `slot-${nextEditorId.current++}`,
        startsAt: nextDayAtSameTime(source.startsAt),
      }
      return [...current.slice(0, index + 1), duplicate, ...current.slice(index + 1)]
    })
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const slotInputs = slots.map(({ startsAt, durationMinutes }) => ({ startsAt, durationMinutes }))
      await onCreate({ title, targetWeekStart: weekStart, slots: slotInputs }, user)
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
                {
                  editorId: `slot-${nextEditorId.current++}`,
                  startsAt: defaultSlotForWeek(weekStart, current.length * 2 + 1),
                  durationMinutes: 90,
                },
              ])}
            >
              <Plus size={16} /> Aggiungi slot
            </button>
          </div>

          <div className="slot-editor__list">
            {slots.map((slot, index) => (
              /* La chiave non dipende dai valori editabili: il controllo nativo mantiene il focus tra gli aggiornamenti. */
              <div className="slot-editor__row" key={slot.editorId}>
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
                <div className="slot-editor__actions">
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => duplicateSlot(index)}
                    disabled={slots.length >= 14}
                    aria-label={`Duplica slot ${index + 1} al giorno successivo`}
                  >
                    <CopyPlus size={18} />
                  </button>
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
