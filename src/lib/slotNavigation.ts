export interface SlotNavigationTarget {
  pollId: string
  slotId: string
}

export function slotElementId({ pollId, slotId }: SlotNavigationTarget): string {
  return `slot-${encodeURIComponent(pollId)}-${encodeURIComponent(slotId)}`
}

export function slotTargetFromHash(hash: string): SlotNavigationTarget | null {
  const parts = hash.split('/')
  if (parts.length !== 3 || parts[0] !== '#slot') return null
  try {
    const pollId = decodeURIComponent(parts[1])
    const slotId = decodeURIComponent(parts[2])
    return pollId.trim() && slotId.trim() ? { pollId, slotId } : null
  } catch {
    return null
  }
}

/** Share only the slot address, without account overrides or notification parameters. */
export function slotShareUrl(baseUrl: string, { pollId, slotId }: SlotNavigationTarget): string {
  const url = new URL(baseUrl)
  url.search = ''
  url.hash = `slot/${encodeURIComponent(pollId)}/${encodeURIComponent(slotId)}`
  return url.href
}
