import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  PULL_REFRESH_THRESHOLD,
  isDownwardPull,
  pullRefreshUrl,
  resistedPullDistance,
} from '../lib/pullToRefresh'

interface PullToRefreshProps {
  onRefresh?: () => void
}

const REFRESH_DELAY_MS = 160

function refreshCurrentPage() {
  window.location.replace(pullRefreshUrl(window.location.href, Date.now()))
}

export function PullToRefresh({ onRefresh = refreshCurrentPage }: PullToRefreshProps) {
  const [distance, setDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startPoint = useRef<{ x: number; y: number } | null>(null)
  const currentDistance = useRef(0)
  const refreshingRef = useRef(false)
  const refreshTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const reset = () => {
      startPoint.current = null
      currentDistance.current = 0
      setDistance(0)
    }

    const onTouchStart = (event: TouchEvent) => {
      if (
        refreshingRef.current
        || event.touches.length !== 1
        || window.scrollY > 0
        || document.querySelector('.modal-backdrop')
      ) {
        reset()
        return
      }

      const touch = event.touches[0]
      startPoint.current = { x: touch.clientX, y: touch.clientY }
    }

    const onTouchMove = (event: TouchEvent) => {
      const origin = startPoint.current
      if (!origin || event.touches.length !== 1 || refreshingRef.current) return

      const touch = event.touches[0]
      const horizontalDistance = touch.clientX - origin.x
      const verticalDistance = touch.clientY - origin.y

      if (!isDownwardPull(horizontalDistance, verticalDistance)) {
        if (verticalDistance < 0 || Math.abs(horizontalDistance) > 12) reset()
        return
      }

      if (window.scrollY > 0 || document.querySelector('.modal-backdrop')) {
        reset()
        return
      }

      if (event.cancelable) event.preventDefault()
      const nextDistance = resistedPullDistance(verticalDistance)
      currentDistance.current = nextDistance
      setDistance(nextDistance)
    }

    const finishPull = () => {
      if (!startPoint.current || refreshingRef.current) return
      const shouldRefresh = currentDistance.current >= PULL_REFRESH_THRESHOLD
      reset()
      if (!shouldRefresh) return

      refreshingRef.current = true
      setRefreshing(true)
      refreshTimer.current = window.setTimeout(onRefresh, REFRESH_DELAY_MS)
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', finishPull, { passive: true })
    window.addEventListener('touchcancel', reset, { passive: true })

    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', finishPull)
      window.removeEventListener('touchcancel', reset)
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current)
    }
  }, [onRefresh])

  const ready = distance >= PULL_REFRESH_THRESHOLD
  const progress = refreshing
    ? 1
    : Math.min(1, distance / PULL_REFRESH_THRESHOLD)
  const style = {
    '--pull-distance': `${refreshing ? PULL_REFRESH_THRESHOLD : distance}px`,
    '--pull-progress': progress,
  } as CSSProperties

  return (
    <div
      className={[
        'pull-refresh',
        distance > 0 || refreshing ? 'is-visible' : '',
        ready ? 'is-ready' : '',
        refreshing ? 'is-refreshing' : '',
      ].filter(Boolean).join(' ')}
      style={style}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-hidden={distance === 0 && !refreshing}
    >
      <span className="pull-refresh__icon" aria-hidden="true">
        <RefreshCw size={17} strokeWidth={2.6} />
      </span>
      <span className="pull-refresh__copy">
        {refreshing
          ? 'Aggiorno la bacheca…'
          : ready
            ? 'Rilascia per aggiornare'
            : 'Tira per aggiornare'}
      </span>
    </div>
  )
}
