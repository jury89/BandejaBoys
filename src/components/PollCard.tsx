import { useState } from 'react'
import { Archive, CalendarDays, CalendarPlus, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'
import type { MemberProfile, PadelPoll, SessionUser, SlotInput } from '../types'
import { getSlotPhase, isBookingCandidate } from '../lib/domain'
import { pollWeekTitle } from '../lib/format'
import { resolveMemberName } from '../lib/memberNames'
import { repository } from '../lib/repository'
import { AddSlotModal } from './AddSlotModal'
import { SlotCard } from './SlotCard'

interface PollCardProps {
  poll: PadelPoll
  user: SessionUser
  members: MemberProfile[]
  slotFilter?: PollSlotFilter
  onPollChange: (poll: PadelPoll) => void
  onNotify: (message: string) => void
  onError: (message: string) => void
}

export type PollSlotFilter = 'all' | 'booking' | 'booked'

export function PollCard({ poll, user, members, slotFilter = 'all', onPollChange, onNotify, onError }: PollCardProps) {
  const [showAddSlot, setShowAddSlot] = useState(false)
  const [slotsCollapsed, setSlotsCollapsed] = useState(false)
  const canManage = poll.createdBy === user.id
  const creatorName = resolveMemberName(members, poll.createdBy, poll.createdByName)
  const pollTitle = pollWeekTitle(poll.targetWeekStart)
  const slotsRegionId = `poll-slots-${poll.id}`
  const visibleSlots = poll.slots.filter((slot) => (
    slotFilter === 'all'
    || (slotFilter === 'booked' && getSlotPhase(slot) === 'booked')
    || (slotFilter === 'booking' && isBookingCandidate(slot))
  ))

  const toggleStatus = async () => {
    try {
      const next = poll.status === 'open' ? 'closed' : 'open'
      const updated = await repository.setPollStatus(poll.id, next, user)
      onPollChange(updated)
      onNotify(next === 'closed' ? 'Sondaggio archiviato.' : 'Sondaggio riaperto.')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Non è stato possibile aggiornare il sondaggio.')
    }
  }

  const addSlot = async (input: SlotInput) => {
    const updated = await repository.addSlot(poll.id, input, user)
    onPollChange(updated)
  }

  return (
    <>
      <section className={`poll-card ${poll.status === 'closed' ? 'poll-card--closed' : ''}`}>
        <header className="poll-card__header">
          <div className="poll-card__identity">
            <p className="poll-card__week"><CalendarDays size={14} /> Sondaggio settimanale</p>
            <h2>{pollTitle}</h2>
            <p className="poll-card__meta">
              <span>Creato da {creatorName}</span>
              <span aria-hidden="true">·</span>
              <strong>{visibleSlots.length} slot</strong>
              <span aria-hidden="true">·</span>
              <button
                className="poll-card__collapse"
                type="button"
                aria-controls={slotsRegionId}
                aria-expanded={!slotsCollapsed}
                aria-label={`${slotsCollapsed ? 'Mostra' : 'Nascondi'} gli slot di ${pollTitle}`}
                onClick={() => setSlotsCollapsed((current) => !current)}
              >
                {slotsCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                {slotsCollapsed ? 'Mostra slot' : 'Nascondi slot'}
              </button>
            </p>
          </div>
          <div className="poll-card__actions">
            {poll.status === 'open' && slotFilter !== 'booked' && (
              <button
                className="button button--secondary button--small poll-card__action"
                type="button"
                aria-label="Aggiungi uno slot"
                onClick={() => setShowAddSlot(true)}
                disabled={poll.slots.length >= 14}
              >
                <CalendarPlus size={16} />
                <span className="poll-card__action-label">Aggiungi slot</span>
              </button>
            )}
            {canManage && (
              <button
                className="button button--ghost button--small poll-card__action"
                type="button"
                aria-label={poll.status === 'open' ? 'Archivia sondaggio' : 'Riapri sondaggio'}
                onClick={toggleStatus}
              >
                {poll.status === 'open' ? <Archive size={16} /> : <RotateCcw size={16} />}
                <span className="poll-card__action-label">{poll.status === 'open' ? 'Archivia' : 'Riapri'}</span>
              </button>
            )}
          </div>
        </header>
        {poll.status === 'closed' && <div className="closed-banner">Sondaggio chiuso · puoi ancora consultare l’ordine delle adesioni</div>}
        {!slotsCollapsed && (
          <div
            id={slotsRegionId}
            className="poll-card__slots"
            role="region"
            aria-label={`Slot di ${pollTitle}`}
          >
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
        )}
      </section>
      {showAddSlot && (
        <AddSlotModal
          poll={poll}
          onClose={() => setShowAddSlot(false)}
          onSave={addSlot}
          onDone={onNotify}
        />
      )}
    </>
  )
}
