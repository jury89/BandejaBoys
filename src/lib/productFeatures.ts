import type { NotificationPreferences } from '../types'

export type FantasyBandejaMode = 'active' | 'archive'

/**
 * Product switches for features that remain implemented but are temporarily paused.
 * Firestore Rules mirror these values to enforce the same policy for stale clients.
 */
export const PRODUCT_FEATURES = Object.freeze({
  matchFeedbackEnabled: false,
  fantasyBandejaMode: 'archive' as FantasyBandejaMode,
})

export const MATCH_FEEDBACK_ENABLED = PRODUCT_FEATURES.matchFeedbackEnabled
export const FANTASY_BANDEJA_READ_ONLY = PRODUCT_FEATURES.fantasyBandejaMode === 'archive'
export const FANTASY_BANDEJA_WRITES_ENABLED = !FANTASY_BANDEJA_READ_ONLY

const PAUSED_NOTIFICATION_KINDS = new Set([
  'match-rating',
  'match-mvp',
  'match-feedback',
  'fantasy-open',
  'fantasy-roster-changed',
  'fantasy-result',
])

export function isProductNotificationEnabled(kind: string): boolean {
  return !PAUSED_NOTIFICATION_KINDS.has(kind)
}

export function isNotificationPreferenceVisible(
  key: keyof NotificationPreferences,
): boolean {
  if (key === 'matchFeedback') return MATCH_FEEDBACK_ENABLED
  if (key === 'fantasy') return !FANTASY_BANDEJA_READ_ONLY
  return true
}
