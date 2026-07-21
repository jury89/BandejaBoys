import { describe, expect, it, vi } from 'vitest'
import scheduler, { dispatchNotificationWorkflow } from './worker.js'

describe('notification scheduler worker', () => {
  it('dispatches the notifications workflow on main', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))

    await dispatchNotificationWorkflow('limited-token', fetcher)

    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.github.com/repos/jury89/BandejaBoys/actions/workflows/notifications.yml/dispatches',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ref: 'main' }),
        headers: expect.objectContaining({
          Authorization: 'Bearer limited-token',
        }),
      }),
    )
  })

  it('rejects a missing GitHub token before making a request', async () => {
    const fetcher = vi.fn()

    await expect(dispatchNotificationWorkflow('', fetcher)).rejects.toThrow(
      'Missing GITHUB_TOKEN secret',
    )
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('surfaces a rejected workflow dispatch', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('forbidden', { status: 403 }))

    await expect(dispatchNotificationWorkflow('limited-token', fetcher)).rejects.toThrow(
      'GitHub workflow dispatch failed (403): forbidden',
    )
  })

  it('keeps the scheduled request alive until dispatch completes', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const waitUntil = vi.fn()
    vi.stubGlobal('fetch', fetcher)

    try {
      scheduler.scheduled({}, { GITHUB_TOKEN: 'limited-token' }, { waitUntil })

      expect(waitUntil).toHaveBeenCalledOnce()
      await expect(waitUntil.mock.calls[0][0]).resolves.toBeUndefined()
      expect(fetcher).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
