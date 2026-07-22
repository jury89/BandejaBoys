import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, BellRing, CalendarCheck2, CalendarClock, CalendarDays, CalendarPlus, CheckCircle2, ChevronDown, CircleUserRound, History, LogOut, UsersRound } from 'lucide-react'
import { useAuth } from '../AuthContext'
import type { MatchRatingResponse, MatchRatingSubmission, MemberProfile, PadelPoll } from '../types'
import {
  getNextMatchRatingPromptAt,
  getPendingMatchRatingPrompts,
  getPlayerMatches,
  getSlotPhase,
  getUpcomingPolls,
  isBookingCandidate,
  padelDateTimeToTimestamp,
} from '../lib/domain'
import { firstName, slotDateParts } from '../lib/format'
import { hasRemoteBackend } from '../lib/firebase'
import { resolveMemberName } from '../lib/memberNames'
import { notificationStateLabel, usePushNotifications } from '../lib/notifications'
import { RATING_TEST_QUERY_PARAM, isRatingTestRequested, makeRatingTestPrompt } from '../lib/ratingTest'
import { repository } from '../lib/repository'
import { Brand } from './Brand'
import { CreatePollModal } from './CreatePollModal'
import { MatchRatingModal } from './MatchRatingModal'
import { MyMatchesPage } from './MyMatchesPage'
import { NotificationCallup } from './NotificationCallup'
import { PollCard, type PollSlotFilter } from './PollCard'
import { ProfileAvatar } from './ProfileAvatar'
import { ProfileModal } from './ProfileModal'

type FeedFilter = PollSlotFilter
type DashboardView = 'feed' | 'matches'

const PERSONAL_MATCHES_HASH = '#i-miei-match'

function dashboardViewFromLocation(): DashboardView {
  return window.location.hash === PERSONAL_MATCHES_HASH ? 'matches' : 'feed'
}

const feedCopy: Record<FeedFilter, {
  eyebrow: string
  heading: string
  emptyHeading: string
  emptyBody: string
}> = {
  all: {
    eyebrow: 'Bacheca completa',
    heading: 'Tutti gli slot',
    emptyHeading: 'Ancora nessun sondaggio.',
    emptyBody: 'Proponi gli slot della prossima settimana e fai partire le adesioni.',
  },
  booking: {
    eyebrow: 'Campi da organizzare',
    heading: 'Slot da prenotare',
    emptyHeading: 'Nessuno slot da prenotare.',
    emptyBody: 'Gli slot con quattro titolari e campo non confermato compariranno qui.',
  },
  booked: {
    eyebrow: 'Partite confermate',
    heading: 'Slot prenotati',
    emptyHeading: 'Nessuno slot prenotato.',
    emptyBody: 'Quando un campo viene confermato, lo slot comparirà qui.',
  },
}

