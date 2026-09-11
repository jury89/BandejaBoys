import { useEffect, useId, useRef, useState } from 'react'
import { useInterfaceMode } from '../InterfaceContext'
import {
  ArrowRight,
  ArrowLeftRight,
  CalendarCheck2,
  CalendarPlus,
  Check,
  Clock3,
  History,
  LogOut,
  MapPin,
  MoreHorizontal,
  PencilLine,
  PhoneCall,
  ShieldCheck,
  Trash2,
  UserRoundPlus,
} from 'lucide-react'
import type { MemberProfile, PadelPoll, PadelSlot, SessionUser, Signup, SignupRole } from '../types'
import {
  DEFAULT_VENUE,
  getReserves,
  getSlotPhase,
  getStarters,
  isGuestSignup,
  isStarter,
  MAX_STARTERS,
} from '../lib/domain'
import { downloadSlotCalendar } from '../lib/calendar'
import { isSlotAdmin } from '../lib/admin'
import { slotDateParts } from '../lib/format'
import { resolveMemberName } from '../lib/memberNames'
import { repository } from '../lib/repository'
import { slotViewSessionKey, trackSustainedSlotView } from '../lib/slotViewTracking'
import { slotElementId } from '../lib/slotNavigation'
import { EditSlotModal } from './EditSlotModal'
import { AdminSlotRosterModal } from './AdminSlotRosterModal'
import { GuestPlayerModal } from './GuestPlayerModal'
import { ProfileAvatar } from './ProfileAvatar'
import { SlotActivityModal } from './SlotActivityModal'
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
  const isNewInterface = useInterfaceMode() === 'nuova'
  const participationHelpId = useId()
  const cardRef = useRef<HTMLElement>(null)
  const menuRef = useRef<HTMLDetailsElement>(null)
  const [activityOpen, setActivityOpen] = useState(false)
  const [adminRosterOpen, setAdminRosterOpen] = useState(false)
  const [guestPlayerOpen, setGuestPlayerOpen] = useState(false)
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
  const userIsAdmin = isSlotAdmin(user.id)
  const memberProfile = (userId: string | undefined) =>
    members.find((member) => member.id === userId) ?? (userId === user.id ? user : undefined)
  const memberName = (userId: string | undefined, savedName: string | undefined) =>
    memberProfile(userId)?.displayName ?? resolveMemberName(members, userId, savedName)

  useEffect(() => {
    if (!isNewInterface) return
    const closeMenu = (event: PointerEvent) => {
      const menu = menuRef.current
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false
    }
    document.addEventListener('pointerdown', closeMenu)
    return () => document.removeEventListener('pointerdown', closeMenu)
  }, [isNewInterface])

  useEffect(() => {
    const element = cardRef.current
    if (!element) return
    return trackSustainedSlotView(
      element,
      slotViewSessionKey(poll.id, slot.id, user.id),
      () => repository.recordSlotView(poll, slot, user),
    )
  }, [poll, slot, user])

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
      () => repository.leaveSlot(poll.id, slot.id, user),
      losesPriority ? `${memberName(reserves[0].userId, reserves[0].displayName)} è stato promosso tra i titolari.` : 'Adesione rimossa.',
    )
  }

  const join = async (role: SignupRole) => {
    await run(
      () => repository.joinSlot(poll.id, slot.id, user, role),
      role === 'starter' ? 'Sei tra i titolari.' : `Sei la riserva n° ${reserves.length + 1}.`,
    )
  }

  const takeStarterPlace = () => run(
    () => repository.takeStarterPlace(poll.id, slot.id, user),
    'Sei passato da riserva a titolare.',
  )

  const removeGuest = async (guest: Signup) => {
    const guestIsStarter = starters.some((signup) => signup.id === guest.id)
    const promoted = guestIsStarter ? reserves[0] : undefined
    const promotionCopy = promoted
      ? ` ${memberName(promoted.userId, promoted.displayName)} passerà tra i titolari.`
      : ''
    if (!window.confirm(`Rimuovere ${guest.displayName} dallo slot?${promotionCopy}`)) return

    await run(
      () => repository.removeGuest(poll.id, slot.id, user, guest.id),
      promoted
        ? `${guest.displayName} è stato rimosso. ${memberName(promoted.userId, promoted.displayName)} è ora titolare.`
        : `${guest.displayName} è stato rimosso dallo slot.`,
    )
  }

  const unbook = async () => {
    if (!window.confirm('Segnare questo campo come non più prenotato?')) return
    await run(() => repository.setBooking(poll.id, slot.id, null, user), 'Lo slot è tornato da prenotare.')
  }

  const deleteSlot = async () => {
    const bookingWarning = phase === 'booked'
      ? ` Il campo risulta prenotato: dovrai annullarlo direttamente con l’Oasi Boschetto.`
      : ''
    if (!window.confirm(
      `Eliminare lo slot di ${date.full} alle ${date.time}? Verranno rimosse tutte le adesioni e le riserve.${bookingWarning}`,
    )) return
    await run(() => repository.deleteSlot(poll.id, slot.id, user), 'Slot eliminato.')
  }

  const book = () => run(
    () => repository.setBooking(poll.id, slot.id, { bookedBy: user }, user),
    `Campo prenotato all’Oasi Boschetto. L’orario è confermato.`,
  )

  const addToCalendar = () => {
    downloadSlotCalendar(poll, slot)
    onNotify('Evento calendario pronto: aprilo per aggiungere la partita.')
  }

  return (
    <article
      id={slotElementId({ pollId: poll.id, slotId: slot.id })}
      ref={cardRef}
      className={`slot-card slot-card--${phase} ${isNewInterface ? 'club-slot' : ''}`}
    >
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
          <details ref={menuRef} className={isNewInterface ? 'club-slot-menu' : 'classic-slot-menu'} open={isNewInterface ? undefined : true} onKeyDown={(event) => {
            if (isNewInterface && event.key === 'Escape') {
              event.currentTarget.open = false
              event.currentTarget.querySelector('summary')?.focus()
            }
          }}>
            <summary hidden={!isNewInterface} aria-label={`Altre azioni per lo slot di ${date.full} alle ${date.time}`}><MoreHorizontal size={19} /><span>Altre azioni</span></summary>
          <div className="slot-card__management" role="group" aria-label="Azioni dello slot" onClick={(event) => {
            if (isNewInterface && event.target instanceof Element && event.target.closest('button') && menuRef.current) menuRef.current.open = false
          }}>
            {userIsAdmin && (
              <button
                className="slot-card__icon-action slot-card__icon-action--admin"
                type="button"
                onClick={() => setAdminRosterOpen(true)}
                disabled={busy}
                title="Gestisci tutti i giocatori"
                aria-label={`Gestisci i giocatori dello slot di ${date.full} alle ${date.time}`}
              >
                <ShieldCheck size={16} />
                {isNewInterface && <span>Gestisci giocatori</span>}
              </button>
            )}
            {!disabled && (
              <button
                className="slot-card__icon-action slot-card__icon-action--guest"
                type="button"
                onClick={() => setGuestPlayerOpen(true)}
                disabled={busy}
                title="Aggiungi un ospite"
                aria-label={`Aggiungi un ospite allo slot di ${date.full} alle ${date.time}`}
              >
                <UserRoundPlus size={16} />
                {isNewInterface && <span>Aggiungi ospite</span>}
              </button>
            )}
            {!isNewInterface && <button className="slot-card__icon-action slot-card__icon-action--calendar" type="button" onClick={addToCalendar} title="Aggiungi al calendario" aria-label={`Aggiungi lo slot di ${date.full} alle ${date.time} al calendario`}><CalendarPlus size={16} /></button>}
            <button
              className="slot-card__icon-action slot-card__icon-action--history"
              type="button"
              onClick={() => setActivityOpen(true)}
              title="Vedi cronologia"
              aria-label={`Vedi la cronologia dello slot di ${date.full} alle ${date.time}`}
            >
              <History size={16} />
              {isNewInterface && <span>Cronologia</span>}
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
                  {isNewInterface && <span>Modifica data e ora</span>}
                </button>
                <button
                  className="slot-card__icon-action slot-card__icon-action--delete"
                  type="button"
                  onClick={deleteSlot}
                  disabled={busy}
                  title="Elimina slot"
                  aria-label={`Elimina lo slot di ${date.full} alle ${date.time}`}
                >
                  <Trash2 size={15} />
                  {isNewInterface && <span>Elimina slot</span>}
                </button>
              </>
            )}
          </div>
          </details>
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

      {isNewInterface && <div className="club-slot-roster-heading">
        <strong>{starters.length}/4 titolari</strong>
        {joined && <span className="club-your-place">{userIsStarter ? 'Sei titolare' : `Sei la riserva n° ${reserves.findIndex((signup) => signup.userId === user.id) + 1}`}</span>}
      </div>}
      <section className={isNewInterface ? 'club-roster' : 'court-lineup'} aria-label="Titolari">
        <div className={isNewInterface ? 'club-roster__net' : 'court-lineup__net'} aria-hidden="true" />
        {Array.from({ length: 4 }, (_, index) => {
          const signup = starters[index]
          return (
            <div className={`${isNewInterface ? `club-roster__player club-roster__player--${index + 1} ${signup ? 'is-filled' : 'is-empty'}` : `court-player court-player--${index + 1}`} ${signup?.userId === user.id ? 'is-you' : ''}`} key={signup?.id ?? `empty-${index}`}>
              <span className={isNewInterface ? 'club-roster__marker' : 'court-player__marker'}>{index + 1}</span>
              {signup ? (
                <>
                  {(isNewInterface || memberProfile(signup.userId)?.avatarDataUrl) && <ProfileAvatar
                    displayName={memberName(signup.userId, signup.displayName)}
                    avatarDataUrl={memberProfile(signup.userId)?.avatarDataUrl}
                    className={isNewInterface ? 'club-roster__avatar' : 'court-player__avatar'}
                  />}
                  <span className={isNewInterface ? 'club-roster__name' : 'court-player__name'}>
                    <strong>{memberName(signup.userId, signup.displayName)}</strong>
                    {signup.userId === user.id && <small>Tu</small>}
                    {isGuestSignup(signup) && <small className={isNewInterface ? undefined : 'guest-pass'}>Ospite</small>}
                    {signup.substitutedFor && (
                      <small>per {memberName(signup.substitutedFor.userId, signup.substitutedFor.displayName)}</small>
                    )}
                  </span>
                  {!disabled && isGuestSignup(signup) && (
                    <button
                      className={isNewInterface ? 'club-guest-remove' : 'guest-remove-action guest-remove-action--court'}
                      type="button"
                      onClick={() => removeGuest(signup)}
                      disabled={busy}
                      title={`Rimuovi ${signup.displayName}`}
                      aria-label={`Rimuovi l’ospite ${signup.displayName} dallo slot`}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </>
              ) : (
                <span className={isNewInterface ? 'club-roster__empty' : 'court-player__name court-player__name--empty'}>Posto libero</span>
              )}
            </div>
          )
        })}
      </section>

      <section className={isNewInterface ? `club-reserves ${reserves.length === 0 ? 'club-reserves--empty' : ''}` : 'reserve-list'} aria-label="Lista d’attesa">
        <div className={isNewInterface ? 'club-reserves__heading' : 'reserve-list__heading'}>
          <span>Riserve</span>
          <small>{reserves.length ? 'ordine di adesione' : 'nessuna lista d’attesa'}</small>
        </div>
        {reserves.length > 0 ? (
          <ol>
            {reserves.map((reserve, index) => (
              <li className={reserve.userId === user.id ? 'is-you' : ''} key={reserve.id}>
                <span className={isNewInterface ? 'club-reserves__position' : undefined} aria-label={`Riserva numero ${index + 1}`}>{index + 1}</span>
                {(isNewInterface || memberProfile(reserve.userId)?.avatarDataUrl) && <ProfileAvatar
                  displayName={memberName(reserve.userId, reserve.displayName)}
                  avatarDataUrl={memberProfile(reserve.userId)?.avatarDataUrl}
                  className={isNewInterface ? 'club-roster__avatar' : 'reserve-list__avatar'}
                />}
                {isNewInterface ? <span className="club-roster__name">
                  <strong>{memberName(reserve.userId, reserve.displayName)}</strong>
                  {reserve.userId === user.id && <small>Tu</small>}
                  {isGuestSignup(reserve) && <small>Ospite</small>}
                </span> : <>
                  <strong>{memberName(reserve.userId, reserve.displayName)}</strong>
                  {reserve.userId === user.id && <small>Tu</small>}
                  {isGuestSignup(reserve) && <small className="guest-pass guest-pass--reserve">Ospite</small>}
                </>}
                {!disabled && isGuestSignup(reserve) && (
                  <button
                    className={isNewInterface ? 'club-guest-remove' : 'guest-remove-action guest-remove-action--reserve'}
                    type="button"
                    onClick={() => removeGuest(reserve)}
                    disabled={busy}
                    title={`Rimuovi ${reserve.displayName}`}
                    aria-label={`Rimuovi l’ospite ${reserve.displayName} dallo slot`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
          </ol>
        ) : !isNewInterface && <p>Chi sceglie Riserva o arriva dopo i primi quattro comparirà qui.</p>}
      </section>

      <footer className="slot-card__actions">
        {!disabled && (
          joined ? (
            <div className={isNewInterface ? 'club-participation' : 'classic-participation'} role="group" aria-label="Gestisci iscrizione">
              {!userIsStarter && starters.length < MAX_STARTERS && (
                <button className="button button--primary" type="button" onClick={takeStarterPlace} disabled={busy}>
                  <UserRoundPlus size={17} /> Passa a titolare
                </button>
              )}
              <button className="button button--secondary button--grow" type="button" onClick={leave} disabled={busy}>
                <LogOut size={17} /> {userIsStarter ? 'Ritirati' : 'Lascia la riserva'}
              </button>
              {userIsStarter && <button className="button button--ghost" type="button" onClick={() => setSubstitutionOpen(true)} disabled={busy} aria-describedby={participationHelpId}>
                <ArrowLeftRight size={17} /> Passo il posto
              </button>}
              {userIsStarter && <p className={isNewInterface ? undefined : 'sr-only'} id={participationHelpId}>Con “Passo il posto” scegli chi ti sostituisce.{reserves.length > 0 ? ' Se ti ritiri, entra la prima riserva.' : ''}</p>}
            </div>
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
                  <strong>{isNewInterface ? (starters.length >= MAX_STARTERS ? 'Titolari al completo' : 'Mi iscrivo') : 'Titolare'}</strong>
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
                  <strong>{isNewInterface ? 'Entra in riserva' : 'Riserva'}</strong>
                  <small>In lista d’attesa</small>
                </span>
              </button>
            </div>
          )
        )}

        {isNewInterface && <button className="button button--ghost club-calendar" type="button" onClick={addToCalendar} aria-label={`Aggiungi lo slot di ${date.full} alle ${date.time} al calendario`}>
          <CalendarPlus size={17} /><span>Calendario</span>
        </button>}

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
          onSave={(startsAt) => syncPoll(() => repository.rescheduleSlot(poll.id, slot.id, startsAt, user))}
          onDone={onNotify}
        />
      )}
      {adminRosterOpen && (
        <AdminSlotRosterModal
          slot={slot}
          members={members}
          onClose={() => setAdminRosterOpen(false)}
          onApply={(action) => syncPoll(
            () => repository.adminUpdateSlotRoster(poll.id, slot.id, user, action),
          )}
          onDone={onNotify}
        />
      )}
      {guestPlayerOpen && (
        <GuestPlayerModal
          slot={slot}
          onClose={() => setGuestPlayerOpen(false)}
          onAdd={(displayName, role) => syncPoll(
            () => repository.addGuest(poll.id, slot.id, user, displayName, role),
          )}
          onDone={onNotify}
        />
      )}
      {activityOpen && (
        <SlotActivityModal
          poll={poll}
          slot={slot}
          onClose={() => setActivityOpen(false)}
        />
      )}
      {substitutionOpen && (
        <SubstitutionModal
          slot={slot}
          user={user}
          members={members}
          onClose={() => setSubstitutionOpen(false)}
          onSubstitute={(replacement) => syncPoll(() => repository.substitute(poll.id, slot.id, user, replacement))}
          onDone={onNotify}
        />
      )}
    </article>
  )
}
