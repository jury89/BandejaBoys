import { useMemo, useState, type FormEvent } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import type { MemberProfile, PadelSlot, SessionUser } from '../types'
import { getStarters } from '../lib/domain'
import { Modal } from './Modal'

interface SubstitutionModalProps {
  slot: PadelSlot
  user: SessionUser
  members: MemberProfile[]
  onClose: () => void
  onSubstitute: (replacement: MemberProfile) => Promise<void>
  onDone: (message: string) => void
}

export function SubstitutionModal({
  slot,
  user,
  members,
  onClose,
  onSubstitute,
  onDone,
}: SubstitutionModalProps) {
  const starterIds = useMemo(() => new Set(getStarters(slot).map((signup) => signup.userId)), [slot])
  const candidates = members.filter((member) => member.id !== user.id && !starterIds.has(member.id))
  const [selectedId, setSelectedId] = useState(candidates[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const replacement = candidates.find((candidate) => candidate.id === selectedId)
    if (!replacement) {
      setError('Scegli chi prenderà il tuo posto.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSubstitute(replacement)
      onDone(`${replacement.displayName} prende il tuo posto senza perdere la priorità.`)
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Non è stato possibile fare la sostituzione.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Passa il tuo posto" eyebrow="Sostituzione diretta" onClose={onClose}>
      <form onSubmit={submit} className="form-stack">
        <p className="modal__lead">
          Chi scegli entrerà nella tua posizione. Se era in riserva, verrà tolto dalla lista d’attesa.
        </p>
        {candidates.length > 0 ? (
          <fieldset className="member-picker">
            <legend>Chi gioca al posto tuo?</legend>
            {candidates.map((candidate) => {
              const reserveIndex = slot.signups.findIndex((signup) => signup.userId === candidate.id)
              return (
                <label key={candidate.id} className={selectedId === candidate.id ? 'is-selected' : ''}>
                  <input
                    type="radio"
                    name="replacement"
                    value={candidate.id}
                    checked={selectedId === candidate.id}
                    onChange={() => setSelectedId(candidate.id)}
                  />
                  <span className="avatar avatar--small">{candidate.displayName.charAt(0).toUpperCase()}</span>
                  <span><strong>{candidate.displayName}</strong><small>{reserveIndex >= 4 ? `Riserva n° ${reserveIndex - 3}` : 'Disponibile'}</small></span>
                </label>
              )
            })}
          </fieldset>
        ) : (
          <p className="empty-inline">Non ci sono ancora altre persone registrate da scegliere.</p>
        )}
        {error && <p className="form-message form-message--error" role="alert">{error}</p>}
        <footer className="modal__actions">
          <button className="button button--ghost" type="button" onClick={onClose}>Annulla</button>
          <button className="button button--primary" type="submit" disabled={busy || candidates.length === 0}>
            <ArrowLeftRight size={18} /> {busy ? 'Sostituzione…' : 'Conferma sostituzione'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}

