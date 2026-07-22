import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { Dashboard } from './Dashboard'

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

vi.mock('../lib/firebase', () => ({ hasRemoteBackend: false }))

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
    subscribePolls: (listener: (polls: []) => void) => {
      listener([])
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
})
