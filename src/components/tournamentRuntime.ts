import { createContext, useContext, useEffect, useState } from 'react'
import { repository } from '../lib/repository'
import type { TournamentRepository } from '../lib/tournamentRepository'

export interface TournamentRuntime {
  repository: TournamentRepository
  now: () => number
  simulation: boolean
  clockEvent?: string
}
export const TournamentRuntimeContext = createContext<TournamentRuntime>({ repository, now: () => Date.now(), simulation: false })
export const useTournamentRuntime = () => useContext(TournamentRuntimeContext)
export function useTournamentNow() {
  const runtime = useTournamentRuntime()
  const [now, setNow] = useState(runtime.now)
  useEffect(() => {
    const update = () => setNow(runtime.now())
    const timer = window.setInterval(update, 1000)
    if (runtime.clockEvent) window.addEventListener(runtime.clockEvent, update)
    window.addEventListener('storage', update)
    return () => {
      window.clearInterval(timer)
      if (runtime.clockEvent) window.removeEventListener(runtime.clockEvent, update)
      window.removeEventListener('storage', update)
    }
  }, [runtime])
  return now
}
