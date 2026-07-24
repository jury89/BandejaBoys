export const PULL_REFRESH_THRESHOLD = 60
export const PULL_REFRESH_MAX_DISTANCE = 96

const PULL_RESISTANCE = 0.48
const VERTICAL_INTENT_RATIO = 1.25

export function resistedPullDistance(rawDistance: number): number {
  return Math.min(
    PULL_REFRESH_MAX_DISTANCE,
    Math.max(0, rawDistance) * PULL_RESISTANCE,
  )
}

export function isDownwardPull(horizontalDistance: number, verticalDistance: number): boolean {
  return verticalDistance > 0
    && verticalDistance > Math.abs(horizontalDistance) * VERTICAL_INTENT_RATIO
}

export function pullRefreshUrl(currentHref: string, requestedAt: number): string {
  const destination = new URL(currentHref)
  destination.searchParams.set('_pullRefresh', String(requestedAt))
  return destination.href
}
