import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  BellRing,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  Camera,
  CheckCircle2,
  Clock3,
  ImagePlus,
  LockKeyhole,
  Trash2,
  Trophy,
  UserRound,
} from 'lucide-react'
import type {
  FixedSeatPreference,
  FixedSeatWeekday,
  MemberProfile,
  NotificationPreferences,
  SessionUser,
} from '../types'
import { compressAvatar } from '../lib/avatar'
import { profileNameError, PROFILE_NAME_MAX_LENGTH } from '../lib/domain'
import { normalizeNotificationPreferences } from '../lib/notificationPreferences'
import {
  FIXED_SEAT_MAX_PLAYERS,
  fixedSeatMaxOtherOverlap,
  fixedSeatPreferenceError,
  normalizeFixedSeatPreference,
} from '../lib/fixedSeat'
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
    key: 'starterSubstitution',
    title: 'Sostituzioni',
    description: 'Quando qualcuno ti passa un posto da titolare.',
    icon: UserRound,
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
    key: 'matchFeedback',
    title: 'Giudizi del match',
    description: 'Mezz’ora dopo la partita, per assegnare il volatile ai compagni.',
    icon: Trophy,
  },
  {
    key: 'fantasy',
    title: 'FantaBandeja',
    description: 'Apertura round, cambi formazione e risultati fantasy.',
    icon: Trophy,
  },
]

const FIXED_SEAT_DAYS: Array<{ value: FixedSeatWeekday; label: string }> = [
  { value: 1, label: 'Lunedì' },
  { value: 2, label: 'Martedì' },
  { value: 3, label: 'Mercoledì' },
  { value: 4, label: 'Giovedì' },
  { value: 5, label: 'Venerdì' },
  { value: 6, label: 'Sabato' },
  { value: 7, label: 'Domenica' },
]

const FIXED_SEAT_TIMES = Array.from({ length: 49 }, (_, index) => index * 30)

