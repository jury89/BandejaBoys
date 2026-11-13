import { ArrowLeft, RefreshCw } from 'lucide-react'
import { getSlotEndsAt } from '../lib/domain'
import type { SlotNavigationTarget } from '../lib/slotNavigation'
import type { MemberProfile, PadelPoll, SessionUser } from '../types'
import { SlotCard } from './SlotCard'

interface SharedSlotPageProps {
  target: SlotNavigationTarget | null
  polls: PadelPoll[]
  user: SessionUser
  members: MemberProfile[]
  loading: boolean
  error: string | null
  now: number
  onBack: () => void
  onRetry: () => void
  onPollChange: (poll: PadelPoll) => void
  onNotify: (message: string) => void
  onError: (message: string) => void
}

export function SharedSlotPage({ target, polls, user, members, loading, error, now, onBack, onRetry, onPollChange, onNotify, onError }: SharedSlotPageProps) {
  const poll = polls.find((item) => item.id === target?.pollId)
  const slot = poll?.slots.find((item) => item.id === target?.slotId)
  const archived = poll?.status === 'closed'
  const past = slot ? getSlotEndsAt(slot) <= now : false

  return (
    <main className="shared-slot-page">
      <button className="button button--ghost" type="button" onClick={onBack}>
        <ArrowLeft size={18} aria-hidden="true" /> Torna alla bacheca
      </button>
      <h1>Slot condiviso</h1>
      {loading ? (
        <div className="loading-state"><span /><p>Apriamo lo slot…</p></div>
      ) : error ? (
        <section className="empty-state" role="alert">
          <h2>Non riusciamo a caricare lo slot.</h2>
          <p>{error}</p>
          <button className="button button--primary" type="button" onClick={onRetry}><RefreshCw size={18} /> Riprova ora</button>
        </section>
      ) : poll && slot ? (
        <>
          {(archived || past) && <p className="closed-banner">{archived ? 'Slot archiviato' : 'Slot passato'} · puoi consultare le adesioni.</p>}
          <SlotCard key={`${poll.id}:${slot.id}`} poll={poll} slot={slot} user={user} members={members} disabled={archived || past}
            onPollChange={onPollChange} onNotify={onNotify} onError={onError} />
        </>
      ) : (
        <section className="empty-state">
          <h2>{target ? 'Questo slot non è più disponibile.' : 'Il link dello slot non è valido.'}</h2>
          <p>{target ? 'Potrebbe essere stato eliminato. Puoi trovare gli altri slot nella bacheca.' : 'Chiedi a chi lo ha condiviso di inviarti di nuovo il link.'}</p>
        </section>
      )}
    </main>
  )
}
