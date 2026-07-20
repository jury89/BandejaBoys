import { Archive, CalendarDays, RotateCcw } from 'lucide-react'
import type { MemberProfile, PadelPoll, SessionUser } from '../types'
import { getSlotPhase } from '../lib/domain'
import { weekLabel } from '../lib/format'
import { resolveMemberName } from '../lib/memberNames'
import { repository } from '../lib/repository'
import { SlotCard } from './SlotCard'

interface PollCardProps {
  poll: PadelPoll
  user: SessionUser
  members: MemberProfile[]
  bookedOnly?: boolean
  onPollChange: (poll: PadelPoll) => void
  onNotify: (message: string) => void
  onError: (message: string) => void
}

export function PollCard({ poll, user, members, bookedOnly = false, onPollChange, onNotify, onError }: PollCardProps) {
  const canManage = poll.createdBy === user.id
  const creatorName = resolveMemberName(members, poll.createdBy, poll.createdByName)
  const visibleSlots = bookedOnly
    ? poll.slots.filter((slot) => getSlotPhase(slot) === 'booked')
    : poll.slots

  const toggleStatus = async () => {
    try {
      const next = poll.status === 'open' ? 'closed' : 'open'
      const updated = await repository.setPollStatus(poll.id, next)
      onPollChange(updated)
      onNotify(next === 'closed' ? 'Sondaggio archiviato.' : 'Sondaggio riaperto.')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Non è stato possibile aggiornare il sondaggio.')
    }
  }

  return (
    <section className={`poll-card ${poll.status === 'closed' ? 'poll-card--closed' : ''}`}>
      <header className="poll-card__header">
        <div className="poll-card__identity">
          <p className="poll-card__week"><CalendarDays size={14} /> Settimana {weekLabel(poll.targetWeekStart)}</p>
          <h2>{poll.title}</h2>
          <p className="poll-card__meta"><span>Creato da {creatorName}</span><span aria-hidden="true">·</span><strong>{visibleSlots.length} slot</strong></p>
        </div>
        {canManage && (
          <button
            className="button button--ghost button--small poll-card__manage"
            type="button"
            aria-label={poll.status === 'open' ? 'Archivia sondaggio' : 'Riapri sondaggio'}
            onClick={toggleStatus}
          >
            {poll.status === 'open' ? <Archive size={16} /> : <RotateCcw size={16} />}
            <span className="poll-card__manage-label">{poll.status === 'open' ? 'Archivia' : 'Riapri'}</span>
          </button>
        )}
      </header>
      {poll.status === 'closed' && <div className="closed-banner">Sondaggio chiuso · puoi ancora consultare l’ordine delle adesioni</div>}
      <div className="poll-card__slots">
        {visibleSlots.map((slot) => (
          <SlotCard
            key={slot.id}
            poll={poll}
            slot={slot}
            user={user}
            members={members}
            disabled={poll.status === 'closed'}
            onPollChange={onPollChange}
            onNotify={onNotify}
            onError={onError}
          />
        ))}
      </div>
    </section>
  )
}
