import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { SessionUser } from '../types'
import { requestNotificationPermission, usePushNotifications } from './notifications'

describe('requestNotificationPermission', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('restituisce il permesso concesso dal browser', async () => {
    vi.stubGlobal('Notification', {
      requestPermission: vi.fn().mockResolvedValue('granted'),
    })

    await expect(requestNotificationPermission(100)).resolves.toBe('granted')
  })

  it('interrompe una richiesta di permesso che non risponde', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('Notification', {
      requestPermission: vi.fn().mockReturnValue(new Promise(() => undefined)),
    })

    const result = expect(requestNotificationPermission(100)).rejects.toThrow(
      'Il browser non ha risposto',
    )
    await vi.advanceTimersByTimeAsync(100)

    await result
  })
})

describe('chiusura delle istruzioni iOS', () => {
  const user: SessionUser = {
    id: 'jury',
    displayName: 'Jury',
    email: 'jury@example.test',
    createdAt: 1,
  }

  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('ricorda in modo permanente di non mostrare più il pannello', async () => {
    localStorage.clear()
    sessionStorage.clear()
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone)')
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))

    const firstVisit = renderHook(() => usePushNotifications(user))
    await waitFor(() => expect(firstVisit.result.current.state).toBe('ios-install'))
    expect(firstVisit.result.current.shouldPrompt).toBe(true)

    act(() => firstVisit.result.current.dismiss())

    expect(localStorage.getItem('bandeja-boys:notification-prompt-dismissed:jury')).toBe('true')
    expect(sessionStorage.getItem('bandeja-boys:notification-prompt-dismissed:jury')).toBeNull()
    expect(firstVisit.result.current.shouldPrompt).toBe(false)
    firstVisit.unmount()

    const nextVisit = renderHook(() => usePushNotifications(user))
    await waitFor(() => expect(nextVisit.result.current.state).toBe('ios-install'))
    expect(nextVisit.result.current.shouldPrompt).toBe(false)
  })
})
