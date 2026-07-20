import { useId, useState } from 'react'
import {
  ArrowLeftRight,
  CalendarCheck2,
  Check,
  CircleHelp,
  Clock3,
  LogOut,
  MapPin,
  PencilLine,
  PhoneCall,
  UserRoundPlus,
} from 'lucide-react'
import type { MemberProfile, PadelPoll, PadelSlot, SessionUser } from '../types'
import {
  getReserves,
  getSignupPosition,
  getSlotPhase,
  getStarters,
  isStarter,
} from '../lib/domain'
import { slotDateParts } from '../lib/format'
import { repository } from '../lib/repository'
import { BookingModal } from './BookingModal'
import { EditSlotModal } from './EditSlotModal'
import { SubstitutionModal } from './SubstitutionModal'

interface SlotCardProps {
  poll: PadelPoll
  slot: PadelSlot
  user: SessionUser
  members: MemberProfile[]
  disabled?: boolean
  onPollChange: (poll: PadelPoll) => void
  onNotify: (message: string) => void
  onError: (message: string) => void
}

const phaseCopy = {
  collecting: { label: 'Raccolta adesioni', icon: Clock3 },
  ready: { label: 'Da prenotare', icon: PhoneCall },
  booked: { label: 'Campo prenotato', icon: CalendarCheck2 },
}

