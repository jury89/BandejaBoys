import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestNotificationPermission } from './notifications'

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
