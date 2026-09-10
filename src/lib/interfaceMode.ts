import type { InterfaceMode } from '../types'

export function normalizeInterfaceMode(value: unknown): InterfaceMode {
  return value === 'nuova' ? 'nuova' : 'classica'
}

export function interfaceOverride(search: string): InterfaceMode | null {
  const value = new URLSearchParams(search).get('ux')
  return value === 'nuova' || value === 'classica' ? value : null
}

export function resolveInterfaceMode(search: string, preference?: unknown): InterfaceMode {
  return interfaceOverride(search) ?? normalizeInterfaceMode(preference)
}

export function withoutInterfaceOverride(href: string): string {
  const url = new URL(href)
  url.searchParams.delete('ux')
  return `${url.pathname}${url.search}${url.hash}`
}
