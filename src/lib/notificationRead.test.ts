import { describe, expect, it } from 'vitest'
import {
  NOTIFICATION_EVENT_QUERY_PARAM,
  notificationEventFromSearch,
  notificationUrlWithEvent,
} from './notificationRead'

describe('lettura notifiche push', () => {
  it('aggiunge l’identificativo senza perdere il deep link originale', () => {
    expect(notificationUrlWithEvent(
      '/?poll=poll-1#slot-slot-2',
      'slot-ready:poll-1:slot-2:123',
    )).toBe(
      `/?poll=poll-1&${NOTIFICATION_EVENT_QUERY_PARAM}=slot-ready%3Apoll-1%3Aslot-2%3A123#slot-slot-2`,
    )
  })

  it('estrae soltanto identificativi validi', () => {
    expect(notificationEventFromSearch('?poll=poll-1&notificationEvent=event-1'))
      .toBe('event-1')
    expect(notificationEventFromSearch('?notificationEvent=%20%20')).toBeNull()
    expect(notificationEventFromSearch(`?notificationEvent=${'x'.repeat(501)}`)).toBeNull()
  })
})
