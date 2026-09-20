import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, Bell, BellRing, CalendarCheck2, CalendarDays, CalendarPlus, CheckCircle2, ChevronDown, CircleUserRound, History, LayoutList, LogOut, PhoneCall, RefreshCw, Trophy, UsersRound } from 'lucide-react'
import { useAuth } from '../AuthContext'
import { clearInterfaceOverride, useInterfaceMode } from '../InterfaceContext'
import { ClassicBoardFilters, ClassicBoardSummary } from './ClassicBoard'
import type {
  FantasyEntry,
  FantasyRound,
  FantasySelectionInput,
  MatchFeedbackLevel,
  MatchFeedbackResponse,
  MatchFeedbackSummary,
  MatchReport,
  MatchSetInput,
  MemberProfile,
  PadelPoll,
  PlayerMatch,
} from '../types'
import {
  getNextMatchFeedbackPromptAt,
  getOtherPlayedMatches,
  getPendingMatchFeedbackPrompts,
  getPlayerMatches,
  getSlotEndsAt,
  getUpcomingSlotWeeks,
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
import {
  MATCH_REPORT_POLL_QUERY_PARAM,
  MATCH_REPORT_SLOT_QUERY_PARAM,
  matchReportTargetFromSearch,
} from '../lib/notificationUrl'
import { notificationStateLabel, usePushNotifications } from '../lib/notifications'
import { FEEDBACK_TEST_QUERY_PARAM, isFeedbackTestRequested, makeFeedbackTestPrompt } from '../lib/feedbackTest'
import { repository } from '../lib/repository'
import { slotElementId, type SlotNavigationTarget } from '../lib/slotNavigation'
import { matchesSlotFilter } from '../lib/slotFilters'
import { usePageScroll } from '../lib/usePageScroll'
import { Brand } from './Brand'
import { CreatePollModal } from './CreatePollModal'
import { FantasyBandejaPage } from './FantasyBandejaPage'
import { GroupMatchesPage } from './GroupMatchesPage'
import { MatchFeedbackModal } from './MatchFeedbackModal'
import { MatchReportModal } from './MatchReportModal'
import { MyMatchesPage } from './MyMatchesPage'
import { NotificationCallup } from './NotificationCallup'
import { NotificationHistoryPage } from './NotificationHistoryPage'
import { PollCard, type PollSlotFilter } from './PollCard'
import { ProfileAvatar } from './ProfileAvatar'
import { ProfileModal } from './ProfileModal'
import { PlayerStatisticsPage } from './PlayerStatisticsPage'
import { PullToRefresh } from './PullToRefresh'
import { matchesVenueFilter, normalizePreferredVenueIds } from '../lib/venues'
import type { VenueId } from '../types'
import { VenueChoices } from './VenuePicker'
import { VenuesPage } from './VenuesPage'
import { TournamentsPage } from './TournamentsPage'

type FeedFilter = PollSlotFilter
type DashboardView = 'feed' | 'matches' | 'group-matches' | 'statistics' | 'fantasy' | 'notifications' | 'venues' | 'tournaments'

const PERSONAL_MATCHES_HASH = '#i-miei-match'
const GROUP_MATCHES_HASH = '#gli-altri-match'
const STATISTICS_HASH = '#statistiche'
const FANTASY_HASH = '#fantabandeja'
const NOTIFICATION_HISTORY_HASH = '#notifiche'
const INITIAL_DATA_TIMEOUT_MS = 6_000
const INITIAL_DATA_AUTO_RETRIES = 2

function dashboardViewFromLocation(): DashboardView {
  if (window.location.hash === '#tornei' || window.location.hash.startsWith('#tornei/')) return 'tournaments'
  if (window.location.hash === '#campi' || window.location.hash.startsWith('#campi/')) return 'venues'
  if (window.location.hash === PERSONAL_MATCHES_HASH) return 'matches'
  if (window.location.hash === GROUP_MATCHES_HASH) return 'group-matches'
  if (window.location.hash.startsWith(STATISTICS_HASH)) return 'statistics'
  if (window.location.hash === FANTASY_HASH) return 'fantasy'
  if (window.location.hash === NOTIFICATION_HISTORY_HASH) return 'notifications'
  return 'feed'
}

function statisticsPlayerIdFromLocation(): string | null {
  const playerId = window.location.hash.slice(`${STATISTICS_HASH}/`.length)
  if (!window.location.hash.startsWith(`${STATISTICS_HASH}/`) || !playerId) return null
  try {
    return decodeURIComponent(playerId)
  } catch {
    return null
  }
}

const feedCopy: Record<FeedFilter, {
  eyebrow: string
  heading: string
  emptyHeading: string
  emptyBody: string
}> = {
  all: {
    eyebrow: 'Bacheca completa',
    heading: 'Prossimi slot',
    emptyHeading: 'Il campo aspetta voi.',
    emptyBody: 'Crea uno slot e scegli quando giocare.',
  },
  available: {
    eyebrow: 'C’è posto per te', heading: 'Posti liberi',
    emptyHeading: 'Per ora i posti sono tutti occupati.',
    emptyBody: 'Puoi entrare in riserva da Tutti o proporre un nuovo slot.',
  },
  joined: {
    eyebrow: 'Le tue adesioni', heading: 'I tuoi slot',
    emptyHeading: 'Non sei ancora iscritto.',
    emptyBody: 'Scegli uno slot da Tutti: qui ritroverai le tue iscrizioni, anche in riserva.',
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
  const isNewInterface = useInterfaceMode() === 'nuova'
  const { user, signOut, updateProfile } = useAuth()
  const [polls, setPolls] = useState<PadelPoll[]>([])
  const [members, setMembers] = useState<MemberProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [dataSubscriptionAttempt, setDataSubscriptionAttempt] = useState(0)
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all')
  const [venueFilterOverride, setVenueFilterOverride] = useState<{ key: string; ids: VenueId[] } | null>(null)
  const [venuePageId, setVenuePageId] = useState(() => window.location.hash.slice('#campi/'.length))
  const preferredVenueIds = normalizePreferredVenueIds(user?.preferredVenueIds)
  const venueFilterKey = `${user?.id}:${preferredVenueIds.join(',')}`
  const selectedVenueIds = venueFilterOverride?.key === venueFilterKey ? venueFilterOverride.ids : preferredVenueIds
  const [dashboardView, setDashboardView] = useState<DashboardView>(dashboardViewFromLocation)
  const [statisticsPlayerId, setStatisticsPlayerId] = useState(
    () => statisticsPlayerIdFromLocation() ?? user?.id ?? '',
  )
  const [createOpen, setCreateOpen] = useState(false)
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [feedbackResponses, setFeedbackResponses] = useState<MatchFeedbackResponse[]>([])
  const [feedbackResponsesLoaded, setFeedbackResponsesLoaded] = useState(false)
  const [feedbackSummaries, setFeedbackSummaries] = useState<MatchFeedbackSummary[]>([])
  const [feedbackSummariesLoaded, setFeedbackSummariesLoaded] = useState(false)
  const [matchReports, setMatchReports] = useState<MatchReport[]>([])
  const [matchReportsLoaded, setMatchReportsLoaded] = useState(false)
  const [groupMatchReports, setGroupMatchReports] = useState<MatchReport[]>([])
  const [groupMatchReportsLoaded, setGroupMatchReportsLoaded] = useState(false)
  const [groupMatchesError, setGroupMatchesError] = useState<string | null>(null)
  const [fantasyRounds, setFantasyRounds] = useState<FantasyRound[]>([])
  const [fantasyRoundsLoaded, setFantasyRoundsLoaded] = useState(false)
  const [fantasyOwnEntries, setFantasyOwnEntries] = useState<Record<string, FantasyEntry | undefined>>({})
  const [fantasyRoundEntries, setFantasyRoundEntries] = useState<Record<string, FantasyEntry[]>>({})
  const [fantasyError, setFantasyError] = useState<string | null>(null)
  const [fantasySubscriptionAttempt, setFantasySubscriptionAttempt] = useState(0)
  const [reportMatch, setReportMatch] = useState<PlayerMatch | null>(null)
  const [notificationHistory, setNotificationHistory] = useState<NotificationHistoryItem[]>([])
  const [notificationHistoryLoaded, setNotificationHistoryLoaded] = useState(!hasRemoteBackend)
  const [notificationHistoryError, setNotificationHistoryError] = useState<string | null>(null)
  const [feedbackTestOpen, setFeedbackTestOpen] = useState(() => isFeedbackTestRequested(window.location.search))
  const [feedbackTestStartedAt] = useState(() => Date.now())
  const [slotNavigationTarget, setSlotNavigationTarget] = useState<SlotNavigationTarget | null>(null)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const hasLoadedPollsRef = useRef(false)
  const initialDataRetryCountRef = useRef(0)
  const [requestedFeedback] = useState(() => {
    const parameters = new URLSearchParams(window.location.search)
    const pollId = parameters.get('feedbackPoll') ?? parameters.get('mvpPoll') ?? parameters.get('ratePoll')
    const slotId = parameters.get('feedbackSlot') ?? parameters.get('mvpSlot') ?? parameters.get('rateSlot')
    return pollId && slotId ? { pollId, slotId } : null
  })
  const [requestedMatchReport] = useState(
    () => matchReportTargetFromSearch(window.location.search),
  )
  const requestedMatchReportHandledRef = useRef(false)
  const [requestedNotificationEvent] = useState(
    () => notificationEventFromSearch(window.location.search),
  )
  const markingNotificationDeliveryIdsRef = useRef(new Set<string>())
  const notifications = usePushNotifications(user)
  const feedbackReviewerId = user?.id
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
    if (!feedbackReviewerId) return
    return repository.subscribeMatchFeedbackResponses(feedbackReviewerId, (responses) => {
      setFeedbackResponses(responses)
      setFeedbackResponsesLoaded(true)
    }, (error) => {
      setToast({ message: error.message, tone: 'error' })
      setFeedbackResponsesLoaded(true)
    })
  }, [feedbackReviewerId])

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
    if (!feedbackReviewerId) return
    return repository.subscribeMatchFeedbackSummaries((summaries) => {
      setFeedbackSummaries(summaries)
      setFeedbackSummariesLoaded(true)
    }, (error) => {
      setToast({ message: error.message, tone: 'error' })
      setFeedbackSummariesLoaded(true)
    })
  }, [feedbackReviewerId])

  useEffect(() => {
    if (!feedbackReviewerId) return
    return repository.subscribeMatchReports(feedbackReviewerId, (reports) => {
      setMatchReports(reports)
      setMatchReportsLoaded(true)
    }, (error) => {
      setToast({ message: error.message, tone: 'error' })
      setMatchReportsLoaded(true)
    })
  }, [feedbackReviewerId])

  useEffect(() => {
    if (dashboardView !== 'group-matches' && dashboardView !== 'statistics') return

    let matchReportsFailed = false
    const clearGroupDataError = () => {
      if (!matchReportsFailed) setGroupMatchesError(null)
    }
    const showGroupDataError = () => {
      setGroupMatchesError('Non siamo riusciti a recuperare tutti i risultati del gruppo.')
    }
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
      stopMatchReports()
    }
  }, [dashboardView])

  useEffect(() => {
    if (dashboardView !== 'fantasy') return
    return repository.subscribeFantasyRounds((rounds) => {
      setFantasyRounds(rounds)
      setFantasyRoundsLoaded(true)
      setFantasyError(null)
    }, () => {
      setFantasyRoundsLoaded(true)
      setFantasyError('Non siamo riusciti a recuperare i round FantaBandeja.')
    })
  }, [dashboardView, fantasySubscriptionAttempt])

  useEffect(() => {
    if (dashboardView !== 'fantasy' || !user || !fantasyRoundsLoaded) return
    const subscriptions: Array<() => void> = []
    const showFantasyEntryError = () => {
      setFantasyError('Non siamo riusciti a recuperare tutte le formazioni fantasy.')
    }

    fantasyRounds.forEach((round) => {
      if (round.status !== 'open') return
      if (now < round.locksAt) {
        if (round.participantIds.includes(user.id)) return
        subscriptions.push(repository.subscribeFantasyEntry(
          round.id,
          user.id,
          (entry) => {
            setFantasyOwnEntries((current) => ({ ...current, [round.id]: entry }))
          },
          showFantasyEntryError,
        ))
        return
      }

      subscriptions.push(repository.subscribeFantasyRoundEntries(
        round.id,
        (entries) => {
          setFantasyRoundEntries((current) => ({ ...current, [round.id]: entries }))
        },
        showFantasyEntryError,
      ))
    })

    return () => subscriptions.forEach((unsubscribe) => unsubscribe())
  }, [dashboardView, fantasyRounds, fantasyRoundsLoaded, fantasySubscriptionAttempt, now, user])

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
    const syncViewWithHistory = () => {
      setDashboardView(dashboardViewFromLocation())
      setVenuePageId(window.location.hash.slice('#campi/'.length))
      setStatisticsPlayerId(statisticsPlayerIdFromLocation() ?? user?.id ?? '')
    }
    window.addEventListener('popstate', syncViewWithHistory)
    window.addEventListener('hashchange', syncViewWithHistory)
    return () => {
      window.removeEventListener('popstate', syncViewWithHistory)
      window.removeEventListener('hashchange', syncViewWithHistory)
    }
  }, [user?.id])

  const pageReady = !loading && (
    dashboardView === 'fantasy' ? fantasyRoundsLoaded
      : dashboardView === 'statistics' || dashboardView === 'group-matches' ? groupMatchReportsLoaded
        : dashboardView === 'matches' ? matchReportsLoaded : true
  )
  usePageScroll(dashboardView, pageReady, dashboardView === 'feed' && Boolean(slotNavigationTarget))

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
    const nextFeedbackPrompt = user
      ? getNextMatchFeedbackPromptAt(polls, feedbackResponses, user.id, now)
      : null
    const nextFantasyBoundary = fantasyRounds
      .flatMap((round) => [round.locksAt, round.settlesAt])
      .filter((timestamp) => Number.isFinite(timestamp) && timestamp > now)
      .sort((left, right) => left - right)[0]
    const nextWakeAt = [nextSlotEnd, nextFeedbackPrompt, nextFantasyBoundary]
      .filter((timestamp): timestamp is number => typeof timestamp === 'number')
      .sort((left, right) => left - right)[0]
    if (!nextWakeAt) return

    const delay = Math.min(Math.max(nextWakeAt - Date.now() + 50, 0), 2_147_483_647)
    const timer = window.setTimeout(() => setNow(Date.now()), delay)
    return () => window.clearTimeout(timer)
  }, [fantasyRounds, feedbackResponses, now, polls, user])

  const upcomingSlotWeeks = useMemo(() => getUpcomingSlotWeeks(polls, now), [now, polls])
  const matchNameMembers = useMemo(
    () => user
      ? [user, ...members.filter((member) => member.id !== user.id)]
      : members,
    [members, user],
  )
  const playerMatches = useMemo(
    () => {
      if (!user) return { upcoming: [], past: [] }
      const matches = getPlayerMatches(polls, user.id, now, feedbackSummaries, matchReports)
      return {
        upcoming: matches.upcoming
          .map((match) => resolvePlayerMatchNames(matchNameMembers, match)),
        past: matches.past
          .map((match) => resolvePlayerMatchNames(matchNameMembers, match)),
      }
    },
    [matchNameMembers, matchReports, feedbackSummaries, now, polls, user],
  )

  useEffect(() => {
    if (
      !requestedMatchReport
      || requestedMatchReportHandledRef.current
      || loading
      || !feedbackSummariesLoaded
      || !matchReportsLoaded
    ) return

    const requested = playerMatches.past.find((match) => (
      match.pollId === requestedMatchReport.pollId
      && match.slot.id === requestedMatchReport.slotId
    ))
    requestedMatchReportHandledRef.current = true
    const openTimer = requested
      ? window.setTimeout(() => setReportMatch(requested), 0)
      : undefined

    const url = new URL(window.location.href)
    url.searchParams.delete('feedbackPoll')
    url.searchParams.delete('feedbackSlot')
    url.searchParams.delete(MATCH_REPORT_POLL_QUERY_PARAM)
    url.searchParams.delete(MATCH_REPORT_SLOT_QUERY_PARAM)
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)

    return () => {
      if (openTimer !== undefined) window.clearTimeout(openTimer)
    }
  }, [
    loading,
    matchReportsLoaded,
    playerMatches,
    feedbackSummariesLoaded,
    requestedMatchReport,
  ])
  const groupMatches = useMemo(
    () => {
      if (!user) return []
      return getOtherPlayedMatches(
        polls,
        user.id,
        now,
        feedbackSummaries,
        groupMatchReports,
      ).map((match) => resolvePlayerMatchNames(matchNameMembers, match))
    },
    [groupMatchReports, matchNameMembers, feedbackSummaries, now, polls, user],
  )
  const unreadNotifications = useMemo(
    () => unreadNotificationCount(notificationHistory),
    [notificationHistory],
  )
  const feedbackPrompts = useMemo(() => (
    user && feedbackResponsesLoaded
      ? getPendingMatchFeedbackPrompts(polls, feedbackResponses, user.id, now)
        .map((prompt) => ({
          ...prompt,
          candidates: prompt.candidates.map((candidate) => ({
            ...candidate,
            displayName: resolveMemberName(members, candidate.userId, candidate.displayName),
          })),
        }))
      : []
  ), [members, feedbackResponses, feedbackResponsesLoaded, now, polls, user])
  const activeFeedbackPrompt = useMemo(() => {
    if (requestedFeedback) {
      const requested = feedbackPrompts.find((prompt) => (
        prompt.pollId === requestedFeedback.pollId && prompt.slotId === requestedFeedback.slotId
      ))
      if (requested) return requested
    }
    return feedbackPrompts[0] ?? null
  }, [feedbackPrompts, requestedFeedback])
  const feedbackTestPrompt = useMemo(() => (
    feedbackTestOpen && user
      ? makeFeedbackTestPrompt(user, members, feedbackTestStartedAt)
      : null
  ), [members, feedbackTestOpen, feedbackTestStartedAt, user])

  useEffect(() => {
    if (!requestedFeedback || !feedbackResponsesLoaded || loading) return
    const url = new URL(window.location.href)
    url.searchParams.delete('mvpPoll')
    url.searchParams.delete('mvpSlot')
    url.searchParams.delete('ratePoll')
    url.searchParams.delete('rateSlot')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }, [loading, feedbackResponsesLoaded, requestedFeedback])

  useEffect(() => {
    if (!feedbackTestOpen) return
    const url = new URL(window.location.href)
    url.searchParams.delete(FEEDBACK_TEST_QUERY_PARAM)
    url.searchParams.delete('mvpTest')
    url.searchParams.delete('ratingTest')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }, [feedbackTestOpen])

  if (!user) return null

  const venueSlotWeeks = upcomingSlotWeeks.map((group) => ({ ...group,
    entries: group.entries.filter(({ slot }) => matchesVenueFilter(slot, selectedVenueIds)),
  })).filter((group) => group.entries.length > 0)
  const slotCountFor = (filter: FeedFilter) => venueSlotWeeks.reduce((total, group) => (
    total + group.entries.filter(({ poll, slot }) => matchesSlotFilter(poll, slot, filter, user.id)).length
  ), 0)
  const totalSlotCount = slotCountFor('all')
  const bookedSlotCount = slotCountFor('booked')
  const bookingCandidateSlotCount = slotCountFor('booking')
  const visibleSlotWeeks = venueSlotWeeks.filter(
    (group) => group.entries.some(({ poll, slot }) => matchesSlotFilter(poll, slot, feedFilter, user.id)),
  )
  const visibleSlotCount = slotCountFor(feedFilter)
  const nextPersonalMatch = playerMatches.upcoming[0]
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
    openBoard()
  }
  const openGroupMatches = () => {
    setAccountOpen(false)
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
    openBoard()
  }
  const openStatistics = (playerId = user.id) => {
    setAccountOpen(false)
    setGroupMatchReportsLoaded(false)
    setGroupMatchesError(null)
    setStatisticsPlayerId(playerId)
    setDashboardView('statistics')
    const targetHash = `${STATISTICS_HASH}/${encodeURIComponent(playerId)}`
    if (window.location.hash === targetHash) return
    const url = new URL(window.location.href)
    url.hash = targetHash
    const currentState = typeof window.history.state === 'object' && window.history.state
      ? window.history.state
      : {}
    window.history.pushState({ ...currentState, bandejaView: 'statistics' }, '', url)
  }
  const selectStatisticsPlayer = (playerId: string) => {
    setStatisticsPlayerId(playerId)
    const url = new URL(window.location.href)
    url.hash = `${STATISTICS_HASH}/${encodeURIComponent(playerId)}`
    window.history.replaceState(window.history.state, '', url)
  }
  const closeStatistics = () => {
    openBoard()
  }
  const openFantasy = () => {
    setAccountOpen(false)
    setFantasyRoundsLoaded(false)
    setFantasyError(null)
    setDashboardView('fantasy')
    if (window.location.hash === FANTASY_HASH) return
    const url = new URL(window.location.href)
    url.hash = FANTASY_HASH
    const currentState = typeof window.history.state === 'object' && window.history.state
      ? window.history.state
      : {}
    window.history.pushState({ ...currentState, bandejaView: 'fantasy' }, '', url)
  }
  const retryFantasyData = () => {
    setFantasyRoundsLoaded(false)
    setFantasyError(null)
    setFantasyOwnEntries({})
    setFantasyRoundEntries({})
    setFantasySubscriptionAttempt((attempt) => attempt + 1)
  }
  const closeFantasy = () => {
    openBoard()
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
    openBoard()
  }
  const showPlayerMatchOnBoard = (match: PlayerMatch) => {
    setFeedFilter('all')
    setVenueFilterOverride({ key: venueFilterKey, ids: [] })
    setSlotNavigationTarget({ pollId: match.pollId, slotId: match.slot.id })
    closePlayerMatches()
  }
  const updatePoll = (updatedPoll: PadelPoll) => {
    setPolls((current) => current.map((poll) => poll.id === updatedPoll.id ? updatedPoll : poll))
  }
  const rememberFeedbackResponse = (response: MatchFeedbackResponse) => {
    setFeedbackResponses((current) => [
      ...current.filter((item) => item.id !== response.id),
      response,
    ])
  }
  const dismissFeedbackPrompt = async () => {
    if (!activeFeedbackPrompt) return
    const response = await repository.dismissMatchFeedbackPrompt(activeFeedbackPrompt)
    rememberFeedbackResponse(response)
  }
  const submitFeedback = async (
    ratings: Array<{ playerId: string; level: MatchFeedbackLevel }>,
  ) => {
    if (!activeFeedbackPrompt) return
    const response = await repository.submitMatchFeedback(activeFeedbackPrompt, user, ratings)
    rememberFeedbackResponse(response)
    notify('Giudizi salvati nello storico della partita.')
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
  const saveFantasyEntry = async (
    roundId: string,
    input: FantasySelectionInput,
  ) => {
    const saved = await repository.saveFantasyEntry(roundId, user, input)
    setFantasyOwnEntries((current) => ({ ...current, [roundId]: saved }))
    notify('Formazione FantaBandeja salvata e nascosta fino al via.')
  }
  const dismissFeedbackTest = async () => {
    setFeedbackTestOpen(false)
  }
  const completeFeedbackTest = async () => {
    setFeedbackTestOpen(false)
    notify('Collaudo completato: nessun giudizio è stato salvato.')
  }

  const openBoard = () => {
    if (dashboardView === 'feed') return
    const url = new URL(window.location.href)
    url.hash = ''
    window.history.pushState({ bandejaView: 'feed' }, '', url)
    setDashboardView('feed')
  }
  const mainSections = [
    { label: 'Bacheca', icon: LayoutList, active: dashboardView === 'feed', open: openBoard },
    { label: 'Partite', icon: CalendarDays, active: dashboardView === 'matches' || dashboardView === 'group-matches', open: openPlayerMatches },
    { label: 'Fanta', icon: Trophy, active: dashboardView === 'fantasy', open: openFantasy },
    { label: 'Statistiche', icon: BarChart3, active: dashboardView === 'statistics', open: () => openStatistics() },
  ]

  return (
    <div className={`app-shell ${isNewInterface ? 'ux-new' : 'ux-classic'}`} data-ux={isNewInterface ? 'nuova' : 'classica'}>
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
                <button type="button" onClick={() => openStatistics()}>
                  <BarChart3 size={16} />
                  <span>Statistiche <small>Numeri, coppie e curiosità</small></span>
                </button>
                <button type="button" onClick={openFantasy}>
                  <Trophy size={16} />
                  <span>FantaBandeja <small>Schiera la coppia e scala la classifica</small></span>
                </button>
                <a href="#tornei" onClick={() => setAccountOpen(false)}><Trophy size={16} /><span>Tornei <small>Crea e organizza un torneo del gruppo</small></span></a>
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
                  href="#campi"
                  onClick={() => setAccountOpen(false)}
                >
                  <PhoneCall size={16} />
                  <span>Campi e costi <small>Circoli, prenotazioni e iscrizioni</small></span>
                </a>
                <button type="button" onClick={() => {
                  void signOut()
                }}><LogOut size={16} /> Esci</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {isNewInterface && <nav className="club-navigation" aria-label="Navigazione principale">
        {mainSections.map(({ label, icon: Icon, active, open }) => (
          <button key={label} type="button" aria-current={active ? 'page' : undefined} onClick={() => {
            setAccountOpen(false)
            if (active) return
            open()
          }}><Icon size={21} aria-hidden="true" /><span>{label}</span></button>
        ))}
      </nav>}

      {!isNewInterface && dashboardView === 'feed' && <ClassicBoardFilters value={feedFilter} counts={{ all: totalSlotCount, booking: bookingCandidateSlotCount, booked: bookedSlotCount }} onChange={setFeedFilter} />}

      {!hasRemoteBackend && (
        <div className="demo-banner">
          <span /> <strong>Demo locale:</strong> i dati restano in questo browser finché Firebase non viene collegato.
        </div>
      )}

      {isNewInterface && (dashboardView === 'matches' || dashboardView === 'group-matches') && (
        <nav className="club-match-switch" aria-label="Quali partite">
          <button type="button" aria-pressed={dashboardView === 'matches'} onClick={openPlayerMatches}>Le mie</button>
          <button type="button" aria-pressed={dashboardView === 'group-matches'} onClick={openGroupMatches}>Gli altri</button>
        </nav>
      )}

      {dashboardView === 'tournaments' ? <TournamentsPage user={user} members={matchNameMembers} onBack={openBoard} /> : dashboardView === 'venues' ? <VenuesPage selectedId={venuePageId} onBack={openBoard} /> : dashboardView === 'matches' ? (
        <MyMatchesPage
          matches={playerMatches}
          loading={loading || !feedbackSummariesLoaded || !matchReportsLoaded}
          onBack={closePlayerMatches}
          onSelectMatch={showPlayerMatchOnBoard}
          onEditReport={setReportMatch}
        />
      ) : dashboardView === 'group-matches' ? (
        <GroupMatchesPage
          matches={groupMatches}
          members={matchNameMembers}
          loading={loading || !feedbackSummariesLoaded || !groupMatchReportsLoaded}
          error={groupMatchesError}
          onBack={closeGroupMatches}
          onOpenStatistics={openStatistics}
        />
      ) : dashboardView === 'statistics' ? (
        <PlayerStatisticsPage
          polls={polls}
          members={matchNameMembers}
          user={user}
          selectedPlayerId={statisticsPlayerId || user.id}
          feedbackSummaries={feedbackSummaries}
          matchReports={groupMatchReports}
          now={now}
          loading={loading || !feedbackSummariesLoaded || !groupMatchReportsLoaded}
          error={groupMatchesError}
          onBack={closeStatistics}
          onSelectPlayer={selectStatisticsPlayer}
        />
      ) : dashboardView === 'fantasy' ? (
        <FantasyBandejaPage
          rounds={fantasyRounds}
          ownEntries={fantasyOwnEntries}
          roundEntries={fantasyRoundEntries}
          members={matchNameMembers}
          user={user}
          now={now}
          loading={!fantasyRoundsLoaded}
          error={fantasyError}
          onBack={closeFantasy}
          onRetry={retryFantasyData}
          onSave={saveFantasyEntry}
        />
      ) : dashboardView === 'notifications' ? (
        <NotificationHistoryPage
          notifications={notificationHistory}
          loading={!notificationHistoryLoaded}
          error={notificationHistoryError}
          onBack={closeNotificationHistory}
        />
      ) : <main className={`dashboard ${isNewInterface ? 'dashboard--feed' : ''}`}>
        <section className="dashboard-intro">
          <div>
            <p className="eyebrow">Ciao, {firstName(user.displayName)}</p>
            <h1>{isNewInterface ? 'Ci vediamo in campo.' : <>Mettiamo in campo<br />la prossima partita.</>}</h1>
          </div>
          <button className="button button--primary button--large" type="button" onClick={() => setCreateOpen(true)}>
            <CalendarPlus size={20} /> {isNewInterface ? 'Nuovo slot' : 'Nuovi slot'}
          </button>
        </section>

        {isNewInterface ? <aside className={`club-board-aside ${nextPersonalMatch ? 'has-next-match' : ''}`} aria-label="Il tuo Bandeja">
        {nextPersonalMatch && (
          <button type="button" className="club-next-match" onClick={() => showPlayerMatchOnBoard(nextPersonalMatch)}>
            <CalendarCheck2 size={23} aria-hidden="true" />
            <span><small>La tua prossima partita</small><strong>{slotDateParts(nextPersonalMatch.slot.startsAt).full} · {slotDateParts(nextPersonalMatch.slot.startsAt).time}</strong></span>
            <span>{nextPersonalMatch.slot.bookedAt ? 'Campo prenotato' : 'Da prenotare'}</span>
          </button>
        )}
          <div className="club-board-tools">
            <h2>Il tuo Bandeja</h2>
            <button type="button" onClick={() => setFeedFilter('joined')}><span>Le tue iscrizioni</span><strong>{slotCountFor('joined')}</strong></button>
            <button type="button" onClick={openPlayerMatches}><CalendarDays size={18} /> I tuoi match</button>
            <p>Hai un giorno fisso per giocare?</p>
            <button type="button" onClick={() => setProfileOpen(true)}><CircleUserRound size={18} /> Configura il posto fisso</button>
          </div>
        </aside> : <ClassicBoardSummary groups={venueSlotWeeks} />}

        <section className="feed-heading">
          <div>
            <p className="eyebrow">{currentFeedCopy.eyebrow}</p>
            <h2>{!isNewInterface && feedFilter === 'all' ? 'Tutti gli slot' : currentFeedCopy.heading}</h2>
          </div>
          <span>{visibleSlotCount} slot</span>
        </section>

        <section className="venue-filter" aria-labelledby="venue-filter-title">
          <div className="venue-filter__heading"><strong id="venue-filter-title">Dove vuoi giocare?</strong><a href="#campi">Campi e costi ↗</a></div>
          <details className="venue-filter__details">
          <summary>Scegli i campi <span>{selectedVenueIds.length === 0 ? 'Tutti' : `${selectedVenueIds.length} selezionati`}</span></summary>
          <div className="venue-filter__actions">
            <button type="button" aria-pressed={selectedVenueIds.length === 0} onClick={() => setVenueFilterOverride({ key: venueFilterKey, ids: [] })}>Tutti i campi</button>
            {preferredVenueIds.length > 0 && <button type="button" onClick={() => setVenueFilterOverride(null)}>Ripristina i preferiti</button>}
          </div>
          <VenueChoices value={selectedVenueIds} onChange={(ids) => setVenueFilterOverride({ key: venueFilterKey, ids })} />
          <p>{selectedVenueIds.length === 0 ? 'Vedi tutti i circoli.' : `Stai filtrando ${selectedVenueIds.length} ${selectedVenueIds.length === 1 ? 'circolo' : 'circoli'}.`} Questa vista non modifica i preferiti del profilo.</p>
          </details>
        </section>

        {isNewInterface && <nav className="feed-filter club-filters" aria-label="Filtra gli slot">
          <div className="feed-filter__inner">
            <button className={feedFilter === 'all' ? 'is-active' : ''} type="button"
              aria-label={`Tutti, ${totalSlotCount} slot`} aria-pressed={feedFilter === 'all'} onClick={() => setFeedFilter('all')}>
              <span>Tutti</span><strong>{totalSlotCount}</strong>
            </button>
            {(['available', 'joined'] as const).map((filter) => (
              <button key={filter} className={feedFilter === filter ? 'is-active' : ''} type="button"
                aria-pressed={feedFilter === filter} onClick={() => setFeedFilter(filter)}>
                <span>{filter === 'available' ? 'Posti liberi' : 'Sono iscritto'}</span><strong>{slotCountFor(filter)}</strong>
              </button>
            ))}
            <label className="club-booking-filter">
              <span className="sr-only">Filtra per prenotazione</span>
              <select value={feedFilter === 'booking' || feedFilter === 'booked' ? feedFilter : ''}
                onChange={(event) => setFeedFilter((event.target.value || 'all') as FeedFilter)}>
                <option value="">Tutti</option>
                <option value="booking">Da prenotare ({bookingCandidateSlotCount})</option>
                <option value="booked">Prenotati ({bookedSlotCount})</option>
              </select>
            </label>
          </div>
        </nav>}

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
        ) : visibleSlotWeeks.length > 0 ? (
          <div className="poll-feed">
            {visibleSlotWeeks.map((group) => (
              <PollCard
                key={group.id}
                group={group}
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
            <h2>{selectedVenueIds.length > 0 ? 'Nessuno slot in questi campi.' : currentFeedCopy.emptyHeading}</h2>
            <p>{selectedVenueIds.length > 0 ? 'Cambia i filtri, guarda tutti i circoli oppure proponi un nuovo slot.' : currentFeedCopy.emptyBody}</p>
            {selectedVenueIds.length > 0 && <button className="button button--secondary" type="button" onClick={() => setVenueFilterOverride({ key: venueFilterKey, ids: [] })}>Vedi tutti i campi</button>}
            {feedFilter === 'all' && <button className="button button--primary" type="button" onClick={() => setCreateOpen(true)}><CalendarPlus size={18} /> Crea i primi slot</button>}
          </section>
        )}
      </main>}

      <footer className="site-footer"><Brand compact /><span>Organizzato fuori. Competitivo dentro.</span></footer>

      {createOpen && (
        <CreatePollModal
          user={user}
          existingSlots={polls.flatMap((poll) => poll.slots)}
          onClose={() => setCreateOpen(false)}
          onCreate={repository.createPoll}
          onDone={notify}
        />
      )}
      {profileOpen && (
        <ProfileModal
          user={user}
          members={members}
          onClose={() => setProfileOpen(false)}
          onSave={async (...values) => {
            await updateProfile(...values)
            clearInterfaceOverride()
            setFeedFilter('all')
          }}
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
      ) : feedbackTestPrompt ? (
        <MatchFeedbackModal
          testMode
          key={feedbackTestPrompt.id}
          prompt={feedbackTestPrompt}
          onDismiss={dismissFeedbackTest}
          onSubmit={completeFeedbackTest}
        />
      ) : activeFeedbackPrompt && (
        <MatchFeedbackModal
          key={activeFeedbackPrompt.id}
          prompt={activeFeedbackPrompt}
          onDismiss={dismissFeedbackPrompt}
          onSubmit={submitFeedback}
        />
      )}
      {!reportMatch && !feedbackTestPrompt && !activeFeedbackPrompt && (notifications.shouldPrompt || notificationPanelOpen) && (
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
