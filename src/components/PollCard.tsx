import { useState } from 'react'
import { CalendarDays, CalendarPlus, ChevronDown, ChevronUp } from 'lucide-react'
import type { MemberProfile, PadelPoll, SessionUser, SlotInput, SlotWeekGroup } from '../types'
import { getSlotPhase, isBookingCandidate } from '../lib/domain'
import { pollWeekTitle } from '../lib/format'
import { resolveMemberName } from '../lib/memberNames'
import { repository } from '../lib/repository'
import { AddSlotModal } from './AddSlotModal'
import { SlotCard } from './SlotCard'

interface PollCardProps {
  group: SlotWeekGroup
  user: SessionUser
  members: MemberProfile[]
  slotFilter?: PollSlotFilter
  onPollChange: (poll: PadelPoll) => void
  onNotify: (message: string) => void
  onError: (message: string) => void
}

export type PollSlotFilter = 'all' | 'booking' | 'booked'

export function PollCard({ group, user, members, slotFilter = 'all', onPollChange, onNotify, onError }: PollCardProps) {
  const [showAddSlot, setShowAddSlot] = useState(false)
  const [slotsCollapsed, setSlotsCollapsed] = useState(false)
  const pollTitle = pollWeekTitle(group.weekStart)
  const slotsRegionId = `slot-week-${group.weekStart}`
  const visibleEntries = group.entries.filter(({ slot }) => (
    slotFilter === 'all'
    || (slotFilter === 'booked' && getSlotPhase(slot) === 'booked')
    || (slotFilter === 'booking' && isBookingCandidate(slot))
  ))
  const creatorNames = Array.from(new Set(group.entries.map(({ poll, slot }) => (
    resolveMemberName(
      members,
      slot.createdBy ?? poll.createdBy,
      slot.createdByName ?? poll.createdByName,
    )
  ))))
  const creatorCopy = creatorNames.length === 1
    ? `Proposto da ${creatorNames[0]}`
    : `Proposti da ${creatorNames.join(', ')}`
  const allClosed = group.entries.every(({ poll }) => poll.status === 'closed')
  const modalPoll: PadelPoll = {
    id: group.id,
    title: pollTitle,
    targetWeekStart: group.weekStart,
    createdBy: user.id,
    createdByName: user.displayName,
    createdAt: group.entries[0]?.poll.createdAt ?? 0,
    updatedAt: group.entries[0]?.poll.updatedAt ?? 0,
    status: 'open',
    slots: group.entries.map(({ slot }) => slot),
  }

  const addSlot = async (input: SlotInput) => {
    await repository.createPoll({ targetWeekStart: group.weekStart, slots: [input] }, user)
  }

  return (
    <>
      <section className={`poll-card ${allClosed ? 'poll-card--closed' : ''}`}>
        <header className="poll-card__header">
          <div className="poll-card__identity">
            <p className="poll-card__week"><CalendarDays size={14} /> Settimana di gioco</p>
            <h2>{pollTitle}</h2>
            <p className="poll-card__meta">
              <span>{creatorCopy}</span>
              <span aria-hidden="true">·</span>
              <strong>{visibleEntries.length} slot</strong>
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
            {!allClosed && slotFilter !== 'booked' && (
              <button
                className="button button--secondary button--small poll-card__action"
                type="button"
                aria-label="Aggiungi uno slot"
                onClick={() => setShowAddSlot(true)}
                disabled={group.entries.length >= 14}
              >
                <CalendarPlus size={16} />
                <span className="poll-card__action-label">Aggiungi slot</span>
              </button>
            )}
          </div>
        </header>
        {allClosed && <div className="closed-banner">Slot archiviati · puoi ancora consultare l’ordine delle adesioni</div>}
        {!slotsCollapsed && (
          <div
            id={slotsRegionId}
            className="poll-card__slots"
            role="region"
            aria-label={`Slot di ${pollTitle}`}
          >
            {visibleEntries.map(({ poll, slot }) => (
              <SlotCard
                key={`${poll.id}:${slot.id}`}
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
          poll={modalPoll}
          onClose={() => setShowAddSlot(false)}
          onSave={addSlot}
          onDone={onNotify}
        />
      )}
    </>
  )
}
