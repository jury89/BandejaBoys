import { useMemo, useRef, useState, type FormEvent } from 'react'
import { AlertTriangle, CalendarPlus, CopyPlus, Plus, Trash2 } from 'lucide-react'
import type { CreatePollInput, PadelSlot, SessionUser, SlotInput } from '../types'
import { defaultSlotForWeek, hasExistingSlotAtDateTime, nextMondayDate } from '../lib/domain'
import { Modal } from './Modal'
import { SlotDateTimeField } from './SlotDateTimeField'

interface CreatePollModalProps {
  user: SessionUser
  onClose: () => void
  onCreate: (input: CreatePollInput, creator: SessionUser) => Promise<void>
  onDone: (message: string) => void
  existingSlots: ReadonlyArray<Pick<PadelSlot, 'startsAt'>>
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

export function CreatePollModal({ user, onClose, onCreate, onDone, existingSlots }: CreatePollModalProps) {
  const initialWeekStart = useMemo(() => nextMondayDate(), [])
  const nextEditorId = useRef(3)
  const [slots, setSlots] = useState<EditableSlot[]>([
    { editorId: 'slot-1', startsAt: defaultSlotForWeek(initialWeekStart, 1), durationMinutes: 90 },
    { editorId: 'slot-2', startsAt: defaultSlotForWeek(initialWeekStart, 3), durationMinutes: 90 },
  ])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const updateSlotInput = (index: number, patch: Partial<SlotInput>) => {
    setSlots((current) => current.map((slot, itemIndex) => itemIndex === index ? { ...slot, ...patch } : slot))
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
      await onCreate({ slots: slotInputs }, user)
      onDone('Slot pubblicati. È ora di raccogliere le adesioni.')
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Non è stato possibile pubblicare gli slot.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Prepara i prossimi slot" eyebrow="Nuovi slot" onClose={onClose} size="wide">
      <form onSubmit={submit} className="poll-form">
        <div className="slot-editor">
          <div className="slot-editor__heading">
            <div>
              <h3>Slot proposti</h3>
              <p>Aggiungi le combinazioni di giorno e ora su cui votare.</p>
            </div>
            <button
              className="button button--secondary button--small"
              type="button"
              onClick={() => setSlots((current) => {
                const previous = current.at(-1)
                return [
                  ...current,
                  {
                    editorId: `slot-${nextEditorId.current++}`,
                    startsAt: previous
                      ? nextDayAtSameTime(previous.startsAt)
                      : defaultSlotForWeek(initialWeekStart, 1),
                    durationMinutes: previous?.durationMinutes ?? 90,
                  },
                ]
              })}
            >
              <Plus size={16} /> Aggiungi slot
            </button>
          </div>

          <div className="slot-editor__list">
            {slots.map((slot, index) => {
              const alreadyExists = hasExistingSlotAtDateTime(slot.startsAt, existingSlots)
              return (
              /* La chiave non dipende dai valori editabili: il controllo nativo mantiene il focus tra gli aggiornamenti. */
              <div className={`slot-editor__row ${alreadyExists ? 'slot-editor__row--duplicate' : ''}`} key={slot.editorId}>
                <span className="slot-editor__number">{String(index + 1).padStart(2, '0')}</span>
                <SlotDateTimeField
                  value={slot.startsAt}
                  onChange={(startsAt) => updateSlotInput(index, { startsAt })}
                />
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
                {alreadyExists && (
                  <p className="slot-editor__duplicate-warning" role="status">
                    <AlertTriangle size={16} /> Esiste già uno slot con questa data e ora. Puoi comunque pubblicarlo.
                  </p>
                )}
              </div>
              )
            })}
          </div>
        </div>

        {error && <p className="form-message form-message--error" role="alert">{error}</p>}
        <footer className="modal__actions">
          <button className="button button--ghost" type="button" onClick={onClose}>Annulla</button>
          <button className="button button--primary" type="submit" disabled={busy}>
            <CalendarPlus size={18} /> {busy ? 'Pubblicazione…' : 'Pubblica slot'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
