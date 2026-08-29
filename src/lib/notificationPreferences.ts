import type { NotificationPreferences } from '../types'

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  mondayMotivation: true,
  newSlots: true,
  slotReady: true,
  starterSubstitution: true,
  bookingReminder7d: true,
  reminder24h: true,
  reminder2h: true,
  matchMvp: true,
  fantasy: true,
}

export function normalizeNotificationPreferences(
  preferences?: Partial<NotificationPreferences>,
): NotificationPreferences {
  return {
    mondayMotivation: preferences?.mondayMotivation ?? true,
    newSlots: preferences?.newSlots ?? true,
    slotReady: preferences?.slotReady ?? true,
    starterSubstitution: preferences?.starterSubstitution ?? true,
    bookingReminder7d: preferences?.bookingReminder7d ?? true,
    reminder24h: preferences?.reminder24h ?? true,
    reminder2h: preferences?.reminder2h ?? true,
    matchMvp: preferences?.matchMvp ?? preferences?.matchRating ?? true,
    fantasy: preferences?.fantasy ?? true,
  }
}
