import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { MatchRatingRecord, PadelPoll } from '../types'
import type { NotificationDelivery } from '../lib/notificationHistory'
import { slotElementId } from '../lib/slotNavigation'
import { Dashboard } from './Dashboard'

const dashboardTestState = vi.hoisted(() => ({
  polls: [] as PadelPoll[],
  ratings: [] as MatchRatingRecord[],
  deliveries: [{
    id: 'delivery-1',
    eventId: 'event-1',
    kind: 'test',
    title: 'Attenzione fagianotto',
    body: 'Messaggio di prova.',
    userId: 'jury',
    subscriptionId: 'phone',
    sentAt: Date.UTC(2026, 6, 27, 8, 30),
  }] as NotificationDelivery[],
}))

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
      listener(dashboardTestState.polls)
      return vi.fn()
    },
    subscribeMembers: (listener: (members: []) => void) => {
      listener([])
      return vi.fn()
    },
    subscribeMatchRatingResponses: (_userId: string, listener: (responses: []) => void) => {
      listener([])
      return vi.fn()
    },
    subscribeReceivedMatchRatings: (_userId: string, listener: (ratings: MatchRatingRecord[]) => void) => {
      listener(dashboardTestState.ratings)
      return vi.fn()
    },
    subscribeNotificationDeliveries: (_userId: string, listener: (deliveries: NotificationDelivery[]) => void) => {
      listener(dashboardTestState.deliveries)
      return vi.fn()
    },
  },
}))

describe('menu account', () => {
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

    await user.click(screen.getByRole('button', { name: 'Apri menu account di Jury' }))
    await user.click(screen.getByRole('button', { name: /I miei match/ }))

    expect(window.location.hash).toBe('#i-miei-match')
    expect(screen.getByRole('heading', { name: 'I miei match' })).toBeInTheDocument()

    act(() => {
      window.history.replaceState({}, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(screen.getByRole('heading', { name: /Mettiamo in campo/ })).toBeInTheDocument()
  })

  it('apre l’archivio dall’icona accanto al profilo e torna indietro', async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, '', '/')
    render(<Dashboard />)

    await user.click(await screen.findByRole('button', {
      name: 'Apri le mie notifiche, 1 notifica',
    }))

    expect(window.location.hash).toBe('#notifiche')
    expect(screen.getByRole('heading', { name: 'Le mie notifiche' })).toBeInTheDocument()
    expect(screen.getByText('Attenzione fagianotto')).toBeInTheDocument()
    expect(screen.getByText('Messaggio di prova.')).toBeInTheDocument()

    act(() => {
      window.history.replaceState({}, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(screen.getByRole('heading', { name: /Mettiamo in campo/ })).toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: /Apri Padel futuro.*nella bacheca/ }))

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
})
