import type { NotificationPreferences } from '../types'

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  mondayMotivation: true,
  newSlots: true,
  slotReady: true,
  bookingReminder7d: true,
  reminder24h: true,
  reminder2h: true,
  matchRating: true,
}

export function normalizeNotificationPreferences(
  preferences?: Partial<NotificationPreferences>,
): NotificationPreferences {
  return {
    mondayMotivation: preferences?.mondayMotivation ?? true,
    newSlots: preferences?.newSlots ?? true,
    slotReady: preferences?.slotReady ?? true,
    bookingReminder7d: preferences?.bookingReminder7d ?? true,
    reminder24h: preferences?.reminder24h ?? true,
    reminder2h: preferences?.reminder2h ?? true,
    matchRating: preferences?.matchRating ?? true,
  }
}