function fixedSeatTimeLabel(minutes: number): string {
  if (minutes === 24 * 60) return '24:00'
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

interface ProfileModalProps {
  user: SessionUser
  members?: MemberProfile[]
  onClose: () => void
  onSave: (
    displayName: string,
    avatarDataUrl?: string,
    notificationPreferences?: NotificationPreferences,
    fixedSeatPreference?: FixedSeatPreference,
  ) => Promise<void>
  onDone: (message: string) => void
}

export function ProfileModal({ user, members = [user], onClose, onSave, onDone }: ProfileModalProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const savedFixedSeatPreference = normalizeFixedSeatPreference(user.fixedSeatPreference)
  const [displayName, setDisplayName] = useState(user.displayName)
  const [avatarDataUrl, setAvatarDataUrl] = useState(user.avatarDataUrl)
  const [notificationPreferences, setNotificationPreferences] = useState(
    () => normalizeNotificationPreferences(user.notificationPreferences),
  )
  const [fixedSeatEnabled, setFixedSeatEnabled] = useState(Boolean(savedFixedSeatPreference))
  const [fixedSeatWeekday, setFixedSeatWeekday] = useState<FixedSeatWeekday>(
    savedFixedSeatPreference?.weekday ?? 2,
  )
  const [fixedSeatStartMinutes, setFixedSeatStartMinutes] = useState(
    savedFixedSeatPreference?.startMinutes ?? 18 * 60,
  )
  const [fixedSeatEndMinutes, setFixedSeatEndMinutes] = useState(
    savedFixedSeatPreference?.endMinutes ?? 20 * 60,
  )
  const [nameError, setNameError] = useState('')
  const [error, setError] = useState('')
  const [processingPhoto, setProcessingPhoto] = useState(false)
  const [saving, setSaving] = useState(false)
  const fixedSeatPreference = useMemo<FixedSeatPreference | undefined>(() => (
    fixedSeatEnabled
      ? {
          weekday: fixedSeatWeekday,
          startMinutes: fixedSeatStartMinutes,
          endMinutes: fixedSeatEndMinutes,
        }
      : undefined
  ), [fixedSeatEnabled, fixedSeatEndMinutes, fixedSeatStartMinutes, fixedSeatWeekday])
  const fixedSeatOtherOverlap = fixedSeatPreference
    ? fixedSeatMaxOtherOverlap(members, fixedSeatPreference, user.id)
    : 0
  const fixedSeatUnavailable = Boolean(
    fixedSeatPreference && fixedSeatOtherOverlap >= FIXED_SEAT_MAX_PLAYERS,
  )

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
    if (fixedSeatPreference) {
      const preferenceError = fixedSeatPreferenceError(fixedSeatPreference)
      if (preferenceError || fixedSeatUnavailable) {
        setNameError('')
        setError(
          preferenceError
          ?? 'Questa fascia ha già tre posti fissi. Scegli un altro giorno o un altro orario.',
        )
        return
      }
    }

    setNameError('')
    setError('')
    setSaving(true)
    try {
      await onSave(displayName.trim(), avatarDataUrl, notificationPreferences, fixedSeatPreference)
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

        <section
          className={`profile-fixed-seat${fixedSeatEnabled ? ' is-enabled' : ''}`}
          aria-labelledby="profile-fixed-seat-title"
        >
          <div className="profile-fixed-seat__heading">
            <span className="profile-fixed-seat__heading-icon" aria-hidden="true">
              <CalendarDays size={19} />
            </span>
            <span>
              <small>Organizzazione automatica</small>
              <strong id="profile-fixed-seat-title">Posto fisso</strong>
            </span>
            <label className="profile-fixed-seat__switch">
              <span>{fixedSeatEnabled ? 'Attivo' : 'Disattivo'}</span>
              <input
                aria-label="Attiva posto fisso"
                checked={fixedSeatEnabled}
                disabled={saving}
                role="switch"
                type="checkbox"
                onChange={(event) => {
                  setFixedSeatEnabled(event.target.checked)
                  setError('')
                }}
              />
            </label>
          </div>
          <p>
            Ti aggiungiamo come titolare agli slot futuri che iniziano e finiscono interamente nella fascia scelta.
          </p>

          {fixedSeatEnabled && (
            <div className="profile-fixed-seat__controls">
              <label className="field">
                <span>Giorno fisso</span>
                <select
                  aria-label="Giorno del posto fisso"
                  value={fixedSeatWeekday}
                  disabled={saving}
                  onChange={(event) => {
                    setFixedSeatWeekday(Number(event.target.value) as FixedSeatWeekday)
                    setError('')
                  }}
                >
                  {FIXED_SEAT_DAYS.map((day) => (
                    <option key={day.value} value={day.value}>{day.label}</option>
                  ))}
                </select>
              </label>

              <div className="profile-fixed-seat__time-grid">
                <label className="field">
                  <span>Dalle</span>
                  <select
                    aria-label="Inizio fascia posto fisso"
                    value={fixedSeatStartMinutes}
                    disabled={saving}
                    onChange={(event) => {
                      const nextStart = Number(event.target.value)
                      setFixedSeatStartMinutes(nextStart)
                      if (fixedSeatEndMinutes < nextStart + 60) setFixedSeatEndMinutes(nextStart + 60)
                      setError('')
                    }}
                  >
                    {FIXED_SEAT_TIMES.slice(0, -2).map((minutes) => (
                      <option key={minutes} value={minutes}>{fixedSeatTimeLabel(minutes)}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Alle</span>
                  <select
                    aria-label="Fine fascia posto fisso"
                    value={fixedSeatEndMinutes}
                    disabled={saving}
                    onChange={(event) => {
                      setFixedSeatEndMinutes(Number(event.target.value))
                      setError('')
                    }}
                  >
                    {FIXED_SEAT_TIMES.filter((minutes) => minutes >= fixedSeatStartMinutes + 60).map((minutes) => (
                      <option key={minutes} value={minutes}>{fixedSeatTimeLabel(minutes)}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div
                className={`profile-fixed-seat__availability${fixedSeatUnavailable ? ' is-full' : ''}`}
                role={fixedSeatUnavailable ? 'alert' : 'status'}
              >
                <strong>
                  {fixedSeatUnavailable
                    ? 'Fascia già completa'
                    : `${fixedSeatOtherOverlap + 1}/${FIXED_SEAT_MAX_PLAYERS} posti fissi dopo il salvataggio`}
                </strong>
                <span>
                  {fixedSeatUnavailable
                    ? 'Tre giocatori coprono già almeno una parte di questo intervallo.'
                    : 'Resterà sempre almeno un posto libero per le adesioni normali.'}
                </span>
              </div>
              <small className="profile-fixed-seat__note">
                Le iscrizioni già effettuate non vengono rimosse se cambi preferenza. Riceverai una notifica per ogni aggiunta automatica.
              </small>
            </div>
          )}
        </section>

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
