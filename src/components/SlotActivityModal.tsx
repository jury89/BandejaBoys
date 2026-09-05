import { useEffect, useState, type ComponentType } from 'react'
import {
  ArrowLeftRight,
  CalendarCheck2,
  CalendarClock,
  CalendarPlus,
  CalendarX2,
  Clock3,
  History,
  LogOut,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  UserRound,
  UserRoundPlus,
} from 'lucide-react'
import type { PadelPoll, PadelSlot } from '../types'
import {
  mergeLegacySubstitutionEvents,
  type ActivityEventType,
  type LocalActivityEvent,
} from '../lib/activity'
import { PADEL_TIME_ZONE, slotDateParts } from '../lib/format'
import { repository } from '../lib/repository'
import { Modal } from './Modal'

interface SlotActivityModalProps {
  poll: PadelPoll
  slot: PadelSlot
  onClose: () => void
}

type ActivityTone = 'created' | 'schedule' | 'joined' | 'left' | 'substitution' | 'admin' | 'booked' | 'unbooked'

interface ActivityPresentation {
  title: string
  description?: string
  icon: ComponentType<{ size?: number }>
  tone: ActivityTone
}

const auditDateFormatter = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: PADEL_TIME_ZONE,
})

const auditTimeFormatter = new Intl.DateTimeFormat('it-IT', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: PADEL_TIME_ZONE,
})

function activityTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return `${auditDateFormatter.format(date)} · ${auditTimeFormatter.format(date)}`
}

function slotSessionLabel(startsAt: string | undefined): string | null {
  if (!startsAt) return null
  const date = slotDateParts(startsAt)
  const full = `${date.full.charAt(0).toUpperCase()}${date.full.slice(1)}`
  return `${full} alle ${date.time}`
}

function detailString(event: LocalActivityEvent, key: string): string | undefined {
  const value = event.details[key]
  return typeof value === 'string' && value ? value : undefined
}

function detailNumber(event: LocalActivityEvent, key: string): number | undefined {
  const value = event.details[key]
  return typeof value === 'number' ? value : undefined
}

function signupRoleLabel(event: LocalActivityEvent): string {
  return detailString(event, 'role') === 'reserve' ? 'riserva' : 'titolare'
}

function activityPresentation(event: LocalActivityEvent): ActivityPresentation {
  switch (event.type) {
    case 'slot_created': {
      const duration = detailNumber(event, 'durationMinutes')
      return {
        title: 'Slot creato',
        description: duration ? `Durata impostata: ${duration} minuti.` : undefined,
        icon: CalendarPlus,
        tone: 'created',
      }
    }
    case 'slot_rescheduled': {
      const previous = slotSessionLabel(detailString(event, 'previousStartsAt'))
      const next = slotSessionLabel(event.slotStartsAt)
      return {
        title: 'Data e ora aggiornate',
        description: previous && next ? `Da ${previous} a ${next}.` : next ? `Nuovo orario: ${next}.` : undefined,
        icon: CalendarClock,
        tone: 'schedule',
      }
    }
    case 'signup_joined':
      return {
        title: 'Adesione aggiunta',
        description: `Ingresso come ${signupRoleLabel(event)}.`,
        icon: UserRoundPlus,
        tone: 'joined',
      }
    case 'fixed_seat_auto_joined': {
      const targetName = detailString(event, 'targetName') ?? 'Il giocatore'
      return {
        title: 'Posto fisso applicato',
        description: `${targetName} è stato aggiunto automaticamente come titolare.`,
        icon: UserRoundPlus,
        tone: 'joined',
      }
    }
    case 'signup_left':
      return {
        title: 'Adesione rimossa',
        description: `Uscita dal posto da ${signupRoleLabel(event)}.`,
        icon: LogOut,
        tone: 'left',
      }
    case 'guest_added': {
      const guestName = detailString(event, 'guestName')
      return {
        title: 'Ospite aggiunto',
        description: guestName
          ? `${guestName} è stato inserito come ${signupRoleLabel(event)}.`
          : `Ingresso come ${signupRoleLabel(event)}.`,
        icon: UserRoundPlus,
        tone: 'joined',
      }
    }
    case 'guest_removed': {
      const guestName = detailString(event, 'guestName')
      return {
        title: 'Ospite rimosso',
        description: guestName
          ? `${guestName} è stato tolto dallo slot.`
          : `Uscita dal posto da ${signupRoleLabel(event)}.`,
        icon: LogOut,
        tone: 'left',
      }
    }
    case 'starter_substituted': {
      const outgoing = detailString(event, 'outgoingName')
      const replacement = detailString(event, 'replacementName')
      return {
        title: 'Sostituzione del titolare',
        description: outgoing && replacement
          ? `${replacement} ha preso il posto di ${outgoing}.`
          : 'Il titolare è stato sostituito.',
        icon: ArrowLeftRight,
        tone: 'substitution',
      }
    }
    case 'slot_roster_admin_updated': {
      const action = detailString(event, 'action')
      const targetName = detailString(event, 'targetName') ?? 'Il giocatore'
      const toRole = detailString(event, 'toRole')
      const toRoleLabel = toRole === 'reserve' ? 'riserva' : 'titolare'
      const description = action === 'added'
        ? `${targetName} è stato aggiunto come ${toRoleLabel}.`
        : action === 'removed'
          ? `${targetName} è stato rimosso dallo slot.`
          : `${targetName} è passato tra i ${toRole === 'starter' ? 'titolari' : 'giocatori di riserva'}.`
      return {
        title: 'Formazione modificata dall’amministratore',
        description,
        icon: ShieldCheck,
        tone: 'admin',
      }
    }
    case 'slot_booked':
      return {
        title: 'Campo segnato come prenotato',
        description: detailString(event, 'venue'),
        icon: CalendarCheck2,
        tone: 'booked',
      }
    case 'slot_unbooked':
      return {
        title: 'Prenotazione rimossa',
        description: detailString(event, 'venue'),
        icon: CalendarX2,
        tone: 'unbooked',
      }
    case 'slot_deleted':
      return {
        title: 'Slot eliminato',
        icon: CalendarX2,
        tone: 'left',
      }
    default:
      return {
        title: eventTypeFallback(event.type),
        icon: History,
        tone: 'schedule',
      }
  }
}

