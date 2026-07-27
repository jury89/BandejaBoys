export const NOTIFICATION_EVENT_QUERY_PARAM = 'notificationEvent'

const APP_ORIGIN = 'https://bandeja-boys.web.app'

export function notificationUrlWithEvent(url: string, eventId: string): string {
  const destination = new URL(url || '/', APP_ORIGIN)
  destination.searchParams.set(NOTIFICATION_EVENT_QUERY_PARAM, eventId)
  return `${destination.pathname}${destination.search}${destination.hash}`
}

export function notificationEventFromSearch(search: string): string | null {
  const eventId = new URLSearchParams(search).get(NOTIFICATION_EVENT_QUERY_PARAM)?.trim()
  if (!eventId || eventId.length > 500) return null
  return eventId
}

export function removeNotificationEventFromCurrentUrl() {
  const destination = new URL(window.location.href)
  destination.searchParams.delete(NOTIFICATION_EVENT_QUERY_PARAM)
  window.history.replaceState(
    window.history.state,
    '',
    `${destination.pathname}${destination.search}${destination.hash}`,
  )
}
