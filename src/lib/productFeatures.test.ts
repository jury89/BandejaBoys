import { describe, expect, it } from 'vitest'
import {
  FANTASY_BANDEJA_READ_ONLY,
  FANTASY_BANDEJA_WRITES_ENABLED,
  isNotificationPreferenceVisible,
  isProductNotificationEnabled,
  MATCH_FEEDBACK_ENABLED,
} from './productFeatures'

describe('product feature availability', () => {
  it('sospende giudizi e nuove attività FantaBandeja mantenendo attive le altre notifiche', () => {
    expect(MATCH_FEEDBACK_ENABLED).toBe(false)
    expect(FANTASY_BANDEJA_READ_ONLY).toBe(true)
    expect(FANTASY_BANDEJA_WRITES_ENABLED).toBe(false)
    expect(isProductNotificationEnabled('match-feedback')).toBe(false)
    expect(isProductNotificationEnabled('fantasy-open')).toBe(false)
    expect(isProductNotificationEnabled('fantasy-result')).toBe(false)
    expect(isProductNotificationEnabled('reminder-24h')).toBe(true)
  })

  it('nasconde dal profilo le preferenze che non possono più produrre avvisi', () => {
    expect(isNotificationPreferenceVisible('matchFeedback')).toBe(false)
    expect(isNotificationPreferenceVisible('fantasy')).toBe(false)
    expect(isNotificationPreferenceVisible('newSlots')).toBe(true)
  })
})
