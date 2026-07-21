import { useId, useState } from 'react'
import {
  ArrowRight,
  ArrowLeftRight,
  CalendarCheck2,
  CalendarPlus,
  Check,
  CircleHelp,
  Clock3,
  LogOut,
  MapPin,
  PencilLine,
  PhoneCall,
  Trash2,
  UserRoundPlus,
} from 'lucide-react'
import type { MemberProfile, PadelPoll, PadelSlot, SessionUser, SignupRole } from '../types'
import {
  DEFAULT_VENUE,
  getReserves,
  getSlotPhase,
  getStarters,
  isStarter,
  MAX_STARTERS,
} from '../lib/domain'
import { downloadSlotCalendar } from '../lib/calendar'
import { slotDateParts } from '../lib/format'
import { resolveMemberName } from '../lib/memberNames'
import { repository } from '../lib/repository'
import { EditSlotModal } from './EditSlotModal'
import { ProfileAvatar } from './ProfileAvatar'
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
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [substitutionOpen, setSubstitutionOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const date = slotDateParts(slot.startsAt)
  const starters = getStarters(slot)
  const reserves = getReserves(slot)
  const phase = getSlotPhase(slot)
  const timeIsConfirmed = phase === 'booked'
  const PhaseIcon = phaseCopy[phase].icon
  const joined = slot.signups.some((signup) => signup.userId === user.id)
  const userIsStarter = isStarter(slot, user.id)
  const memberProfile = (userId: string | undefined) =>
    members.find((member) => member.id === userId) ?? (userId === user.id ? user : undefined)
  const memberName = (userId: string | undefined, savedName: string | undefined) =>
    memberProfile(userId)?.displayName ?? resolveMemberName(members, userId, savedName)

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
      losesPriority ? `${memberName(reserves[0].userId, reserves[0].displayName)} è stato promosso tra i titolari.` : 'Adesione rimossa.',
    )
  }

  const join = async (role: SignupRole) => {
    await run(
      () => repository.joinSlot(poll.id, slot.id, user, role),
      role === 'starter' ? 'Sei tra i titolari.' : `Sei la riserva n° ${reserves.length + 1}.`,
    )
  }

  const unbook = async () => {
    if (!window.confirm('Segnare questo campo come non più prenotato?')) return
    await run(() => repository.setBooking(poll.id, slot.id, null), 'Lo slot è tornato da prenotare.')
  }

  const deleteSlot = async () => {
    const bookingWarning = phase === 'booked'
      ? ` Il campo risulta prenotato: dovrai annullarlo direttamente con l’Oasi Boschetto.`
      : ''
    if (!window.confirm(
      `Eliminare lo slot di ${date.full} alle ${date.time}? Verranno rimosse tutte le adesioni e le riserve.${bookingWarning}`,
    )) return
    await run(() => repository.deleteSlot(poll.id, slot.id), 'Slot eliminato.')
  }

  const book = () => run(
    () => repository.setBooking(poll.id, slot.id, { bookedBy: user }),
    `Campo prenotato all’Oasi Boschetto. L’orario è confermato.`,
  )

  const addToCalendar = () => {
    downloadSlotCalendar(poll, slot)
    onNotify('Evento calendario pronto: aprilo per aggiungere la partita.')
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
          <span className={`slot-time__certainty slot-time__certainty--${timeIsConfirmed ? 'confirmed' : 'tentative'}`}>
            {timeIsConfirmed ? <Check size={11} /> : <Clock3 size={11} />}
            {timeIsConfirmed ? 'Orario confermato' : 'Orario indicativo'}
          </span>
        </div>
        <div className="slot-card__status">
          <div className={`status-pill status-pill--${phase}`}>
            <PhaseIcon size={14} />
            {phaseCopy[phase].label}
          </div>
          <div className="slot-card__management" role="group" aria-label="Azioni dello slot">
            <button
              className="slot-card__icon-action slot-card__icon-action--calendar"
              type="button"
              onClick={addToCalendar}
              title="Aggiungi al calendario"
              aria-label={`Aggiungi lo slot di ${date.full} alle ${date.time} al calendario`}
            >
              <CalendarPlus size={16} />
            </button>
            {!disabled && (
              <>
                <button
                  className="slot-card__icon-action slot-card__icon-action--edit"
                  type="button"
                  onClick={() => setScheduleOpen(true)}
                  disabled={busy}
                  title="Modifica data e ora"
                  aria-label="Modifica data e ora dello slot"
                >
                  <PencilLine size={15} />
                </button>
                <button
                  className="slot-card__icon-action slot-card__icon-action--delete"
                  type="button"
                  onClick={deleteSlot}
                  disabled={busy || poll.slots.length === 1}
                  title={poll.slots.length === 1 ? 'Aggiungi un altro slot prima di eliminare questo.' : 'Elimina slot'}
                  aria-label={`Elimina lo slot di ${date.full} alle ${date.time}`}
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {phase === 'booked' && (
        <div className="booking-strip">
          <span className="booking-strip__pin" aria-hidden="true"><MapPin size={16} /></span>
          <span className="booking-strip__copy">
            <strong>{DEFAULT_VENUE}</strong>
            <small>Prenotazione confermata da {memberName(slot.bookedBy, slot.bookedByName)}</small>
          </span>
          <span className="booking-strip__stamp"><Check size={13} /> Confermato</span>
        </div>
      )}

      {phase !== 'booked' && (
        <div className="booking-strip booking-strip--pending" aria-label="Campo da prenotare">
          <span className="booking-strip__pin" aria-hidden="true"><CalendarCheck2 size={16} /></span>
          <span className="booking-strip__copy">
            <strong>Campo da prenotare</strong>
            <small>Prenotazione non ancora confermata</small>
          </span>
          <span className="booking-strip__stamp"><Clock3 size={13} /> In attesa</span>
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
                <>
                  {memberProfile(signup.userId)?.avatarDataUrl && (
                    <ProfileAvatar
                      displayName={memberName(signup.userId, signup.displayName)}
                      avatarDataUrl={memberProfile(signup.userId)?.avatarDataUrl}
                      className="court-player__avatar"
                    />
                  )}
                  <span className="court-player__name">
                    <strong>{memberName(signup.userId, signup.displayName)}</strong>
                    {signup.userId === user.id && <small>Tu</small>}
                    {signup.substitutedFor && (
                      <small>per {memberName(signup.substitutedFor.userId, signup.substitutedFor.displayName)}</small>
                    )}
                  </span>
                </>
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
                {memberProfile(reserve.userId)?.avatarDataUrl && (
                  <ProfileAvatar
                    displayName={memberName(reserve.userId, reserve.displayName)}
                    avatarDataUrl={memberProfile(reserve.userId)?.avatarDataUrl}
                    className="reserve-list__avatar"
                  />
                )}
                <strong>{memberName(reserve.userId, reserve.displayName)}</strong>
                {reserve.userId === user.id && <small>Tu</small>}
              </li>
            ))}
          </ol>
        ) : (
          <p>Chi sceglie Riserva o arriva dopo i primi quattro comparirà qui.</p>
        )}
      </section>

      <footer className="slot-card__actions">
        {!disabled && (
          joined ? (
            <button className="button button--secondary button--grow" type="button" onClick={leave} disabled={busy}>
              <LogOut size={17} /> {userIsStarter ? 'Ritirati' : 'Lascia la riserva'}
            </button>
          ) : (
            <div className="join-choice" role="group" aria-label="Scegli come partecipare">
              <p className="join-choice__label">Come vuoi segnarti?</p>
              <button
                className="join-option join-option--starter"
                type="button"
                onClick={() => join('starter')}
                disabled={busy || starters.length >= MAX_STARTERS}
                aria-label="Segnati come titolare"
              >
                <span className="join-option__icon" aria-hidden="true"><UserRoundPlus size={17} /></span>
                <span>
                  <strong>Titolare</strong>
                  <small>{starters.length >= MAX_STARTERS ? '4/4 completi' : `${starters.length}/4 occupati`}</small>
                </span>
              </button>
              <button
                className="join-option join-option--reserve"
                type="button"
                onClick={() => join('reserve')}
                disabled={busy}
                aria-label="Segnati come riserva"
              >
                <span className="join-option__icon" aria-hidden="true"><Clock3 size={17} /></span>
                <span>
                  <strong>Riserva</strong>
                  <small>In lista d’attesa</small>
                </span>
              </button>
            </div>
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
          <button
            className="booking-action"
            type="button"
            onClick={book}
            disabled={busy}
            aria-label="Segna il campo come prenotato all’Oasi Boschetto"
          >
            <span className="booking-action__icon" aria-hidden="true"><CalendarCheck2 size={19} /></span>
            <span className="booking-action__copy">
              <small>{DEFAULT_VENUE}</small>
              <strong>{busy ? 'Salvataggio…' : 'Segna come prenotato'}</strong>
            </span>
            <ArrowRight className="booking-action__arrow" size={18} aria-hidden="true" />
          </button>
        )}

        {!disabled && phase === 'booked' && (
          <button className="text-button text-button--danger slot-card__unbook" type="button" onClick={unbook} disabled={busy}>
            Non più prenotato
          </button>
        )}
      </footer>

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
