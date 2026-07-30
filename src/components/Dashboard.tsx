import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, BellRing, CalendarCheck2, CalendarClock, CalendarDays, CalendarPlus, CheckCircle2, ChevronDown, CircleUserRound, History, LogOut, PhoneCall, RefreshCw, UsersRound } from 'lucide-react'
import { useAuth } from '../AuthContext'
import type {
  MatchRatingRecord,
  MatchRatingResponse,
  MatchRatingSummary,
  MatchRatingSubmission,
  MatchReport,
  MatchSetInput,
  MemberProfile,
  PadelPoll,
  PlayerMatch,
} from '../types'
import {
  getNextMatchRatingPromptAt,
  getOtherPlayedMatches,
  getPendingMatchRatingPrompts,
  getPlayerMatches,
  getSlotEndsAt,
  getSlotPhase,
  getUpcomingPolls,
  isBookingCandidate,
  DEFAULT_VENUE_PHONE,
} from '../lib/domain'
import { firstName, slotDateParts } from '../lib/format'
import { hasRemoteBackend } from '../lib/firebase'
import { resolveMemberName, resolvePlayerMatchNames } from '../lib/memberNames'
import {
  buildNotificationHistory,
  unreadNotificationCount,
  type NotificationHistoryItem,
} from '../lib/notificationHistory'
import {
  notificationEventFromSearch,
  removeNotificationEventFromCurrentUrl,
} from '../lib/notificationRead'
import { notificationStateLabel, usePushNotifications } from '../lib/notifications'
import { RATING_TEST_QUERY_PARAM, isRatingTestRequested, makeRatingTestPrompt } from '../lib/ratingTest'
import { repository } from '../lib/repository'
import { slotElementId, type SlotNavigationTarget } from '../lib/slotNavigation'
import { Brand } from './Brand'
import { CreatePollModal } from './CreatePollModal'
import { GroupMatchesPage } from './GroupMatchesPage'
import { MatchRatingModal } from './MatchRatingModal'
import { MatchReportModal } from './MatchReportModal'
import { MyMatchesPage } from './MyMatchesPage'
import { NotificationCallup } from './NotificationCallup'
import { NotificationHistoryPage } from './NotificationHistoryPage'
import { PollCard, type PollSlotFilter } from './PollCard'
import { ProfileAvatar } from './ProfileAvatar'
import { ProfileModal } from './ProfileModal'
import { PullToRefresh } from './PullToRefresh'

type FeedFilter = PollSlotFilter
type DashboardView = 'feed' | 'matches' | 'group-matches' | 'notifications'

const PERSONAL_MATCHES_HASH = '#i-miei-match'
const GROUP_MATCHES_HASH = '#gli-altri-match'
const NOTIFICATION_HISTORY_HASH = '#notifiche'
const INITIAL_DATA_TIMEOUT_MS = 6_000
const INITIAL_DATA_AUTO_RETRIES = 2