export function Dashboard() {
  const { user, signOut, updateProfile } = useAuth()
  const [polls, setPolls] = useState<PadelPoll[]>([])
  const [members, setMembers] = useState<MemberProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all')
  const [dashboardView, setDashboardView] = useState<DashboardView>(dashboardViewFromLocation)
  const [createOpen, setCreateOpen] = useState(false)
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [ratingResponses, setRatingResponses] = useState<MatchRatingResponse[]>([])
  const [ratingResponsesLoaded, setRatingResponsesLoaded] = useState(false)
  const [ratingTestOpen, setRatingTestOpen] = useState(() => isRatingTestRequested(window.location.search))
  const [ratingTestStartedAt] = useState(() => Date.now())
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const [requestedRating] = useState(() => {
    const parameters = new URLSearchParams(window.location.search)
    const pollId = parameters.get('ratePoll')
    const slotId = parameters.get('rateSlot')
    return pollId && slotId ? { pollId, slotId } : null
  })
  const notifications = usePushNotifications(user)
  const ratingReviewerId = user?.id

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
    if (!ratingReviewerId) return
    return repository.subscribeMatchRatingResponses(ratingReviewerId, (responses) => {
      setRatingResponses(responses)
      setRatingResponsesLoaded(true)
    }, (error) => {
      setToast({ message: error.message, tone: 'error' })
      setRatingResponsesLoaded(true)
    })
  }, [ratingReviewerId])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!accountOpen) return

    const closeOnOutsidePress = (event: PointerEvent) => {
      const menu = accountMenuRef.current
      if (menu && event.target instanceof Node && !menu.contains(event.target)) {
        setAccountOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePress)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [accountOpen])

  useEffect(() => {
    const syncViewWithHistory = () => setDashboardView(dashboardViewFromLocation())
    window.addEventListener('popstate', syncViewWithHistory)
    window.addEventListener('hashchange', syncViewWithHistory)
    return () => {
      window.removeEventListener('popstate', syncViewWithHistory)
      window.removeEventListener('hashchange', syncViewWithHistory)
    }
  }, [])

  useEffect(() => {
    const nextStart = polls
      .flatMap((poll) => poll.slots)
      .map((slot) => padelDateTimeToTimestamp(slot.startsAt))
      .filter((startsAt) => Number.isFinite(startsAt) && startsAt > now)
      .sort((left, right) => left - right)[0]
    const nextRatingPrompt = user
      ? getNextMatchRatingPromptAt(polls, ratingResponses, user.id, now)
      : null
    const nextWakeAt = [nextStart, nextRatingPrompt]
      .filter((timestamp): timestamp is number => typeof timestamp === 'number')
      .sort((left, right) => left - right)[0]
    if (!nextWakeAt) return

    const delay = Math.min(Math.max(nextWakeAt - Date.now() + 50, 0), 2_147_483_647)
    const timer = window.setTimeout(() => setNow(Date.now()), delay)
    return () => window.clearTimeout(timer)
  }, [now, polls, ratingResponses, user])

  const upcomingPolls = useMemo(() => getUpcomingPolls(polls, now), [now, polls])
  const playerMatches = useMemo(
    () => user ? getPlayerMatches(polls, user.id, now) : { upcoming: [], past: [] },
    [now, polls, user],
  )
  const ratingPrompts = useMemo(() => (
    user && ratingResponsesLoaded
      ? getPendingMatchRatingPrompts(polls, ratingResponses, user.id, now)
        .map((prompt) => ({
          ...prompt,
          teammates: prompt.teammates.map((teammate) => ({
            ...teammate,
            displayName: resolveMemberName(members, teammate.userId, teammate.displayName),
          })),
        }))
      : []
  ), [members, now, polls, ratingResponses, ratingResponsesLoaded, user])
  const activeRatingPrompt = useMemo(() => {
    if (requestedRating) {
      const requested = ratingPrompts.find((prompt) => (
        prompt.pollId === requestedRating.pollId && prompt.slotId === requestedRating.slotId
      ))
      if (requested) return requested
    }
    return ratingPrompts[0] ?? null
  }, [ratingPrompts, requestedRating])
  const ratingTestPrompt = useMemo(() => (
    ratingTestOpen && user
      ? makeRatingTestPrompt(user, members, ratingTestStartedAt)
      : null
  ), [members, ratingTestOpen, ratingTestStartedAt, user])

  useEffect(() => {
    if (!requestedRating || !ratingResponsesLoaded || loading) return
    const url = new URL(window.location.href)
    url.searchParams.delete('ratePoll')
    url.searchParams.delete('rateSlot')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }, [loading, ratingResponsesLoaded, requestedRating])

  useEffect(() => {
    if (!ratingTestOpen) return
    const url = new URL(window.location.href)
    url.searchParams.delete(RATING_TEST_QUERY_PARAM)
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }, [ratingTestOpen])

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
  const bookingCandidateSlotCount = upcomingPolls.reduce(
    (total, poll) => total + poll.slots.filter(isBookingCandidate).length,
    0,
  )
  const visiblePolls = upcomingPolls.filter(
    (poll) => poll.slots.some((slot) => (
      feedFilter === 'all'
      || (feedFilter === 'booked' && getSlotPhase(slot) === 'booked')
      || (feedFilter === 'booking' && isBookingCandidate(slot))
    )),
  )
  const visibleSlotCount = feedFilter === 'all'
    ? totalSlotCount
    : feedFilter === 'booked' ? bookedSlotCount : bookingCandidateSlotCount
  const currentFeedCopy = feedCopy[feedFilter]
  const notify = (message: string) => setToast({ message, tone: 'success' })
  const reportError = (message: string) => setToast({ message, tone: 'error' })
  const openPlayerMatches = () => {
    setDashboardView('matches')
    if (window.location.hash === PERSONAL_MATCHES_HASH) return
    const url = new URL(window.location.href)
    url.hash = PERSONAL_MATCHES_HASH
    const currentState = typeof window.history.state === 'object' && window.history.state
      ? window.history.state
      : {}
    window.history.pushState({ ...currentState, bandejaView: 'matches' }, '', url)
  }
  const closePlayerMatches = () => {
    if (window.history.state?.bandejaView === 'matches') {
      window.history.back()
      return
    }

    const url = new URL(window.location.href)
    url.hash = ''
    window.history.replaceState(window.history.state, '', url)
    setDashboardView('feed')
  }
  const updatePoll = (updatedPoll: PadelPoll) => {
    setPolls((current) => current.map((poll) => poll.id === updatedPoll.id ? updatedPoll : poll))
  }
  const rememberRatingResponse = (response: MatchRatingResponse) => {
    setRatingResponses((current) => [
      ...current.filter((item) => item.id !== response.id),
      response,
    ])
  }
  const dismissRatingPrompt = async () => {
    if (!activeRatingPrompt) return
    const response = await repository.dismissMatchRatingPrompt(activeRatingPrompt)
    rememberRatingResponse(response)
  }
  const submitRatings = async (submissions: MatchRatingSubmission[]) => {
    if (!activeRatingPrompt) return
    const response = await repository.submitMatchRatings(activeRatingPrompt, user, submissions)
    rememberRatingResponse(response)
    notify('Voti salvati nello storico della partita.')
  }
  const dismissRatingTest = async () => {
    setRatingTestOpen(false)
  }
  const completeRatingTest = async () => {
    setRatingTestOpen(false)
    notify('Collaudo completato: nessun voto è stato salvato.')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand compact />
        <div className="account-menu" ref={accountMenuRef}>
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
              <button type="button" onClick={() => {
                setAccountOpen(false)
                openPlayerMatches()
              }}>
                <History size={16} />
                <span>I miei match <small>Partite passate e future</small></span>
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

      {dashboardView === 'feed' && <nav className="feed-filter" aria-label="Filtra gli slot">
        <div className="feed-filter__inner">
          <button
            className={feedFilter === 'all' ? 'is-active' : ''}
            type="button"
            aria-label={`Tutti, ${totalSlotCount} slot`}
            aria-pressed={feedFilter === 'all'}
            onClick={() => setFeedFilter('all')}
          >
            <CalendarDays size={17} />
            <span>Tutti</span>
            <strong>{totalSlotCount}</strong>
          </button>
          <button
            className={feedFilter === 'booking' ? 'is-active' : ''}
            type="button"
            aria-label={`Slot da prenotare, ${bookingCandidateSlotCount}`}
            aria-pressed={feedFilter === 'booking'}
            onClick={() => setFeedFilter('booking')}
          >
            <CalendarClock size={17} />
            <span>Da prenotare</span>
            <strong>{bookingCandidateSlotCount}</strong>
          </button>
          <button
            className={feedFilter === 'booked' ? 'is-active' : ''}
            type="button"
            aria-label={`Slot prenotati, ${bookedSlotCount}`}
            aria-pressed={feedFilter === 'booked'}
            onClick={() => setFeedFilter('booked')}
          >
            <CalendarCheck2 size={17} />
            <span>Prenotati</span>
            <strong>{bookedSlotCount}</strong>
          </button>
        </div>
      </nav>}

      {!hasRemoteBackend && (
        <div className="demo-banner">
          <span /> <strong>Demo locale:</strong> i dati restano in questo browser finché Firebase non viene collegato.
        </div>
      )}

      {dashboardView === 'matches' ? (
        <MyMatchesPage
          matches={playerMatches}
          loading={loading}
          onBack={closePlayerMatches}
        />
      ) : <main className="dashboard">
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
            <p><strong>{stats.ready}</strong><span>Pronti da<br />prenotare</span></p>
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
            <p className="eyebrow">{currentFeedCopy.eyebrow}</p>
            <h2>{currentFeedCopy.heading}</h2>
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
                slotFilter={feedFilter}
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
            <h2>{currentFeedCopy.emptyHeading}</h2>
            <p>{currentFeedCopy.emptyBody}</p>
            {feedFilter === 'all' && <button className="button button--primary" type="button" onClick={() => setCreateOpen(true)}><CalendarPlus size={18} /> Crea il primo sondaggio</button>}
          </section>
        )}
      </main>}

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
      {ratingTestPrompt ? (
        <MatchRatingModal
          testMode
          key={ratingTestPrompt.id}
          prompt={ratingTestPrompt}
          onDismiss={dismissRatingTest}
          onSubmit={completeRatingTest}
        />
      ) : activeRatingPrompt && (
        <MatchRatingModal
          key={activeRatingPrompt.id}
          prompt={activeRatingPrompt}
          onDismiss={dismissRatingPrompt}
          onSubmit={submitRatings}
        />
      )}
      {!ratingTestPrompt && !activeRatingPrompt && (notifications.shouldPrompt || notificationPanelOpen) && (
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
