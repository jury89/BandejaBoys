import { useEffect, useMemo, useState } from 'react'
import { Bell, BellRing, CalendarCheck2, CalendarDays, CalendarPlus, CheckCircle2, ChevronDown, CircleUserRound, LogOut, UsersRound } from 'lucide-react'
import { useAuth } from '../AuthContext'
import type { MemberProfile, PadelPoll } from '../types'
import { getSlotPhase, getUpcomingPolls } from '../lib/domain'
import { firstName, slotDateParts } from '../lib/format'
import { hasRemoteBackend } from '../lib/firebase'
import { notificationStateLabel, usePushNotifications } from '../lib/notifications'
import { repository } from '../lib/repository'
import { Brand } from './Brand'
import { CreatePollModal } from './CreatePollModal'
import { NotificationCallup } from './NotificationCallup'
import { PollCard } from './PollCard'
import { ProfileAvatar } from './ProfileAvatar'
import { ProfileModal } from './ProfileModal'

type FeedFilter = 'all' | 'booked'

export function Dashboard() {
  const { user, signOut, updateProfile } = useAuth()
  const [polls, setPolls] = useState<PadelPoll[]>([])
  const [members, setMembers] = useState<MemberProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const notifications = usePushNotifications(user)

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

  useEffect(() => {
    const nextStart = polls
      .flatMap((poll) => poll.slots)
      .map((slot) => new Date(slot.startsAt).getTime())
      .filter((startsAt) => Number.isFinite(startsAt) && startsAt > now)
      .sort((left, right) => left - right)[0]
    if (!nextStart) return

    const delay = Math.min(Math.max(nextStart - Date.now() + 50, 0), 2_147_483_647)
    const timer = window.setTimeout(() => setNow(Date.now()), delay)
    return () => window.clearTimeout(timer)
  }, [now, polls])

  const upcomingPolls = useMemo(() => getUpcomingPolls(polls, now), [now, polls])

  const stats = useMemo(() => {
    const openPolls = upcomingPolls.filter((poll) => poll.status === 'open')
    const slots = openPolls.flatMap((poll) => poll.slots)
    const ready = slots.filter((slot) => getSlotPhase(slot) === 'ready').length
    const booked = slots.filter((slot) => getSlotPhase(slot) === 'booked')
    const nextBooked = booked.sort((left, right) => left.startsAt.localeCompare(right.startsAt))[0]
    return { open: openPolls.length, ready, nextBooked }
  }, [upcomingPolls])

  if (!user) return null

  const totalSlotCount = upcomingPolls.reduce((total, poll) => total + poll.slots.length, 0)
  const bookedSlotCount = upcomingPolls.reduce(
    (total, poll) => total + poll.slots.filter((slot) => getSlotPhase(slot) === 'booked').length,
    0,
  )
  const visiblePolls = upcomingPolls.filter(
    (poll) => feedFilter === 'all' || poll.slots.some((slot) => getSlotPhase(slot) === 'booked'),
  )
  const visibleSlotCount = feedFilter === 'all' ? totalSlotCount : bookedSlotCount
  const notify = (message: string) => setToast({ message, tone: 'success' })
  const reportError = (message: string) => setToast({ message, tone: 'error' })
  const updatePoll = (updatedPoll: PadelPoll) => {
    setPolls((current) => current.map((poll) => poll.id === updatedPoll.id ? updatedPoll : poll))
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand compact />
        <div className="account-menu">
          <button
            className="account-menu__trigger"
            type="button"
            onClick={() => setAccountOpen((open) => !open)}
            aria-expanded={accountOpen}
            aria-label={`Apri menu account di ${user.displayName}`}
          >
            <ProfileAvatar displayName={user.displayName} avatarDataUrl={user.avatarDataUrl} decorative />
            <span><strong>{user.displayName}</strong><small>Giocatore</small></span>
            <ChevronDown size={16} />
          </button>
          {accountOpen && (
            <div className="account-menu__popover">
              <span>{user.email}</span>
              <button type="button" onClick={() => {
                setAccountOpen(false)
                setProfileOpen(true)
              }}>
                <CircleUserRound size={16} />
                <span>Profilo <small>Nome e foto giocatore</small></span>
              </button>
              {hasRemoteBackend && (
                <button type="button" onClick={() => {
                  setAccountOpen(false)
                  setNotificationPanelOpen(true)
                }}>
                  <Bell size={16} />
                  <span>Notifiche <small>{notificationStateLabel(notifications.state)}</small></span>
                </button>
              )}
              <button type="button" onClick={() => signOut()}><LogOut size={16} /> Esci</button>
            </div>
          )}
        </div>
      </header>

      <nav className="feed-filter" aria-label="Filtra gli slot">
        <div className="feed-filter__inner">
          <button
            className={feedFilter === 'all' ? 'is-active' : ''}
            type="button"
            aria-pressed={feedFilter === 'all'}
            onClick={() => setFeedFilter('all')}
          >
            <CalendarDays size={17} />
            <span>Tutti</span>
            <strong>{totalSlotCount}</strong>
          </button>
          <button
            className={feedFilter === 'booked' ? 'is-active' : ''}
            type="button"
            aria-pressed={feedFilter === 'booked'}
            onClick={() => setFeedFilter('booked')}
          >
            <CalendarCheck2 size={17} />
            <span>Slot prenotati</span>
            <strong>{bookedSlotCount}</strong>
          </button>
        </div>
      </nav>

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
            <p className="eyebrow">{feedFilter === 'all' ? 'Bacheca completa' : 'Partite confermate'}</p>
            <h2>{feedFilter === 'all' ? 'Tutti gli slot' : 'Slot prenotati'}</h2>
          </div>
          <span>{visibleSlotCount} slot</span>
        </section>

        {loading ? (
          <div className="loading-state"><span /><p>Prepariamo il campo…</p></div>
        ) : visiblePolls.length > 0 ? (
          <div className="poll-feed">
            {visiblePolls.map((poll) => (
              <PollCard
                key={poll.id}
                poll={poll}
                user={user}
                members={members}
                bookedOnly={feedFilter === 'booked'}
                onPollChange={updatePoll}
                onNotify={notify}
                onError={reportError}
              />
            ))}
          </div>
        ) : (
          <section className="empty-state">
            <div className="empty-state__court" aria-hidden="true"><span /><i /><i /><i /><i /></div>
            <p className="eyebrow">Campo libero</p>
            <h2>{feedFilter === 'all' ? 'Ancora nessun sondaggio.' : 'Nessuno slot prenotato.'}</h2>
            <p>{feedFilter === 'all' ? 'Proponi gli slot della prossima settimana e fai partire le adesioni.' : 'Quando un campo viene confermato, lo slot comparirà qui.'}</p>
            {feedFilter === 'all' && <button className="button button--primary" type="button" onClick={() => setCreateOpen(true)}><CalendarPlus size={18} /> Crea il primo sondaggio</button>}
          </section>
        )}
      </main>

      <footer className="site-footer"><Brand compact /><span>Organizzato fuori. Competitivo dentro.</span></footer>

      {createOpen && (
        <CreatePollModal user={user} onClose={() => setCreateOpen(false)} onCreate={repository.createPoll} onDone={notify} />
      )}
      {profileOpen && (
        <ProfileModal
          user={user}
          onClose={() => setProfileOpen(false)}
          onSave={updateProfile}
          onDone={notify}
        />
      )}
      {(notifications.shouldPrompt || notificationPanelOpen) && (
        <NotificationCallup
          state={notifications.state}
          busy={notifications.busy}
          onEnable={() => {
            void notifications.enable()
              .then(() => {
                setNotificationPanelOpen(false)
                notify('Notifiche attivate su questo dispositivo.')
              })
              .catch((error) => reportError(error instanceof Error ? error.message : 'Attivazione non riuscita.'))
          }}
          onDisable={() => {
            void notifications.disable()
              .then(() => {
                setNotificationPanelOpen(false)
                notify('Notifiche disattivate su questo dispositivo.')
              })
              .catch((error) => reportError(error instanceof Error ? error.message : 'Disattivazione non riuscita.'))
          }}
          onClose={() => {
            if (notifications.shouldPrompt) notifications.dismiss()
            setNotificationPanelOpen(false)
          }}
        />
      )}
      {toast && (
        <div className={`toast toast--${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
          {toast.tone === 'success' && <CheckCircle2 size={19} />}{toast.message}
        </div>
      )}
    </div>
  )
}
