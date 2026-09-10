import { useLayoutEffect, useRef } from 'react'

/** Retain each section's reading position, without interfering with slot deep links. */
export function usePageScroll(view: string, ready: boolean, hasExplicitTarget: boolean) {
  const positions = useRef(new Map<string, number>())
  useLayoutEffect(() => {
    if (!ready) return
    if (!hasExplicitTarget) window.scrollTo({ top: positions.current.get(view) ?? 0, behavior: 'instant' })
    const remember = () => positions.current.set(view, window.scrollY)
    window.addEventListener('scroll', remember, { passive: true })
    return () => window.removeEventListener('scroll', remember)
  }, [view, ready, hasExplicitTarget])
}
