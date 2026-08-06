const APP_ORIGIN = 'https://bandeja-boys.web.app'

export const MATCH_REPORT_POLL_QUERY_PARAM = 'reportPoll'
export const MATCH_REPORT_SLOT_QUERY_PARAM = 'reportSlot'

export interface MatchReportNavigationTarget {
  pollId: string
  slotId: string
}

export function matchReportTargetFromSearch(search: string): MatchReportNavigationTarget | null {
  const parameters = new URLSearchParams(search)
  const pollId = parameters.get(MATCH_REPORT_POLL_QUERY_PARAM)?.trim()
  const slotId = parameters.get(MATCH_REPORT_SLOT_QUERY_PARAM)?.trim()
  return pollId && slotId ? { pollId, slotId } : null
}

export function matchReportDeepLink(target: MatchReportNavigationTarget) {
  const parameters = new URLSearchParams({
    [MATCH_REPORT_POLL_QUERY_PARAM]: target.pollId,
    [MATCH_REPORT_SLOT_QUERY_PARAM]: target.slotId,
  })
  return `/?${parameters.toString()}#i-miei-match`
}

export function normalizeInternalNotificationUrl(value: string | undefined) {
  const normalized = value?.trim()
  if (!normalized) return undefined
  if (!normalized.startsWith('/') || normalized.startsWith('//') || normalized.includes('\\')) {
    throw new Error('Il link della notifica deve essere un percorso interno che inizia con /.')
  }

  const url = new URL(normalized, APP_ORIGIN)
  if (url.origin !== APP_ORIGIN) {
    throw new Error('Il link della notifica deve restare all’interno di Bandeja Boys.')
  }
  return `${url.pathname}${url.search}${url.hash}`
}

export function addPushRefreshParameter(url: string, identifier: string) {
  const normalized = normalizeInternalNotificationUrl(url) || '/'
  const parsed = new URL(normalized, APP_ORIGIN)
  parsed.searchParams.set('_pushRefresh', identifier)
  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}