function eventTypeFallback(type: ActivityEventType): string {
  switch (type) {
    case 'poll_created':
      return 'Sondaggio creato'
    case 'poll_archived':
      return 'Sondaggio archiviato'
    case 'poll_reopened':
      return 'Sondaggio riaperto'
    case 'poll_deleted':
      return 'Sondaggio eliminato'
    default:
      return 'Aggiornamento dello slot'
  }
}

export function SlotActivityModal({ poll, slot, onClose }: SlotActivityModalProps) {
  const [events, setEvents] = useState<LocalActivityEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [requestVersion, setRequestVersion] = useState(0)
  const slotDate = slotDateParts(slot.startsAt)
  const displayedEvents = events
    ? mergeLegacySubstitutionEvents(events, poll, slot)
    : null

  useEffect(() => {
    let active = true

    void repository.getSlotActivity(poll.id, slot.id)
      .then((activity) => {
        if (active) setEvents(activity)
      })
      .catch(() => {
        if (active) setError('Non siamo riusciti a recuperare la cronologia dello slot.')
      })

    return () => {
      active = false
    }
  }, [poll.id, requestVersion, slot.id])

  return (
    <Modal
      title="Cronologia dello slot"
      eyebrow={`${slotDate.full} · ${slotDate.time}`}
      onClose={onClose}
    >
      <div className="slot-activity">
        <div className="slot-activity__intro">
          <span className="slot-activity__intro-icon" aria-hidden="true"><ScrollText size={22} /></span>
          <div>
            <strong>Registro delle modifiche</strong>
            <p>
              {displayedEvents
                ? `${displayedEvents.length} ${displayedEvents.length === 1 ? 'evento registrato' : 'eventi registrati'}, dal più recente.`
                : 'Recuperiamo le modifiche, gli autori e gli orari registrati.'}
            </p>
          </div>
        </div>

        {!events && !error && (
          <div className="slot-activity__state" role="status" aria-live="polite">
            <span className="slot-activity__loader" aria-hidden="true" />
            <p>Carichiamo la cronologia…</p>
          </div>
        )}

        {error && (
          <div className="slot-activity__state slot-activity__state--error" role="alert">
            <CalendarX2 size={25} aria-hidden="true" />
            <p>{error}</p>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => {
                setEvents(null)
                setError(null)
                setRequestVersion((value) => value + 1)
              }}
            >
              <RefreshCw size={16} /> Riprova
            </button>
          </div>
        )}

        {displayedEvents?.length === 0 && (
          <div className="slot-activity__state slot-activity__state--empty">
            <Clock3 size={26} aria-hidden="true" />
            <strong>Nessuna modifica registrata</strong>
            <p>Le attività precedenti all’introduzione della cronologia non possono essere ricostruite.</p>
          </div>
        )}

        {displayedEvents && displayedEvents.length > 0 && (
          <ol className="slot-activity__timeline" aria-label="Cronologia delle modifiche dello slot">
            {displayedEvents.map((event) => {
              const presentation = activityPresentation(event)
              const EventIcon = presentation.icon
              return (
                <li className="slot-activity__item" key={event.id}>
                  <span
                    className={`slot-activity__marker slot-activity__marker--${presentation.tone}`}
                    aria-hidden="true"
                  >
                    <EventIcon size={17} />
                  </span>
                  <div className="slot-activity__card">
                    <strong>{presentation.title}</strong>
                    {presentation.description && <p>{presentation.description}</p>}
                    <div className="slot-activity__meta">
                      <span><UserRound size={13} /> Azione di <strong>{event.actorName}</strong></span>
                      {event.occurredAt > 0 && (
                        <time dateTime={new Date(event.occurredAt).toISOString()}>
                          <Clock3 size={13} /> {activityTimestamp(event.occurredAt)}
                        </time>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}

        <div className="modal__actions slot-activity__actions">
          <button className="button button--secondary" type="button" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </Modal>
  )
}
