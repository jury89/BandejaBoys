export interface SlotNavigationTarget {
  pollId: string
  slotId: string
}

export function slotElementId({ pollId, slotId }: SlotNavigationTarget): string {
  return `slot-${encodeURIComponent(pollId)}-${encodeURIComponent(slotId)}`
}
