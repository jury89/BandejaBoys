import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, vi } from 'vitest'
import type {
  FantasyEntry,
  FantasyRound,
  MatchFeedbackResponse,
  MatchFeedbackSummary,
  MatchReport,
  MemberProfile,
  PadelPoll,
} from '../types'
import type { NotificationDelivery } from '../lib/notificationHistory'
import { repository } from '../lib/repository'
import { slotElementId } from '../lib/slotNavigation'
import { Dashboard } from './Dashboard'

const dashboardTestState = vi.hoisted(() => {
  const defaultDelivery = {
    id: 'delivery-1',
    eventId: 'event-1',
    kind: 'test',
    title: 'Attenzione fagianotto',
    body: 'Messaggio di prova.',
    userId: 'jury',
    subscriptionId: 'phone',
    sentAt: Date.UTC(2026, 6, 27, 8, 30),
  } satisfies NotificationDelivery
  return {
    polls: [] as PadelPoll[],
    members: [] as MemberProfile[],
    feedbackResponses: [] as MatchFeedbackResponse[],
    feedbackSummaries: [] as MatchFeedbackSummary[],
    reports: [] as MatchReport[],
    fantasyRounds: [] as FantasyRound[],
    fantasyEntries: [] as FantasyEntry[],
    deliveries: [defaultDelivery] as NotificationDelivery[],
    defaultDelivery,
    pollSubscriptionMode: 'success' as 'success' | 'stalled-once' | 'stalled',
    pollSubscriptionCalls: 0,
  }
})

vi.mock('../AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'jury',
      displayName: 'Jury',
      email: 'jury@example.test',
      createdAt: 1,
    },
    signOut: vi.fn(),
    updateProfile: vi.fn(),
  }),
}))

vi.mock('../lib/firebase', () => ({ hasRemoteBackend: true }))

vi.mock('../lib/notifications', () => ({
  notificationStateLabel: () => 'Da attivare',
  usePushNotifications: () => ({
    state: 'prompt',
    busy: false,
    shouldPrompt: false,
    enable: vi.fn(),
    disable: vi.fn(),
    dismiss: vi.fn(),
  }),
}))

vi.mock('../lib/repository', () => ({
  repository: {
    subscribePolls: (listener: (polls: PadelPoll[]) => void) => {
      dashboardTestState.pollSubscriptionCalls += 1
      const shouldRespond = dashboardTestState.pollSubscriptionMode === 'success'
        || (
          dashboardTestState.pollSubscriptionMode === 'stalled-once'
          && dashboardTestState.pollSubscriptionCalls > 1
        )
      if (shouldRespond) listener(dashboardTestState.polls)
      return vi.fn()
    },
    subscribeMembers: (listener: (members: MemberProfile[]) => void) => {
      listener(dashboardTestState.members)
      return vi.fn()
    },
    subscribeMatchFeedbackResponses: (_userId: string, listener: (responses: MatchFeedbackResponse[]) => void) => {
      listener(dashboardTestState.feedbackResponses)
      return vi.fn()
    },
    subscribeMatchFeedbackSummaries: (listener: (summaries: MatchFeedbackSummary[]) => void) => {
      listener(dashboardTestState.feedbackSummaries)
      return vi.fn()
    },
    subscribeMatchReports: (_userId: string, listener: (reports: MatchReport[]) => void) => {
      listener(dashboardTestState.reports)
      return vi.fn()
    },
    subscribeAllMatchReports: (listener: (reports: MatchReport[]) => void) => {
      listener(dashboardTestState.reports)
      return vi.fn()
    },
    subscribeFantasyRounds: (listener: (rounds: FantasyRound[]) => void) => {
      listener(dashboardTestState.fantasyRounds)
      return vi.fn()
    },
    subscribeFantasyEntry: (
      roundId: string,
      managerId: string,
      listener: (entry: FantasyEntry | undefined) => void,
    ) => {
      listener(dashboardTestState.fantasyEntries.find((entry) => (
        entry.roundId === roundId && entry.managerId === managerId
      )))
      return vi.fn()
    },
    subscribeFantasyRoundEntries: (
      roundId: string,
      listener: (entries: FantasyEntry[]) => void,
    ) => {
      listener(dashboardTestState.fantasyEntries.filter((entry) => entry.roundId === roundId))
      return vi.fn()
    },
    subscribeNotificationDeliveries: (_userId: string, listener: (deliveries: NotificationDelivery[]) => void) => {
      listener(dashboardTestState.deliveries)
      return vi.fn()
    },
    markNotificationDeliveriesRead: vi.fn().mockResolvedValue(undefined),
    saveMatchReport: vi.fn(),
    saveFantasyEntry: vi.fn(),
  },
}))

