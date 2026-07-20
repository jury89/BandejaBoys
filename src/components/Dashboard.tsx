import { useEffect, useMemo, useState } from 'react'
import { BellRing, CalendarPlus, CheckCircle2, ChevronDown, LogOut, UsersRound } from 'lucide-react'
import { useAuth } from '../AuthContext'
import type { MemberProfile, PadelPoll } from '../types'
import { getSlotPhase } from '../lib/domain'
import { firstName, slotDateParts } from '../lib/format'
import { hasRemoteBackend } from '../lib/firebase'
import { repository } from '../lib/repository'
import { Brand } from './Brand'
import { CreatePollModal } from './CreatePollModal'
import { PollCard } from './PollCard'

type View = 'open' | 'closed'

export function Dashboard() {
  const { user, signOut } = useAuth()
  const [polls, setPolls] = useState<PadelPoll[]>([])
  const [members, setMembers] = useState<MemberProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('open')
  const [createOpen, setCreateOpen] = useState(false)
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)

  useEffect(() => {
    const onError = (error: Error) => {
      setToast({ message: error.message, tone: 'error' })
      setLoading(false)
    }
    const stopPolls = repository.subscribePolls((nextPolls) => {
      setPolls(nextPolls)
      setLoading(false)
    }, onError)
    const stopMembers = repository.subscribeMembers(setMembers, onError)
    return () => {
      stopPolls()
      stopMembers()
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const stats = useMemo(() => {
    const openPolls = polls.filter((poll) => poll.status === 'open')
    const slots = openPolls.flatMap((poll) => poll.slots)
    const ready = slots.filter((slot) => getSlotPhase(slot) === 'ready').length
    const booked = slots.filter((slot) => getSlotPhase(slot) === 'booked')
    const nextBooked = booked.sort((left, right) => left.startsAt.localeCompare(right.startsAt))[0]
    return { open: openPolls.length, ready, nextBooked }
  }, [polls])

  if (!user) return null

  const visiblePolls = polls.filter((poll) => poll.status === view)
  const notify = (message: string) => setToast({ message, tone: 'success' })
  const reportError = (message: string) => setToast({ message, tone: 'error' })

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand compact />
        <nav className="topbar__nav" aria-label="Navigazione sondaggi">
          <button className={view === 'open' ? 'is-active' : ''} type="button" onClick={() => setView('open')}>In corso</button>
          <button className={view === 'closed' ? 'is-active' : ''} type="button" onClick={() => setView('closed')}>Archivio</button>
        </nav>
        <div className="account-menu">
          <button className="account-menu__trigger" type="button" onClick={() => setAccountOpen((open) => !open)} aria-expanded={accountOpen}>
            <span className="avatar">{user.displayName.charAt(0).toUpperCase()}</span>
            <span><strong>{user.displayName}</strong><small>Giocatore</small></span>
            <ChevronDown size={16} />
          </button>
          {accountOpen && (
            <div className="account-menu__popover">
              <span>{user.email}</span>
              <button type="button" onClick={() => signOut()}><LogOut size={16} /> Esci</button>
            </div>
          )}
        </div>
      </header>

      {!hasRemoteBackend && (
        <div className="demo-banner">
          <span /> <strong>Demo locale:</strong> i dati restano in questo browser finché Firebase non viene collegato.
        </div>
      )}

      <main className="dashboard">
        <section className="dashboard-intro">
          <div>
            <p className="eyebrow">Ciao, {firstName(user.displayName)}</p>
            <h1>Mettiamo in campo<br />la prossima partita.</h1>
          </div>
          <button className="button button--primary button--large" type="button" onClick={() => setCreateOpen(true)}>
            <CalendarPlus size={20} /> Nuovo sondaggio
          </button>
        </section>

        <section className="scoreboard" aria-label="Riepilogo">
          <div>
            <span className="scoreboard__icon"><UsersRound size={20} /></span>
            <p><strong>{stats.open}</strong><span>Sondaggi<br />in corso</span></p>
          </div>
          <div className={stats.ready > 0 ? 'scoreboard__urgent' : ''}>
            <span className="scoreboard__icon"><BellRing size={20} /></span>
            <p><strong>{stats.ready}</strong><span>Slot da<br />prenotare</span></p>
          </div>
          <div className="scoreboard__next">
            <span className="scoreboard__icon"><CheckCircle2 size={20} /></span>
            {stats.nextBooked ? (
              <p><strong>{slotDateParts(stats.nextBooked.startsAt).day} {slotDateParts(stats.nextBooked.startsAt).month}</strong><span>Prossima partita<br />alle {slotDateParts(stats.nextBooked.startsAt).time}</span></p>
            ) : (
              <p><strong>—</strong><span>Nessun campo<br />confermato</span></p>
            )}
          </div>
        </section>

        <section className="feed-heading">
          <div>
            <p className="eyebrow">{view === 'open' ? 'Bacheca attiva' : 'Storico'}</p>
            <h2>{view === 'open' ? 'Sondaggi della squadra' : 'Sondaggi archiviati'}</h2>
          </div>
          <span>{visiblePolls.length} {visiblePolls.length === 1 ? 'sondaggio' : 'sondaggi'}</span>
        </section>

        {loading ? (
          <div className="loading-state"><span /><p>Prepariamo il campo…</p></div>
        ) : visiblePolls.length > 0 ? (
          <div className="poll-feed">
            {visiblePolls.map((poll) => (
              <PollCard key={poll.id} poll={poll} user={user} members={members} onNotify={notify} onError={reportError} />
            ))}
          </div>
        ) : (
          <section className="empty-state">
            <div className="empty-state__court" aria-hidden="true"><span /><i /><i /><i /><i /></div>
            <p className="eyebrow">Campo libero</p>
            <h2>{view === 'open' ? 'Ancora nessun sondaggio.' : 'L’archivio è vuoto.'}</h2>
            <p>{view === 'open' ? 'Proponi gli slot della prossima settimana e fai partire le adesioni.' : 'I sondaggi chiusi compariranno qui.'}</p>
            {view === 'open' && <button className="button button--primary" type="button" onClick={() => setCreateOpen(true)}><CalendarPlus size={18} /> Crea il primo sondaggio</button>}
          </section>
        )}
      </main>

      <footer className="site-footer"><Brand compact /><span>Organizzato fuori. Competitivo dentro.</span></footer>

      {createOpen && (
        <CreatePollModal user={user} onClose={() => setCreateOpen(false)} onCreate={repository.createPoll} onDone={notify} />
      )}
      {toast && (
        <div className={`toast toast--${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
          {toast.tone === 'success' && <CheckCircle2 size={19} />}{toast.message}
        </div>
      )}
    </div>
  )
}

