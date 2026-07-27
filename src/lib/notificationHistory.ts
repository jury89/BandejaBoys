import type { NotificationKind } from './notificationSchedule'

export interface NotificationDelivery {
  id: string
  eventId: string
  kind: NotificationKind
  title?: string
  body?: string
  userId: string
  subscriptionId: string
  sentAt: number
  readAt?: number
}

export interface NotificationHistoryItem {
  id: string
  eventId: string
  kind: NotificationKind
  title?: string
  body?: string
  sentAt: number
  deliveredDeviceCount: number
  deliveryIds: string[]
  isRead: boolean
}

export function buildNotificationHistory(
  deliveries: NotificationDelivery[],
): NotificationHistoryItem[] {
  const grouped = new Map<string, NotificationDelivery[]>()

  deliveries.forEach((delivery) => {
    const current = grouped.get(delivery.eventId) ?? []
    current.push(delivery)
    grouped.set(delivery.eventId, current)
  })

  return Array.from(grouped.entries())
    .map(([eventId, eventDeliveries]) => {
      const ordered = [...eventDeliveries]
        .sort((left, right) => right.sentAt - left.sentAt || right.id.localeCompare(left.id))
      const latest = ordered[0]
      return {
        id: latest.id,
        eventId,
        kind: latest.kind,
        title: latest.title,
        body: latest.body,
        sentAt: latest.sentAt,
        deliveredDeviceCount: new Set(eventDeliveries.map((delivery) => delivery.subscriptionId)).size,
        deliveryIds: ordered.map((delivery) => delivery.id),
        isRead: eventDeliveries.some((delivery) => (delivery.readAt ?? 0) > 0),
      }
    })
    .sort((left, right) => right.sentAt - left.sentAt || right.id.localeCompare(left.id))
}

export function unreadNotificationCount(notifications: NotificationHistoryItem[]): number {
  return notifications.filter((notification) => !notification.isRead).length
}
