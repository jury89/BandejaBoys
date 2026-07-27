const UPDATE_ATTEMPT_KEY = 'bandeja-boys:last-update-attempt'
const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000
const UPDATE_RETRY_DELAY_MS = 30 * 1000

interface BuildVersion {
  buildId?: unknown
}

export interface AppUpdateAttempt {
  buildId: string
  attemptedAt: number
}

export function parseAppUpdateAttempt(value: string | null): AppUpdateAttempt | null {
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as Partial<AppUpdateAttempt>
    if (typeof parsed.buildId === 'string' && typeof parsed.attemptedAt === 'number') {
      return { buildId: parsed.buildId, attemptedAt: parsed.attemptedAt }
    }
  } catch {
    // Legacy versions stored only the build id: make that attempt immediately retryable.
  }

  return { buildId: value, attemptedAt: 0 }
}

export function appUpdateUrl(
  remoteBuildId: string,
  currentBuildId: string,
  currentHref: string,
  lastAttempt?: AppUpdateAttempt | null,
  requestedAt = Date.now(),
): string | null {
  const cleanRemoteBuildId = remoteBuildId.trim()
  const recentlyAttempted = lastAttempt?.buildId === cleanRemoteBuildId
    && requestedAt - lastAttempt.attemptedAt < UPDATE_RETRY_DELAY_MS
  if (
    !cleanRemoteBuildId
    || cleanRemoteBuildId === currentBuildId
    || recentlyAttempted
  ) {
    return null
  }

  const destination = new URL(currentHref)
  destination.searchParams.set('_bbv', cleanRemoteBuildId)
  return destination.href
}

export function watchForAppUpdates(): () => void {
  let active = true
  let checking = false

  const check = async () => {
    if (!active || checking || document.visibilityState === 'hidden') return
    checking = true
    try {
      const response = await fetch(`/version.json?_=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) return
      const payload = await response.json() as BuildVersion
      if (typeof payload.buildId !== 'string') return

      const requestedAt = Date.now()
      const destination = appUpdateUrl(
        payload.buildId,
        __BANDEJA_BUILD_ID__,
        window.location.href,
        parseAppUpdateAttempt(sessionStorage.getItem(UPDATE_ATTEMPT_KEY)),
        requestedAt,
      )
      if (!destination) {
        if (payload.buildId === __BANDEJA_BUILD_ID__) {
          sessionStorage.removeItem(UPDATE_ATTEMPT_KEY)
        }
        return
      }

      sessionStorage.setItem(UPDATE_ATTEMPT_KEY, JSON.stringify({
        buildId: payload.buildId,
        attemptedAt: requestedAt,
      } satisfies AppUpdateAttempt))
      window.location.replace(destination)
    } catch {
      // Offline or a transient version endpoint failure: retry on the next foreground event.
    } finally {
      checking = false
    }
  }

  const checkWhenVisible = () => {
    if (document.visibilityState !== 'hidden') void check()
  }

  document.addEventListener('visibilitychange', checkWhenVisible)
  window.addEventListener('focus', checkWhenVisible)
  window.addEventListener('online', checkWhenVisible)
  window.addEventListener('pageshow', checkWhenVisible)
  const intervalId = window.setInterval(checkWhenVisible, VERSION_CHECK_INTERVAL_MS)
  void check()

  return () => {
    active = false
    document.removeEventListener('visibilitychange', checkWhenVisible)
    window.removeEventListener('focus', checkWhenVisible)
    window.removeEventListener('online', checkWhenVisible)
    window.removeEventListener('pageshow', checkWhenVisible)
    window.clearInterval(intervalId)
  }
}
