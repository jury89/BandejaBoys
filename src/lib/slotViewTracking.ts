export const SLOT_VIEW_THRESHOLD = 0.5
export const SLOT_VIEW_DELAY_MS = 1_000
const SLOT_VIEW_SESSION_PREFIX = 'bandeja-boys:slot-viewed:'

interface SlotViewTrackingOptions {
  storage?: Storage
  delayMs?: number
  threshold?: number
}

export function slotViewSessionKey(pollId: string, slotId: string, userId: string): string {
  return `${SLOT_VIEW_SESSION_PREFIX}${pollId}:${slotId}:${userId}`
}

export function trackSustainedSlotView(
  element: Element,
  sessionKey: string,
  recordView: () => Promise<void>,
  options: SlotViewTrackingOptions = {},
): () => void {
  const storage = options.storage ?? sessionStorage
  if (storage.getItem(sessionKey) || typeof IntersectionObserver === 'undefined') return () => undefined

  const delayMs = options.delayMs ?? SLOT_VIEW_DELAY_MS
  const threshold = options.threshold ?? SLOT_VIEW_THRESHOLD
  let timeoutId: number | undefined
  let stopped = false

  const clearPending = () => {
    if (timeoutId === undefined) return
    window.clearTimeout(timeoutId)
    timeoutId = undefined
  }

  const observer = new IntersectionObserver((entries) => {
    const entry = entries.find((candidate) => candidate.target === element)
    const visible = Boolean(entry?.isIntersecting && entry.intersectionRatio >= threshold)
    if (!visible) {
      clearPending()
      return
    }
    if (timeoutId !== undefined || storage.getItem(sessionKey)) return

    timeoutId = window.setTimeout(() => {
      timeoutId = undefined
      if (stopped || storage.getItem(sessionKey)) return
      storage.setItem(sessionKey, 'pending')
      observer.disconnect()
      void recordView()
        .then(() => storage.setItem(sessionKey, 'recorded'))
        .catch(() => storage.removeItem(sessionKey))
    }, delayMs)
  }, { threshold: [threshold] })

  observer.observe(element)
  return () => {
    stopped = true
    clearPending()
    observer.disconnect()
  }
}
