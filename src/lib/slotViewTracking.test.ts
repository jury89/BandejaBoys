import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  slotViewSessionKey,
  trackSustainedSlotView,
} from './slotViewTracking'

let observerCallback: IntersectionObserverCallback
const observe = vi.fn()
const disconnect = vi.fn()

class IntersectionObserverMock {
  constructor(callback: IntersectionObserverCallback) {
    observerCallback = callback
  }

  observe = observe
  disconnect = disconnect
  unobserve = vi.fn()
  takeRecords = vi.fn(() => [])
  root = null
  rootMargin = '0px'
  thresholds = [0.5]
}

function entry(target: Element, isIntersecting: boolean, intersectionRatio: number): IntersectionObserverEntry {
  return { target, isIntersecting, intersectionRatio } as unknown as IntersectionObserverEntry
}

describe('slot view tracking', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
    observe.mockClear()
    disconnect.mockClear()
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('registra dopo un secondo con almeno metà scheda visibile', async () => {
    const element = document.createElement('article')
    const recordView = vi.fn().mockResolvedValue(undefined)
    trackSustainedSlotView(element, 'view-key', recordView)

    observerCallback([
      entry(element, true, 0.5),
    ], {} as IntersectionObserver)
    await vi.advanceTimersByTimeAsync(999)
    expect(recordView).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(recordView).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem('view-key')).toBe('recorded')
  })

  it('annulla il conteggio se la scheda esce dalla vista', async () => {
    const element = document.createElement('article')
    const recordView = vi.fn().mockResolvedValue(undefined)
    trackSustainedSlotView(element, 'view-key', recordView)

    observerCallback([
      entry(element, true, 0.75),
    ], {} as IntersectionObserver)
    await vi.advanceTimersByTimeAsync(500)
    observerCallback([
      entry(element, false, 0),
    ], {} as IntersectionObserver)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(recordView).not.toHaveBeenCalled()
  })

  it('non registra due volte la stessa coppia utente e slot nella sessione', () => {
    const key = slotViewSessionKey('poll-1', 'slot-1', 'jury')
    sessionStorage.setItem(key, 'recorded')
    const recordView = vi.fn().mockResolvedValue(undefined)

    trackSustainedSlotView(document.createElement('article'), key, recordView)

    expect(observe).not.toHaveBeenCalled()
    expect(recordView).not.toHaveBeenCalled()
  })
})
