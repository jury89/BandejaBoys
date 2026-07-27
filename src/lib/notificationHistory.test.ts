import { describe, expect, it } from 'vitest'
import {
  buildNotificationHistory,
  unreadNotificationCount,
  type NotificationDelivery,
} from './notificationHistory'

const delivery = (
  id: string,
  eventId: string,
  subscriptionId: string,
  sentAt: number,
  body: string,
): NotificationDelivery => ({
  id,
  eventId,
  kind: 'new-slots',
  title: 'Nuovi slot disponibili',
  body,
  userId: 'jury',
  subscriptionId,
  sentAt,
})

describe('storico notifiche push', () => {
  it('raggruppa le consegne dello stesso avviso inviate a più dispositivi', () => {
    const history = buildNotificationHistory([
      delivery('delivery-phone', 'event-1', 'phone', 100, 'Testo precedente'),
      delivery('delivery-tablet', 'event-1', 'tablet', 105, 'Testo finale'),
    ])

    expect(history).toEqual([{
      id: 'delivery-tablet',
      eventId: 'event-1',
      kind: 'new-slots',
      title: 'Nuovi slot disponibili',
      body: 'Testo finale',
      sentAt: 105,
      deliveredDeviceCount: 2,
      deliveryIds: ['delivery-tablet', 'delivery-phone'],
      isRead: false,
    }])
  })

  it('mantiene separati avvisi diversi e li ordina dal più recente', () => {
    const history = buildNotificationHistory([
      delivery('older', 'event-1', 'phone', 100, 'Prima'),
      delivery('newer', 'event-2', 'phone', 200, 'Seconda'),
    ])

    expect(history.map((item) => item.eventId)).toEqual(['event-2', 'event-1'])
  })

  it('considera letto un avviso su tutti i dispositivi appena una consegna ha readAt', () => {
    const history = buildNotificationHistory([
      delivery('delivery-phone', 'event-1', 'phone', 100, 'Testo'),
      {
        ...delivery('delivery-tablet', 'event-1', 'tablet', 105, 'Testo'),
        readAt: 110,
      },
    ])

    expect(history[0]).toMatchObject({
      isRead: true,
      deliveryIds: ['delivery-tablet', 'delivery-phone'],
    })
  })

  it('conta soltanto gli avvisi non letti', () => {
    const history = buildNotificationHistory([
      { ...delivery('read', 'event-read', 'phone', 100, 'Letta'), readAt: 120 },
      delivery('unread', 'event-unread', 'phone', 200, 'Nuova'),
    ])

    expect(unreadNotificationCount(history)).toBe(1)
  })
})