export function SlotCard({ poll, slot, user, members, disabled, onPollChange, onNotify, onError }: SlotCardProps) {
  const substitutionTooltipId = useId()
  const [bookingOpen, setBookingOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [substitutionOpen, setSubstitutionOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const date = slotDateParts(slot.startsAt)
  const starters = getStarters(slot)
  const reserves = getReserves(slot)
  const phase = getSlotPhase(slot)
  const PhaseIcon = phaseCopy[phase].icon
  const position = getSignupPosition(slot, user.id)
  const joined = position >= 0
  const userIsStarter = isStarter(slot, user.id)

  const syncPoll = async (work: () => Promise<PadelPoll>) => {
    const updated = await work()
    onPollChange(updated)
  }

  const run = async (work: () => Promise<PadelPoll>, success?: string) => {
    setBusy(true)
    try {
      await syncPoll(work)
      if (success) onNotify(success)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Operazione non riuscita.')
    } finally {
      setBusy(false)
    }
  }

  const leave = async () => {
    const losesPriority = userIsStarter && reserves.length > 0
    if (losesPriority && !window.confirm('Se ti ritiri, la prima riserva entra tra i titolari. Continuare?')) return
    await run(
      () => repository.leaveSlot(poll.id, slot.id, user.id),
      losesPriority ? `${reserves[0].displayName} è stato promosso tra i titolari.` : 'Adesione rimossa.',
    )
  }

  const unbook = async () => {
    if (!window.confirm('Segnare questo campo come non più prenotato?')) return
    await run(() => repository.setBooking(poll.id, slot.id, null), 'Lo slot è tornato da prenotare.')
  }

  return (
    <article className={`slot-card slot-card--${phase}`}>
      <header className="slot-card__header">
        <div className="slot-date" aria-label={`${date.full} alle ${date.time}`}>
          <span>{date.weekday}</span>
          <strong>{date.day}</strong>
          <span>{date.month}</span>
        </div>
        <div className="slot-time">
          <strong>{date.time}</strong>
          <span>{slot.durationMinutes} min</span>
        </div>
        <div className="slot-card__status">
          <div className={`status-pill status-pill--${phase}`}>
            <PhaseIcon size={14} />
            {phaseCopy[phase].label}
          </div>
          {!disabled && (
            <button
              className="slot-card__edit-time"
              type="button"
              onClick={() => setScheduleOpen(true)}
              aria-label="Modifica data e ora dello slot"
            >
              <PencilLine size={12} /> Modifica
            </button>
          )}
        </div>
      </header>

      {phase === 'booked' && (
        <div className="booking-strip">
          <MapPin size={17} />
          <span><strong>{slot.venue}</strong><small>Segnato da {slot.bookedByName}</small></span>
          <button className="text-button" type="button" onClick={() => setBookingOpen(true)}>Modifica</button>
        </div>
      )}

      <section className="court-lineup" aria-label="Titolari">
        <div className="court-lineup__net" aria-hidden="true" />
        {Array.from({ length: 4 }, (_, index) => {
          const signup = starters[index]
          return (
            <div className={`court-player court-player--${index + 1} ${signup?.userId === user.id ? 'is-you' : ''}`} key={signup?.id ?? `empty-${index}`}>
              <span className="court-player__marker">{index + 1}</span>
              {signup ? (
                <span className="court-player__name">
                  <strong>{signup.displayName}</strong>
                  {signup.userId === user.id && <small>Tu</small>}
                  {signup.substitutedFor && <small>per {signup.substitutedFor.displayName}</small>}
                </span>
              ) : (
                <span className="court-player__name court-player__name--empty">Posto libero</span>
              )}
            </div>
          )
        })}
      </section>

      <section className="reserve-list" aria-label="Lista d’attesa">
        <div className="reserve-list__heading">
          <span>Riserve</span>
          <small>{reserves.length ? 'ordine di adesione' : 'nessuna lista d’attesa'}</small>
        </div>
        {reserves.length > 0 ? (
          <ol>
            {reserves.map((reserve, index) => (
              <li className={reserve.userId === user.id ? 'is-you' : ''} key={reserve.id}>
                <span>{index + 1}</span>
                <strong>{reserve.displayName}</strong>
                {reserve.userId === user.id && <small>Tu</small>}
              </li>
            ))}
          </ol>
        ) : (
          <p>Chi si aggiunge dopo i primi quattro comparirà qui.</p>
        )}
      </section>

      <footer className="slot-card__actions">
        {!disabled && (
          joined ? (
            <button className="button button--secondary button--grow" type="button" onClick={leave} disabled={busy}>
              <LogOut size={17} /> {position < 4 ? 'Ritirati' : 'Lascia la riserva'}
            </button>
          ) : (
            <button
              className="button button--primary button--grow"
              type="button"
              onClick={() => run(
                () => repository.joinSlot(poll.id, slot.id, user),
                slot.signups.length < 4 ? 'Sei tra i titolari.' : `Sei la riserva n° ${slot.signups.length - 3}.`,
              )}
              disabled={busy}
            >
              <UserRoundPlus size={17} /> Ci sono
            </button>
          )
        )}

        {!disabled && userIsStarter && (
          <div className="substitution-action">
            <button
              className="button button--ghost"
              type="button"
              onClick={() => setSubstitutionOpen(true)}
              disabled={busy}
              aria-describedby={substitutionTooltipId}
            >
              <ArrowLeftRight size={17} /> Passo il posto
            </button>
            <button
              className="substitution-action__help"
              type="button"
              aria-label="Come funziona Passo il posto"
              aria-describedby={substitutionTooltipId}
            >
              <CircleHelp size={16} />
            </button>
            <span className="action-tooltip" id={substitutionTooltipId} role="tooltip">
              Scegli chi ti sostituisce: prenderà la tua posizione e tu uscirai dallo slot. Se era in riserva, verrà rimosso dalla lista d’attesa.
            </span>
          </div>
        )}

        {!disabled && phase !== 'booked' && (
          <button className="button button--booking" type="button" onClick={() => setBookingOpen(true)} disabled={busy}>
            <Check size={17} /> Campo prenotato
          </button>
        )}

        {!disabled && phase === 'booked' && (
          <button className="text-button text-button--danger slot-card__unbook" type="button" onClick={unbook} disabled={busy}>
            Non più prenotato
          </button>
        )}
      </footer>

      {bookingOpen && (
        <BookingModal
          slot={slot}
          user={user}
          onClose={() => setBookingOpen(false)}
          onSave={(booking) => syncPoll(() => repository.setBooking(poll.id, slot.id, booking))}
          onDone={onNotify}
        />
      )}
      {scheduleOpen && (
        <EditSlotModal
          slot={slot}
          onClose={() => setScheduleOpen(false)}
          onSave={(startsAt) => syncPoll(() => repository.rescheduleSlot(poll.id, slot.id, startsAt))}
          onDone={onNotify}
        />
      )}
      {substitutionOpen && (
        <SubstitutionModal
          slot={slot}
          user={user}
          members={members}
          onClose={() => setSubstitutionOpen(false)}
          onSubstitute={(replacement) => syncPoll(() => repository.substitute(poll.id, slot.id, user.id, replacement))}
          onDone={onNotify}
        />
      )}
    </article>
  )
}