function dashboardViewFromLocation(): DashboardView {
  if (window.location.hash === PERSONAL_MATCHES_HASH) return 'matches'
  if (window.location.hash === GROUP_MATCHES_HASH) return 'group-matches'
  if (window.location.hash === NOTIFICATION_HISTORY_HASH) return 'notifications'
  return 'feed'
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
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [dataSubscriptionAttempt, setDataSubscriptionAttempt] = useState(0)
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
  const [receivedRatings, setReceivedRatings] = useState<MatchRatingRecord[]>([])
  const [receivedRatingsLoaded, setReceivedRatingsLoaded] = useState(false)
  const [matchReports, setMatchReports] = useState<MatchReport[]>([])
  const [matchReportsLoaded, setMatchReportsLoaded] = useState(false)
  const [groupRatingSummaries, setGroupRatingSummaries] = useState<MatchRatingSummary[]>([])
  const [groupMatchReports, setGroupMatchReports] = useState<MatchReport[]>([])
  const [groupRatingSummariesLoaded, setGroupRatingSummariesLoaded] = useState(false)
  const [groupMatchReportsLoaded, setGroupMatchReportsLoaded] = useState(false)
  const [groupMatchesError, setGroupMatchesError] = useState<string | null>(null)
  const [reportMatch, setReportMatch] = useState<PlayerMatch | null>(null)
  const [notificationHistory, setNotificationHistory] = useState<NotificationHistoryItem[]>([])
  const [notificationHistoryLoaded, setNotificationHistoryLoaded] = useState(!hasRemoteBackend)
  const [notificationHistoryError, setNotificationHistoryError] = useState<string | null>(null)
  const [ratingTestOpen, setRatingTestOpen] = useState(() => isRatingTestRequested(window.location.search))
  const [ratingTestStartedAt] = useState(() => Date.now())
  const [slotNavigationTarget, setSlotNavigationTarget] = useState<SlotNavigationTarget | null>(null)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const hasLoadedPollsRef = useRef(false)
  const initialDataRetryCountRef = useRef(0)
  const [requestedRating] = useState(() => {
    const parameters = new URLSearchParams(window.location.search)
    const pollId = parameters.get('ratePoll')
    const slotId = parameters.get('rateSlot')
    return pollId && slotId ? { pollId, slotId } : null
  })
  const [requestedNotificationEvent] = useState(
    () => notificationEventFromSearch(window.location.search),
  )
  const markingNotificationDeliveryIdsRef = useRef(new Set<string>())
  const notifications = usePushNotifications(user)
  const ratingReviewerId = user?.id
  const notificationHistoryUserId = user?.id
  const markNotificationDeliveriesRead = useCallback((
    deliveryIds: string[],
    onSuccess?: () => void,
  ) => {
    const pendingIds = deliveryIds.filter(
      (deliveryId) => !markingNotificationDeliveryIdsRef.current.has(deliveryId),
    )
    if (pendingIds.length === 0) return

    pendingIds.forEach((deliveryId) => {
      markingNotificationDeliveryIdsRef.current.add(deliveryId)
    })
    void repository.markNotificationDeliveriesRead(pendingIds)
      .then(onSuccess)
      .catch(() => {
        setToast({
          message: 'Non siamo riusciti ad aggiornare le notifiche lette.',
          tone: 'error',
        })
      })
      .finally(() => {
        pendingIds.forEach((deliveryId) => {
          markingNotificationDeliveryIdsRef.current.delete(deliveryId)
        })
      })
  }, [])

  const retryDashboardData = useCallback(() => {
    initialDataRetryCountRef.current = 0
    setLoadingError(null)
    if (!hasLoadedPollsRef.current) setLoading(true)
    setDataSubscriptionAttempt((attempt) => attempt + 1)
  }, [])

  useEffect(() => {
    let pollsSettled = false
    const finishInitialLoadWithError = (error: Error) => {
      pollsSettled = true
      setToast({ message: error.message, tone: 'error' })
      if (!hasLoadedPollsRef.current) {
        setLoadingError('Non siamo riusciti a recuperare gli slot.')
        setLoading(false)
      }
    }
    const stopPolls = repository.subscribePolls((nextPolls) => {
      pollsSettled = true
      hasLoadedPollsRef.current = true
      initialDataRetryCountRef.current = 0
      setPolls(nextPolls)
      setLoadingError(null)
      setLoading(false)
    }, finishInitialLoadWithError)
    const stopMembers = repository.subscribeMembers(setMembers, (error) => {
      setToast({ message: error.message, tone: 'error' })
    })
    const initialLoadTimer = hasLoadedPollsRef.current
      ? undefined
      : window.setTimeout(() => {
        if (pollsSettled) return
        if (initialDataRetryCountRef.current < INITIAL_DATA_AUTO_RETRIES) {
          initialDataRetryCountRef.current += 1
          setDataSubscriptionAttempt((attempt) => attempt + 1)
          return
        }
        setLoadingError('La connessione è rimasta in pausa troppo a lungo.')
        setLoading(false)
      }, INITIAL_DATA_TIMEOUT_MS)

    return () => {
      if (initialLoadTimer) window.clearTimeout(initialLoadTimer)
      stopPolls()
      stopMembers()
    }
  }, [dataSubscriptionAttempt])

  useEffect(() => {
    if (!hasRemoteBackend) return

    const reconnect = () => {
      if (document.visibilityState === 'hidden') return
      retryDashboardData()
    }
    const reconnectFromPageCache = (event: PageTransitionEvent) => {
      if (event.persisted) reconnect()
    }

    document.addEventListener('visibilitychange', reconnect)
    window.addEventListener('online', reconnect)
    window.addEventListener('pageshow', reconnectFromPageCache)
    return () => {
      document.removeEventListener('visibilitychange', reconnect)
      window.removeEventListener('online', reconnect)
      window.removeEventListener('pageshow', reconnectFromPageCache)
    }
  }, [retryDashboardData])

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
    if (!hasRemoteBackend || !notificationHistoryUserId) return

    return repository.subscribeNotificationDeliveries(notificationHistoryUserId, (deliveries) => {
      setNotificationHistory(buildNotificationHistory(deliveries))
      setNotificationHistoryError(null)
      setNotificationHistoryLoaded(true)
    }, () => {
      setNotificationHistoryError('Non siamo riusciti a recuperare le notifiche ricevute.')
      setNotificationHistoryLoaded(true)
    })
  }, [notificationHistoryUserId])

  useEffect(() => {
    if (!requestedNotificationEvent || !notificationHistoryLoaded) return
    const clickedNotification = notificationHistory.find(
      (notification) => notification.eventId === requestedNotificationEvent,
    )
    if (!clickedNotification) return
    if (clickedNotification.isRead) {
      removeNotificationEventFromCurrentUrl()
      return
    }

    markNotificationDeliveriesRead(
      clickedNotification.deliveryIds,
      removeNotificationEventFromCurrentUrl,
    )
  }, [
    markNotificationDeliveriesRead,
    notificationHistory,
    notificationHistoryLoaded,
    requestedNotificationEvent,
  ])

  useEffect(() => {
    if (dashboardView !== 'notifications' || !notificationHistoryLoaded) return
    const unreadDeliveryIds = notificationHistory
      .filter((notification) => !notification.isRead)
      .flatMap((notification) => notification.deliveryIds)
    markNotificationDeliveriesRead(unreadDeliveryIds)
  }, [
    dashboardView,
    markNotificationDeliveriesRead,
    notificationHistory,
    notificationHistoryLoaded,
  ])

  useEffect(() => {
    if (!ratingReviewerId) return
    return repository.subscribeReceivedMatchRatings(ratingReviewerId, (ratings) => {
      setReceivedRatings(ratings)
      setReceivedRatingsLoaded(true)
    }, (error) => {
      setToast({ message: error.message, tone: 'error' })
      setReceivedRatingsLoaded(true)
    })
  }, [ratingReviewerId])

  useEffect(() => {
    if (!ratingReviewerId) return
    return repository.subscribeMatchReports(ratingReviewerId, (reports) => {
      setMatchReports(reports)
      setMatchReportsLoaded(true)
    }, (error) => {
      setToast({ message: error.message, tone: 'error' })
      setMatchReportsLoaded(true)
    })
  }, [ratingReviewerId])

  useEffect(() => {
    if (dashboardView !== 'group-matches') return

    let ratingSummariesFailed = false
    let matchReportsFailed = false
    const clearGroupDataError = () => {
      if (!ratingSummariesFailed && !matchReportsFailed) setGroupMatchesError(null)
    }
    const showGroupDataError = () => {
      setGroupMatchesError('Non siamo riusciti a recuperare tutti i voti e i risultati del gruppo.')
    }
    const stopRatingSummaries = repository.subscribeMatchRatingSummaries((summaries) => {
      setGroupRatingSummaries(summaries)
      setGroupRatingSummariesLoaded(true)
      clearGroupDataError()
    }, () => {
      ratingSummariesFailed = true
      showGroupDataError()
      setGroupRatingSummariesLoaded(true)
    })
    const stopMatchReports = repository.subscribeAllMatchReports((reports) => {
      setGroupMatchReports(reports)
      setGroupMatchReportsLoaded(true)
      clearGroupDataError()
    }, () => {
      matchReportsFailed = true
      showGroupDataError()
      setGroupMatchReportsLoaded(true)
    })

    return () => {
      stopRatingSummaries()
      stopMatchReports()
    }
  }, [dashboardView])

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
    if (dashboardView !== 'feed' || loading || !slotNavigationTarget) return

    let highlightTimer: number | undefined
    const retryTimers: number[] = []
    const frame = window.requestAnimationFrame(() => {
      const slotElement = document.getElementById(slotElementId(slotNavigationTarget))
      if (!slotElement) {
        setSlotNavigationTarget(null)
        return
      }

      const scrollToSlot = () => {
        slotElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }

      scrollToSlot()
      retryTimers.push(
        window.setTimeout(scrollToSlot, 180),
        window.setTimeout(scrollToSlot, 800),
      )
      slotElement.classList.add('slot-card--highlighted')
      highlightTimer = window.setTimeout(() => {
        slotElement.classList.remove('slot-card--highlighted')
        setSlotNavigationTarget(null)
      }, 2600)
    })

    return () => {
      window.cancelAnimationFrame(frame)
      retryTimers.forEach((timer) => window.clearTimeout(timer))
      if (highlightTimer) window.clearTimeout(highlightTimer)
    }
  }, [dashboardView, loading, slotNavigationTarget])

  useEffect(() => {
    const nextSlotEnd = polls
      .flatMap((poll) => poll.slots)
      .map(getSlotEndsAt)
      .filter((endsAt) => Number.isFinite(endsAt) && endsAt > now)
      .sort((left, right) => left - right)[0]
    const nextRatingPrompt = user
      ? getNextMatchRatingPromptAt(polls, ratingResponses, user.id, now)
      : null
    const nextWakeAt = [nextSlotEnd, nextRatingPrompt]
      .filter((timestamp): timestamp is number => typeof timestamp === 'number')
      .sort((left, right) => left - right)[0]
    if (!nextWakeAt) return

    const delay = Math.min(Math.max(nextWakeAt - Date.now() + 50, 0), 2_147_483_647)
    const timer = window.setTimeout(() => setNow(Date.now()), delay)
    return () => window.clearTimeout(timer)
  }, [now, polls, ratingResponses, user])

  const upcomingPolls = useMemo(() => getUpcomingPolls(polls, now), [now, polls])
  const matchNameMembers = useMemo(
    () => user
      ? [user, ...members.filter((member) => member.id !== user.id)]
      : members,
    [members, user],
  )
  const playerMatches = useMemo(
    () => {
      if (!user) return { upcoming: [], past: [] }
      const matches = getPlayerMatches(polls, user.id, now, receivedRatings, matchReports)
      return {
        upcoming: matches.upcoming
          .map((match) => resolvePlayerMatchNames(matchNameMembers, match)),
        past: matches.past
          .map((match) => resolvePlayerMatchNames(matchNameMembers, match)),
      }
    },
    [matchNameMembers, matchReports, now, polls, receivedRatings, user],
  )
  const groupMatches = useMemo(
    () => {
      if (!user) return []
      return getOtherPlayedMatches(
        polls,
        user.id,
        now,
        groupRatingSummaries,
        groupMatchReports,
      ).map((match) => resolvePlayerMatchNames(matchNameMembers, match))
    },
    [groupMatchReports, groupRatingSummaries, matchNameMembers, now, polls, user],
  )
  const unreadNotifications = useMemo(
    () => unreadNotificationCount(notificationHistory),
    [notificationHistory],
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
  const openGroupMatches = () => {
    setAccountOpen(false)
    setGroupRatingSummariesLoaded(false)
    setGroupMatchReportsLoaded(false)
    setGroupMatchesError(null)
    setDashboardView('group-matches')
    if (window.location.hash === GROUP_MATCHES_HASH) return
    const url = new URL(window.location.href)
    url.hash = GROUP_MATCHES_HASH
    const currentState = typeof window.history.state === 'object' && window.history.state
      ? window.history.state
      : {}
    window.history.pushState({ ...currentState, bandejaView: 'group-matches' }, '', url)
  }
  const closeGroupMatches = () => {
    if (window.history.state?.bandejaView === 'group-matches') {
      window.history.back()
      return
    }

    const url = new URL(window.location.href)
    url.hash = ''
    window.history.replaceState(window.history.state, '', url)
    setDashboardView('feed')
  }
  const openNotificationHistory = () => {
    setAccountOpen(false)
    setDashboardView('notifications')
    if (window.location.hash === NOTIFICATION_HISTORY_HASH) return
    const url = new URL(window.location.href)
    url.hash = NOTIFICATION_HISTORY_HASH
    const currentState = typeof window.history.state === 'object' && window.history.state
      ? window.history.state
      : {}
    window.history.pushState({ ...currentState, bandejaView: 'notifications' }, '', url)
  }
  const closeNotificationHistory = () => {
    if (window.history.state?.bandejaView === 'notifications') {
      window.history.back()
      return
    }

    const url = new URL(window.location.href)
    url.hash = ''
    window.history.replaceState(window.history.state, '', url)
    setDashboardView('feed')
  }
  const showPlayerMatchOnBoard = (match: PlayerMatch) => {
    setFeedFilter('all')
    setSlotNavigationTarget({ pollId: match.pollId, slotId: match.slot.id })
    closePlayerMatches()
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
  const saveMatchReport = async (sets: MatchSetInput[]) => {
    if (!reportMatch) return
    const saved = await repository.saveMatchReport(reportMatch, user, sets)
    setMatchReports((current) => [
      ...current.filter((report) => report.id !== saved.id),
      saved,
    ])
    setReportMatch(null)
    notify('Referto della partita salvato.')
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
      <PullToRefresh />
      <header className="topbar">
        <Brand compact />
        <div className="topbar__actions">
          {hasRemoteBackend && (
            <button
              className={`notification-inbox-trigger ${dashboardView === 'notifications' ? 'is-active' : ''}`}
              type="button"
              aria-label={`Apri le mie notifiche, ${unreadNotifications} ${unreadNotifications === 1 ? 'notifica non letta' : 'notifiche non lette'}`}
              aria-current={dashboardView === 'notifications' ? 'page' : undefined}
              onClick={openNotificationHistory}
            >
              {unreadNotifications > 0 ? <BellRing size={19} /> : <Bell size={19} />}
              {unreadNotifications > 0 && (
                <span aria-hidden="true">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>
              )}
            </button>
          )}
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
                <button type="button" onClick={openGroupMatches}>
                  <UsersRound size={16} />
                  <span>Gli altri match <small>Pagellini e risultati del gruppo</small></span>
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
                <a
                  className="account-menu__call"
                  href={`tel:${DEFAULT_VENUE_PHONE}`}
                  onClick={() => setAccountOpen(false)}
                >
                  <PhoneCall size={16} />
                  <span>Chiama Oasi Boschetto <small>0376 290058</small></span>
                </a>
                <button type="button" onClick={() => {
                  void signOut()
                }}><LogOut size={16} /> Esci</button>
              </div>
            )}
          </div>
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
          loading={loading || !receivedRatingsLoaded || !matchReportsLoaded}
          onBack={closePlayerMatches}
          onSelectMatch={showPlayerMatchOnBoard}
          onEditReport={setReportMatch}
        />
      ) : dashboardView === 'group-matches' ? (
        <GroupMatchesPage
          matches={groupMatches}
          members={matchNameMembers}
          loading={loading || !groupRatingSummariesLoaded || !groupMatchReportsLoaded}
          error={groupMatchesError}
          onBack={closeGroupMatches}
        />
      ) : dashboardView === 'notifications' ? (
        <NotificationHistoryPage
          notifications={notificationHistory}
          loading={!notificationHistoryLoaded}
          error={notificationHistoryError}
          onBack={closeNotificationHistory}
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
        ) : loadingError ? (
          <section className="empty-state loading-recovery">
            <RefreshCw size={34} aria-hidden="true" />
            <p className="eyebrow">Connessione in pausa</p>
            <h2>Aggiorniamo il tabellone.</h2>
            <p>{loadingError} Quando torna la rete riproviamo automaticamente; puoi anche farlo ora.</p>
            <button className="button button--primary" type="button" onClick={retryDashboardData}>
              <RefreshCw size={18} /> Riprova ora
            </button>
          </section>
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
      {reportMatch ? (
        <MatchReportModal
          key={`${reportMatch.pollId}-${reportMatch.slot.id}`}
          match={reportMatch}
          onClose={() => setReportMatch(null)}
          onSave={saveMatchReport}
        />
      ) : ratingTestPrompt ? (
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
      {!reportMatch && !ratingTestPrompt && !activeRatingPrompt && (notifications.shouldPrompt || notificationPanelOpen) && (
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
