import { describe, expect, it } from 'vitest'
import { buildNotificationHistory, type NotificationDelivery } from './notificationHistory'

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
    }])
  })

  it('mantiene separati avvisi diversi e li ordina dal più recente', () => {
    const history = buildNotificationHistory([
      delivery('older', 'event-1', 'phone', 100, 'Prima'),
      delivery('newer', 'event-2', 'phone', 200, 'Seconda'),
    ])

    expect(history.map((item) => item.eventId)).toEqual(['event-2', 'event-1'])
  })
})
