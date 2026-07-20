import { Archive, CalendarDays, RotateCcw } from 'lucide-react'
import type { MemberProfile, PadelPoll, SessionUser } from '../types'
import { weekLabel } from '../lib/format'
import { repository } from '../lib/repository'
import { SlotCard } from './SlotCard'

interface PollCardProps {
  poll: PadelPoll
  user: SessionUser
  members: MemberProfile[]
  onNotify: (message: string) => void
  onError: (message: string) => void
}

export function PollCard({ poll, user, members, onNotify, onError }: PollCardProps) {
  const canManage = poll.createdBy === user.id

  const toggleStatus = async () => {
    try {
      const next = poll.status === 'open' ? 'closed' : 'open'
      await repository.setPollStatus(poll.id, next)
      onNotify(next === 'closed' ? 'Sondaggio archiviato.' : 'Sondaggio riaperto.')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Non è stato possibile aggiornare il sondaggio.')
    }
  }

  return (
    <section className={`poll-card ${poll.status === 'closed' ? 'poll-card--closed' : ''}`}>
      <header className="poll-card__header">
        <div>
          <p className="eyebrow"><CalendarDays size={14} /> Settimana {weekLabel(poll.targetWeekStart)}</p>
          <h2>{poll.title}</h2>
          <p>Creato da {poll.createdByName} · {poll.slots.length} {poll.slots.length === 1 ? 'slot' : 'slot'}</p>
        </div>
        {canManage && (
          <button className="button button--ghost button--small" type="button" onClick={toggleStatus}>
            {poll.status === 'open' ? <Archive size={16} /> : <RotateCcw size={16} />}
            {poll.status === 'open' ? 'Archivia' : 'Riapri'}
          </button>
        )}
      </header>
      {poll.status === 'closed' && <div className="closed-banner">Sondaggio chiuso · puoi ancora consultare l’ordine delle adesioni</div>}
      <div className="poll-card__slots">
        {poll.slots.map((slot) => (
          <SlotCard
            key={slot.id}
            poll={poll}
            slot={slot}
            user={user}
            members={members}
            disabled={poll.status === 'closed'}
            onNotify={onNotify}
            onError={onError}
          />
        ))}
      </div>
    </section>
  )
}