describe('menu account', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dashboardTestState.polls = []
    dashboardTestState.members = []
    dashboardTestState.feedbackResponses = []
    dashboardTestState.feedbackSummaries = []
    dashboardTestState.reports = []
    dashboardTestState.fantasyRounds = []
    dashboardTestState.fantasyEntries = []
    dashboardTestState.deliveries = [dashboardTestState.defaultDelivery]
    dashboardTestState.pollSubscriptionMode = 'success'
    dashboardTestState.pollSubscriptionCalls = 0
    window.history.replaceState({}, '', '/')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resta aperto al suo interno e si chiude con un clic esterno o con Escape', async () => {
    const user = userEvent.setup()
    render(<Dashboard />)

    const trigger = screen.getByRole('button', { name: 'Apri menu account di Jury' })
    await user.click(trigger)
    await user.click(screen.getByText('jury@example.test'))
    expect(screen.getByRole('button', { name: /Profilo/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Chiama Oasi Boschetto/ }))
      .toHaveAttribute('href', 'tel:+390376290058')

    await user.click(screen.getByRole('heading', { name: /Mettiamo in campo/ }))
    expect(screen.queryByRole('button', { name: /Profilo/ })).not.toBeInTheDocument()

    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: /Profilo/ })).not.toBeInTheDocument()
  })

  it('aggiunge I miei match alla cronologia e torna alla bacheca con la navigazione indietro', async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/')
    render(<Dashboard />)

    expect(document.querySelector('.pull-refresh')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Apri menu account di Jury' }))
    await user.click(screen.getByRole('button', { name: /I miei match/ }))

    expect(window.location.hash).toBe('#i-miei-match')
    expect(screen.getByRole('heading', { name: 'I miei match' })).toBeInTheDocument()
    expect(document.querySelector('.pull-refresh')).toBeInTheDocument()

    act(() => {
      window.history.replaceState({}, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(screen.getByRole('heading', { name: /Mettiamo in campo/ })).toBeInTheDocument()
  })

  it('apre Gli altri match e carica soltanto allora le medie aggregate del gruppo', async () => {
    dashboardTestState.members = [
      { id: 'ale', displayName: 'Ale', email: 'ale@example.test', createdAt: 1 },
      { id: 'baru', displayName: 'Baru', email: 'baru@example.test', createdAt: 1 },
      { id: 'luca', displayName: 'Luca', email: 'luca@example.test', createdAt: 1 },
      { id: 'teo', displayName: 'Teo', email: 'teo@example.test', createdAt: 1 },
    ]
    dashboardTestState.polls = [{
      id: 'poll-group',
      title: 'Vecchio titolo',
      targetWeekStart: '2020-07-27',
      createdBy: 'ale',
      createdByName: 'Ale',
      createdAt: 1,
      updatedAt: 1,
      status: 'closed',
      slots: [{
        id: 'slot-group',
        startsAt: '2020-07-29T16:00:00.000Z',
        durationMinutes: 90,
        venue: 'Oasi Boschetto',
        bookedAt: 1,
        signups: dashboardTestState.members.map((member, index) => ({
          id: `signup-${member.id}`,
          userId: member.id,
          displayName: member.displayName,
          joinedAt: index + 1,
        })),
      }],
    }]
    dashboardTestState.feedbackSummaries = [{
      id: 'poll-group__slot-group__ale',
      pollId: 'poll-group',
      slotId: 'slot-group',
      playerId: 'ale',
      scoreUnitsTotal: 30,
      ratingCount: 2,
      lastResponseId: 'response-2',
      updatedAt: 2,
    }]
    const user = userEvent.setup()
    render(<Dashboard />)

    await user.click(screen.getByRole('button', { name: 'Apri menu account di Jury' }))
    await user.click(screen.getByRole('button', { name: /Gli altri match/ }))

    expect(window.location.hash).toBe('#gli-altri-match')
    expect(screen.getByRole('heading', { name: 'Gli altri match' })).toBeInTheDocument()
    expect(screen.getByText('Padel · 27 lug – 2 ago 2020')).toBeInTheDocument()
    expect(screen.getByRole('listitem', {
      name: 'Ale: giudizio medio Pavone gonfiato, calcolato su 2 giudizi ricevuti',
    })).toBeInTheDocument()

    act(() => {
      window.history.replaceState({}, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(screen.getByRole('heading', { name: /Mettiamo in campo/ })).toBeInTheDocument()
  })

  it('apre FantaBandeja dal menu account e mantiene la route dedicata', async () => {
    const user = userEvent.setup()
    render(<Dashboard />)

    await user.click(screen.getByRole('button', { name: 'Apri menu account di Jury' }))
    await user.click(screen.getByRole('button', { name: /FantaBandeja/ }))

    expect(window.location.hash).toBe('#fantabandeja')
    expect(screen.getByRole('heading', { name: /FantaBandeja/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'La stagione è finita.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', {
      name: 'La stagione si è chiusa senza round archiviati.',
    })).toBeInTheDocument()
  })

  it('apre l’archivio dall’icona accanto al profilo e torna indietro', async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/')
    render(<Dashboard />)

    await user.click(await screen.findByRole('button', {
      name: 'Apri le mie notifiche, 1 notifica non letta',
    }))

    expect(window.location.hash).toBe('#notifiche')
    expect(screen.getByRole('heading', { name: 'Le mie notifiche' })).toBeInTheDocument()
    expect(document.querySelector('.pull-refresh')).toBeInTheDocument()
    expect(screen.getByText('Attenzione fagianotto')).toBeInTheDocument()
    expect(screen.getByText('Messaggio di prova.')).toBeInTheDocument()
    await waitFor(() => {
      expect(repository.markNotificationDeliveriesRead).toHaveBeenCalledWith(['delivery-1'])
    })

    act(() => {
      window.history.replaceState({}, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(screen.getByRole('heading', { name: /Mettiamo in campo/ })).toBeInTheDocument()
  })

  it('segna come letta la notifica specifica quando l’app viene aperta dalla push', async () => {
    window.history.replaceState({}, '', '/?notificationEvent=event-1')
    render(<Dashboard />)

    await waitFor(() => {
      expect(repository.markNotificationDeliveriesRead).toHaveBeenCalledWith(['delivery-1'])
      expect(window.location.search).toBe('')
    })
  })

  it('non conta né riscrive gli avvisi già letti quando apre normalmente la bacheca', async () => {
    dashboardTestState.deliveries = [{
      ...dashboardTestState.defaultDelivery,
      readAt: Date.UTC(2026, 6, 27, 8, 35),
    }]
    render(<Dashboard />)

    expect(await screen.findByRole('button', {
      name: 'Apri le mie notifiche, 0 notifiche non lette',
    })).toBeInTheDocument()
    expect(repository.markNotificationDeliveriesRead).not.toHaveBeenCalled()
  })

  it('rinnova automaticamente il listener se il primo caricamento resta sospeso', async () => {
    vi.useFakeTimers()
    dashboardTestState.pollSubscriptionMode = 'stalled-once'

    render(<Dashboard />)
    expect(screen.getByText('Prepariamo il campo…')).toBeInTheDocument()
    expect(dashboardTestState.pollSubscriptionCalls).toBe(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000)
    })

    expect(dashboardTestState.pollSubscriptionCalls).toBe(2)
    expect(screen.queryByText('Prepariamo il campo…')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ancora nessun sondaggio.' })).toBeInTheDocument()
  })

  it('non lascia lo spinner infinito se Firestore non risponde', async () => {
    vi.useFakeTimers()
    dashboardTestState.pollSubscriptionMode = 'stalled'

    render(<Dashboard />)

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6_000)
      })
    }

    expect(dashboardTestState.pollSubscriptionCalls).toBe(3)
    expect(screen.queryByText('Prepariamo il campo…')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Aggiorniamo il tabellone.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Riprova ora' })).toBeInTheDocument()
  })

  it('rinnova silenziosamente i listener quando la PWA torna visibile', () => {
    render(<Dashboard />)
    expect(dashboardTestState.pollSubscriptionCalls).toBe(1)

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(dashboardTestState.pollSubscriptionCalls).toBe(2)
    expect(screen.queryByText('Prepariamo il campo…')).not.toBeInTheDocument()
  })

  it('apre dalla lista match lo slot corretto e ripete lo scroll dopo il ripristino di Safari', async () => {
    dashboardTestState.polls = [{
      id: 'poll-future',
      title: 'Padel futuro',
      targetWeekStart: '2099-01-05',
      createdBy: 'jury',
      createdByName: 'Jury',
      createdAt: 1,
      updatedAt: 1,
      status: 'open',
      slots: [{
        id: 'slot-future',
        startsAt: '2099-01-05T19:30',
        durationMinutes: 90,
        venue: '',
        signups: [
          { id: 'signup-jury', userId: 'jury', displayName: 'Jury', joinedAt: 1, role: 'starter' },
          { id: 'signup-a', userId: 'a', displayName: 'A', joinedAt: 2, role: 'starter' },
          { id: 'signup-b', userId: 'b', displayName: 'B', joinedAt: 3, role: 'starter' },
          { id: 'signup-c', userId: 'c', displayName: 'C', joinedAt: 4, role: 'starter' },
        ],
      }],
    }]
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/')
    render(<Dashboard />)

    await user.click(screen.getByRole('button', { name: /^Slot prenotati/ }))
    expect(screen.queryByText('Padel futuro')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Apri menu account di Jury' }))
    await user.click(screen.getByRole('button', { name: /I miei match/ }))
    await user.click(screen.getByRole('button', {
      name: /Apri Padel · 5 gen – 11 gen 2099.*nella bacheca/,
    }))

    act(() => {
      window.history.replaceState({}, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    const target = document.getElementById(slotElementId({
      pollId: 'poll-future',
      slotId: 'slot-future',
    }))
    expect(target).toBeInTheDocument()
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledTimes(3)
      expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'smooth', block: 'start' })
      expect(target).toHaveClass('slot-card--highlighted')
    }, { timeout: 1_500 })
  })

  it('usa i nomi profilo correnti e il titolo settimanale nel referto', async () => {
    dashboardTestState.members = [
      { id: 'jury', displayName: 'Jury', email: 'jury@example.test', createdAt: 1 },
      { id: 'luigi', displayName: 'Luigi', email: 'luigi@example.test', createdAt: 1 },
      { id: 'alex', displayName: 'Alex', email: 'alex@example.test', createdAt: 1 },
      { id: 'brescio', displayName: 'Brescio', email: 'brescio@example.test', createdAt: 1 },
    ]
    dashboardTestState.polls = [{
      id: 'poll-past',
      title: 'Padel · prossima settimana',
      targetWeekStart: '2020-07-27',
      createdBy: 'jury',
      createdByName: 'jurydambros',
      createdAt: 1,
      updatedAt: 1,
      status: 'closed',
      slots: [{
        id: 'slot-past',
        startsAt: '2020-07-29T16:00:00.000Z',
        durationMinutes: 90,
        venue: 'Oasi Boschetto',
        bookedAt: 1,
        signups: [
          { id: 'signup-jury', userId: 'jury', displayName: 'jurydambros', joinedAt: 1 },
          { id: 'signup-luigi', userId: 'luigi', displayName: 'larduini03', joinedAt: 2 },
          { id: 'signup-alex', userId: 'alex', displayName: 'Alex', joinedAt: 3 },
          { id: 'signup-brescio', userId: 'brescio', displayName: 'EviNinja', joinedAt: 4 },
        ],
      }],
    }]
    const user = userEvent.setup()
    render(<Dashboard />)

    await user.click(screen.getByRole('button', { name: 'Apri menu account di Jury' }))
    await user.click(screen.getByRole('button', { name: /I miei match/ }))

    expect(screen.getByText('Padel · 27 lug – 2 ago 2020')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Aggiungi il referto/ }))

    expect(screen.getByRole('option', {
      name: 'Jury + Luigi — Alex + Brescio',
    })).toBeInTheDocument()
    expect(screen.queryByText(/jurydambros|larduini03|EviNinja/)).not.toBeInTheDocument()
  }, 30_000)

  it('apre direttamente il referto indicato dal deep link per un titolare', async () => {
    dashboardTestState.members = [
      { id: 'jury', displayName: 'Jury', email: 'jury@example.test', createdAt: 1 },
      { id: 'luigi', displayName: 'Luigi', email: 'luigi@example.test', createdAt: 1 },
      { id: 'alex', displayName: 'Alex', email: 'alex@example.test', createdAt: 1 },
      { id: 'brescio', displayName: 'Brescio', email: 'brescio@example.test', createdAt: 1 },
    ]
    dashboardTestState.polls = [{
      id: 'poll-deep-link',
      title: 'Padel · prossima settimana',
      targetWeekStart: '2020-07-27',
      createdBy: 'jury',
      createdByName: 'Jury',
      createdAt: 1,
      updatedAt: 1,
      status: 'closed',
      slots: [{
        id: 'slot-deep-link',
        startsAt: '2020-07-29T16:00:00.000Z',
        durationMinutes: 90,
        venue: 'Oasi Boschetto',
        bookedAt: 1,
        signups: dashboardTestState.members.map((member, index) => ({
          id: `signup-${member.id}`,
          userId: member.id,
          displayName: member.displayName,
          joinedAt: index + 1,
        })),
      }],
    }]
    window.history.replaceState(
      {},
      '',
      '/?reportPoll=poll-deep-link&reportSlot=slot-deep-link#i-miei-match',
    )

    render(<Dashboard />)

    expect(await screen.findByRole('heading', { name: 'Com’è finita?' }))
      .toBeInTheDocument()
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('#i-miei-match')
  }, 30_000)
})
