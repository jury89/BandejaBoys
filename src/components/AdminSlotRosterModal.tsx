import { useMemo, useState, type FormEvent } from 'react'
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ShieldCheck,
  Trash2,
  UserRoundPlus,
} from 'lucide-react'
import type {
  AdminSlotRosterAction,
  MemberProfile,
  PadelSlot,
  Signup,
  SignupRole,
} from '../types'
import { getReserves, getStarters, isGuestSignup, MAX_STARTERS } from '../lib/domain'
import { resolveMemberName } from '../lib/memberNames'
import { Modal } from './Modal'
import { ProfileAvatar } from './ProfileAvatar'

interface AdminSlotRosterModalProps {
  slot: PadelSlot
  members: MemberProfile[]
  onClose: () => void
  onApply: (action: AdminSlotRosterAction) => Promise<void>
  onDone: (message: string) => void
}

export function AdminSlotRosterModal({
  slot,
  members,
  onClose,
  onApply,
  onDone,
}: AdminSlotRosterModalProps) {
  const starters = getStarters(slot)
  const reserves = getReserves(slot)
  const starterIds = useMemo(() => new Set(starters.map((signup) => signup.id)), [starters])
  const signedUserIds = useMemo(() => new Set(slot.signups.map((signup) => signup.userId)), [slot.signups])
  const availableMembers = useMemo(() => members
    .filter((member) => !signedUserIds.has(member.id))
    .sort((left, right) => left.displayName.localeCompare(right.displayName, 'it')),
  [members, signedUserIds])
  const [selectedMemberId, setSelectedMemberId] = useState(availableMembers[0]?.id ?? '')
  const [selectedRole, setSelectedRole] = useState<SignupRole>(
    starters.length < MAX_STARTERS ? 'starter' : 'reserve',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const effectiveMemberId = availableMembers.some((member) => member.id === selectedMemberId)
    ? selectedMemberId
    : availableMembers[0]?.id ?? ''
  const effectiveRole: SignupRole = starters.length >= MAX_STARTERS && selectedRole === 'starter'
    ? 'reserve'
    : selectedRole

  const memberProfile = (userId: string) => members.find((member) => member.id === userId)
  const playerName = (signup: Signup) => resolveMemberName(members, signup.userId, signup.displayName)

  const apply = async (action: AdminSlotRosterAction, success: string) => {
    setBusy(true)
    setError('')
    try {
      await onApply(action)
      onDone(success)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Modifica amministrativa non riuscita.')
    } finally {
      setBusy(false)
    }
  }

  const changeRole = async (signup: Signup) => {
    const isStarter = starterIds.has(signup.id)
    const nextRole: SignupRole = isStarter ? 'reserve' : 'starter'
    if (nextRole === 'starter' && starters.length >= MAX_STARTERS) {
      setError('Sposta prima un titolare tra le riserve, poi promuovi il giocatore scelto.')
      return
    }
    const name = playerName(signup)
    await apply(
      { kind: 'set-role', signupId: signup.id, role: nextRole },
      `${name} ora è ${nextRole === 'starter' ? 'titolare' : 'in riserva'}.`,
    )
  }

  const remove = async (signup: Signup) => {
    const name = playerName(signup)
    const promoted = starterIds.has(signup.id) ? reserves[0] : undefined
    const promotionCopy = promoted
      ? ` ${playerName(promoted)} verrà promosso automaticamente tra i titolari.`
      : ''
    if (!window.confirm(`Rimuovere ${name} dallo slot?${promotionCopy}`)) return
    await apply(
      { kind: 'remove', signupId: signup.id },
      `${name} è stato rimosso dallo slot.`,
    )
  }

  const addMember = async (event: FormEvent) => {
    event.preventDefault()
    const member = availableMembers.find((candidate) => candidate.id === effectiveMemberId)
    if (!member) {
      setError('Scegli un giocatore da aggiungere.')
      return
    }
    await apply(
      {
        kind: 'add',
        member: { id: member.id, displayName: member.displayName },
        role: effectiveRole,
      },
      `${member.displayName} è stato aggiunto come ${effectiveRole === 'starter' ? 'titolare' : 'riserva'}.`,
    )
  }

  const roster = [...starters, ...reserves]

  return (
    <Modal title="Gestisci giocatori" eyebrow="Controlli amministratore" onClose={onClose} size="wide">
      <div className="admin-roster">
        <div className="admin-roster__notice">
          <span aria-hidden="true"><ShieldCheck size={22} /></span>
          <div>
            <strong>Modifica diretta della formazione</strong>
            <p>Puoi intervenire senza conferma del giocatore. Ogni operazione resta visibile nella cronologia dello slot.</p>
          </div>
        </div>

        <section className="admin-roster__section" aria-labelledby="admin-roster-current">
          <div className="admin-roster__heading">
            <div>
              <p className="eyebrow">Formazione attuale</p>
              <h3 id="admin-roster-current">Titolari e riserve</h3>
            </div>
            <span>{starters.length}/4 titolari · {reserves.length} {reserves.length === 1 ? 'riserva' : 'riserve'}</span>
          </div>

          {roster.length > 0 ? (
            <ul className="admin-roster__players">
              {roster.map((signup) => {
                const isStarter = starterIds.has(signup.id)
                const profile = memberProfile(signup.userId)
                const name = playerName(signup)
                const cannotPromote = !isStarter && starters.length >= MAX_STARTERS
                return (
                  <li key={signup.id}>
                    <ProfileAvatar
                      displayName={name}
                      avatarDataUrl={profile?.avatarDataUrl}
                      className="admin-roster__avatar"
                    />
                    <span className="admin-roster__player-copy">
                      <strong>{name}</strong>
                      <small>{isGuestSignup(signup) ? 'Ospite' : 'Membro registrato'}</small>
                    </span>
                    <span className={`admin-roster__role admin-roster__role--${isStarter ? 'starter' : 'reserve'}`}>
                      {isStarter ? 'Titolare' : `Riserva ${reserves.findIndex((entry) => entry.id === signup.id) + 1}`}
                    </span>
                    <div className="admin-roster__player-actions">
                      <button
                        className="button button--secondary admin-roster__role-action"
                        type="button"
                        onClick={() => void changeRole(signup)}
                        disabled={busy || cannotPromote}
                        title={cannotPromote ? 'Sposta prima un titolare tra le riserve' : undefined}
                      >
                        {isStarter ? <ArrowDownToLine size={15} /> : <ArrowUpToLine size={15} />}
                        {isStarter ? 'Passa a riserva' : 'Promuovi titolare'}
                      </button>
                      <button
                        className="admin-roster__remove"
                        type="button"
                        onClick={() => void remove(signup)}
                        disabled={busy}
                        aria-label={`Rimuovi ${name} dallo slot`}
                        title={`Rimuovi ${name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="empty-inline">Lo slot non ha ancora giocatori.</p>
          )}
        </section>

        <form className="admin-roster__add" onSubmit={addMember}>
          <div className="admin-roster__heading">
            <div>
              <p className="eyebrow">Aggiunta forzata</p>
              <h3>Aggiungi un membro</h3>
            </div>
          </div>
          {availableMembers.length > 0 ? (
            <div className="admin-roster__add-grid">
              <label className="field">
                Giocatore
                <select
                  value={effectiveMemberId}
                  onChange={(event) => setSelectedMemberId(event.target.value)}
                  disabled={busy}
                >
                  {availableMembers.map((member) => (
                    <option value={member.id} key={member.id}>{member.displayName}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Ruolo
                <select
                  value={effectiveRole}
                  onChange={(event) => setSelectedRole(event.target.value as SignupRole)}
                  disabled={busy}
                >
                  <option value="starter" disabled={starters.length >= MAX_STARTERS}>Titolare</option>
                  <option value="reserve">Riserva</option>
                </select>
              </label>
              <button className="button button--primary" type="submit" disabled={busy}>
                <UserRoundPlus size={17} /> {busy ? 'Salvataggio…' : 'Aggiungi giocatore'}
              </button>
            </div>
          ) : (
            <p className="empty-inline">Tutti i membri registrati sono già presenti nello slot.</p>
          )}
        </form>

        {error && <p className="form-message form-message--error" role="alert">{error}</p>}
        <footer className="modal__actions">
          <button className="button button--secondary" type="button" onClick={onClose} disabled={busy}>Chiudi</button>
        </footer>
      </div>
    </Modal>
  )
}
