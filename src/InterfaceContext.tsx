import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'
import type { InterfaceMode } from './types'
import { resolveInterfaceMode, withoutInterfaceOverride } from './lib/interfaceMode'

const InterfaceContext = createContext<InterfaceMode | null>(null)
const CHANGE_EVENT = 'bandeja-boys:interface'
const subscribe = (notify: () => void) => {
  window.addEventListener('popstate', notify)
  window.addEventListener(CHANGE_EVENT, notify)
  return () => {
    window.removeEventListener('popstate', notify)
    window.removeEventListener(CHANGE_EVENT, notify)
  }
}

export function InterfaceProvider({ preference, children }: { preference?: InterfaceMode; children: ReactNode }) {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => '')
  return <InterfaceContext.Provider value={resolveInterfaceMode(search, preference)}>{children}</InterfaceContext.Provider>
}

// Shared by both presentation variants; neither variant owns data subscriptions.
// eslint-disable-next-line react-refresh/only-export-components
export function useInterfaceMode() {
  return useContext(InterfaceContext) ?? resolveInterfaceMode(window.location.search)
}

// Only called after a successful explicit profile save, never by following a link.
// eslint-disable-next-line react-refresh/only-export-components
export function clearInterfaceOverride() {
  window.history.replaceState(window.history.state, '', withoutInterfaceOverride(window.location.href))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}
