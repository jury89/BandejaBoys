import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  BellRing,
  CalendarCheck2,
  CalendarClock,
  CalendarPlus,
  Camera,
  CheckCircle2,
  Clock3,
  ImagePlus,
  LockKeyhole,
  Star,
  Trash2,
  UserRound,
} from 'lucide-react'
import type { NotificationPreferences, SessionUser } from '../types'
import { compressAvatar } from '../lib/avatar'
import { profileNameError, PROFILE_NAME_MAX_LENGTH } from '../lib/domain'
import { normalizeNotificationPreferences } from '../lib/notificationPreferences'
import { Modal } from './Modal'
import { ProfileAvatar } from './ProfileAvatar'

const NOTIFICATION_OPTIONS: {
  key: keyof NotificationPreferences
  title: string
  description: string
  icon: typeof BellRing
}[] = [
  {
    key: 'mondayMotivation',
    title: 'Sveglia del lunedì',
    description: 'La frase motivazionale del gruppo.',
    icon: BellRing,
  },
  {
    key: 'newSlots',
    title: 'Nuovi slot',
    description: 'Quando qualcuno propone una nuova data.',
    icon: CalendarPlus,
  },
  {
    key: 'slotReady',
    title: 'Formazione completa',
    description: 'Quando si raggiungono quattro titolari.',
    icon: CheckCircle2,
  },
  {
    key: 'bookingReminder7d',
    title: 'Campo da prenotare',
    description: 'Il promemoria una settimana prima.',
    icon: CalendarClock,
  },
  {
    key: 'reminder24h',
    title: 'Partita domani',
    description: 'Il riepilogo 24 ore prima.',
    icon: CalendarCheck2,
  },
  {
    key: 'reminder2h',
    title: 'Partita tra 2 ore',
    description: 'L’ultimo richiamo prima di giocare.',
    icon: Clock3,
  },
  {
    key: 'matchRating',
    title: 'Pagelle',
    description: 'Quando è il momento di votare i compagni.',
    icon: Star,
  },
]

interface ProfileModalProps {
  user: SessionUser
  onClose: () => void
  onSave: (
    displayName: string,
    avatarDataUrl?: string,
    notificationPreferences?: NotificationPreferences,
  ) => Promise<void>
  onDone: (message: string) => void
}

export function ProfileModal({ user, onClose, onSave, onDone }: ProfileModalProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [displayName, setDisplayName] = useState(user.displayName)
  const [avatarDataUrl, setAvatarDataUrl] = useState(user.avatarDataUrl)
  const [notificationPreferences, setNotificationPreferences] = useState(
    () => normalizeNotificationPreferences(user.notificationPreferences),
  )
  const [nameError, setNameError] = useState('')
  const [error, setError] = useState('')
  const [processingPhoto, setProcessingPhoto] = useState(false)
  const [saving, setSaving] = useState(false)

  const selectPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setProcessingPhoto(true)
    try {
      setAvatarDataUrl(await compressAvatar(file))
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : 'Non è stato possibile preparare la foto.')
    } finally {
      setProcessingPhoto(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const validationError = profileNameError(displayName)
    if (validationError) {
      setNameError(validationError)
      setError('')
      return
    }

    setNameError('')
    setError('')
    setSaving(true)
    try {
      await onSave(displayName.trim(), avatarDataUrl, notificationPreferences)
      onDone('Profilo aggiornato.')
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Non è stato possibile salvare il profilo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal eyebrow="Il tuo spogliatoio" title="Profilo giocatore" onClose={onClose}>
      <form className="profile-form" onSubmit={submit}>
        <section className="profile-photo" aria-label="Foto profilo">
          <div className="profile-photo__preview">
            <ProfileAvatar
              displayName={displayName || user.displayName}
              avatarDataUrl={avatarDataUrl}
              className="profile-photo__avatar"
            />
            <span className="profile-photo__camera" aria-hidden="true"><Camera size={18} /></span>
          </div>
          <div className="profile-photo__copy">
            <strong>La tua foto in campo</strong>
            <p>La riduciamo automaticamente: comparirà accanto al tuo nome negli slot.</p>
            <div className="profile-photo__actions">
              <button className="button button--secondary" type="button" onClick={() => fileInput.current?.click()} disabled={processingPhoto || saving}>
                <ImagePlus size={16} /> {processingPhoto ? 'Preparazione…' : avatarDataUrl ? 'Cambia foto' : 'Scegli foto'}
              </button>
              {avatarDataUrl && (
                <button className="profile-photo__remove" type="button" onClick={() => setAvatarDataUrl(undefined)} disabled={processingPhoto || saving}>
                  <Trash2 size={15} /> Rimuovi
                </button>
              )}
            </div>
            <input ref={fileInput} className="profile-photo__input" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={selectPhoto} />
          </div>
        </section>

        <label className="field">
          <span><UserRound size={15} /> Nome visibile</span>
          <input
            aria-label="Nome visibile"
            aria-describedby="profile-name-feedback"
            aria-invalid={Boolean(nameError)}
            value={displayName}
            maxLength={PROFILE_NAME_MAX_LENGTH}
            onChange={(event) => {
              setDisplayName(event.target.value)
              setNameError('')
              setError('')
            }}
            autoComplete="name"
          />
          <small
            id="profile-name-feedback"
            className={nameError ? 'field__error' : undefined}
            role={nameError ? 'alert' : undefined}
          >
            {nameError || 'È il nome che vedranno i tuoi amici nelle formazioni.'}
          </small>
        </label>

        <div className="profile-locked-field" aria-label="Email non modificabile">
          <span className="profile-locked-field__icon"><LockKeyhole size={17} /></span>
          <span><small>Email dell’account</small><strong>{user.email}</strong></span>
          <em>Non modificabile</em>
        </div>

        <section className="profile-notifications" aria-labelledby="profile-notifications-title">
          <div className="profile-notifications__heading">
            <span className="profile-notifications__heading-icon" aria-hidden="true">
              <BellRing size={18} />
            </span>
            <span>
              <small>Convocazioni</small>
              <strong id="profile-notifications-title">Scegli quali avvisi ricevere</strong>
            </span>
          </div>
          <p>La scelta vale per tutti i tuoi dispositivi e puoi cambiarla quando vuoi.</p>
          <div className="profile-notifications__list">
            {NOTIFICATION_OPTIONS.map((option) => {
              const Icon = option.icon
              const checked = notificationPreferences[option.key]
              return (
                <label
                  className={`profile-notification-option${checked ? ' is-enabled' : ''}`}
                  key={option.key}
                >
                  <span className="profile-notification-option__icon" aria-hidden="true">
                    <Icon size={17} />
                  </span>
                  <span className="profile-notification-option__copy">
                    <strong>{option.title}</strong>
                    <small>{option.description}</small>
                  </span>
                  <input
                    aria-label={`Ricevi ${option.title}`}
                    checked={checked}
                    disabled={saving}
                    role="switch"
                    type="checkbox"
                    onChange={(event) => {
                      setNotificationPreferences((current) => ({
                        ...current,
                        [option.key]: event.target.checked,
                      }))
                      setError('')
                    }}
                  />
                </label>
              )
            })}
          </div>
        </section>

        {error && <p className="form-message form-message--error" role="alert">{error}</p>}

        <div className="modal__actions">
          <button className="button button--secondary" type="button" onClick={onClose} disabled={saving}>Annulla</button>
          <button className="button button--primary" type="submit" disabled={saving || processingPhoto}>
            {saving ? 'Salvataggio…' : 'Salva profilo'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
