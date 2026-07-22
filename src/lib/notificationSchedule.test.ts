import type { PadelPoll, PadelSlot, Signup } from '../types'
import {
  BOOKING_REMINDER_LEAD_MS,
  BOOKING_REMINDER_WINDOW_MS,
  MATCH_RATING_NOTIFICATION_WINDOW_MS,
  NEW_SLOT_QUIET_PERIOD_MS,
  SLOT_READY_NOTIFICATION_WINDOW_MS,
  collectScheduledNotifications,
  createNotificationDelivery,
  createTestNotification,
} from './notificationSchedule'

const NOW = Date.parse('2026-07-20T18:00:00.000Z')

const signup = (userId: string, joinedAt: number): Signup => ({
  id: `signup-${userId}`,
  userId,
  displayName: userId.toUpperCase(),
  joinedAt,
})

const slot = (
  startsAt: string,
  signups: Signup[],
  booked = true,
  creation?: { at: number; by: string },
): PadelSlot => ({
  id: 'slot-1',
  startsAt,
  durationMinutes: 90,
  createdAt: creation?.at,
  createdBy: creation?.by,
  createdByName: creation?.by.toUpperCase(),
  venue: booked ? 'Oasi Boschetto' : '',
  bookedAt: booked ? NOW - 1000 : undefined,
  bookedBy: booked ? 'jury' : undefined,
  bookedByName: booked ? 'Jury' : undefined,
  signups,
})

const poll = (
  slots: PadelSlot[],
  createdAt = NOW - 3 * 24 * 60 * 60 * 1000,
  status: PadelPoll['status'] = 'open',
): PadelPoll => ({
  id: 'poll-1',
  title: 'Padel · prossima settimana',
  targetWeekStart: '2026-07-27',
  createdBy: 'jury',
  createdByName: 'Jury',
  createdAt,
  updatedAt: createdAt,
  status,
  slots,
})

describe('ricevuta di consegna', () => {
  it('conserva titolo e testo esatti della notifica inviata', () => {
    const notification = createTestNotification('jury', 'manuale-1', 'Sveglia fagianotto!')

    expect(createNotificationDelivery(notification, 'jury', 'subscription-1')).toEqual({
      eventId: 'test:manuale-1',
      kind: 'test',
      title: 'Bandeja Boys',
      body: 'Sveglia fagianotto!',
      userId: 'jury',
      subscriptionId: 'subscription-1',
    })
  })
})

describe('pianificazione notifiche', () => {
  it('crea una notifica di test destinata a un solo utente', () => {
    expect(createTestNotification(' jury ', 'run-42')).toMatchObject({
      id: 'test:run-42',
      kind: 'test',
      recipientUserIds: ['jury'],
      excludedUserIds: [],
      title: 'Test notifiche Bandeja Boys',
    })
  })

  it('accetta un messaggio manuale personalizzato e ne limita la lunghezza', () => {
    expect(createTestNotification('michele', 'run-43', '  Sveglia fagianotto  ')).toMatchObject({
      recipientUserIds: ['michele'],
      title: 'Bandeja Boys',
      body: 'Sveglia fagianotto',
    })
    expect(() => createTestNotification('michele', 'run-44', 'x'.repeat(241)))
      .toThrow('Il messaggio di test supera i 240 caratteri.')
  })

  it('crea una vera push di collaudo che apre la pagella senza dati partita', () => {
    expect(createTestNotification('jury', 'run-45', undefined, 'match-rating')).toMatchObject({
      id: 'test:run-45',
      kind: 'test',
      title: 'TEST · È ora di dare i voti',
      body: 'Tocca per aprire la pagella di collaudo. Nessun voto verrà salvato.',
      url: '/?ratingTest=1',
      tag: 'test-rating-run-45',
      recipientUserIds: ['jury'],
    })
  })

  it('mantiene il deep link pagelle anche con un messaggio di test personalizzato', () => {
    expect(createTestNotification('jury', 'run-46', 'Apri il test', 'match-rating')).toMatchObject({
      title: 'TEST · È ora di dare i voti',
      body: 'Apri il test',
      url: '/?ratingTest=1',
    })
  })

  it('raggruppa cinque slot creati insieme in una sola notifica', () => {
    const createdAt = NOW - 15 * 60 * 1000
    const slots = Array.from({ length: 5 }, (_, index) => ({
      ...slot(
        new Date(NOW + (index + 1) * 24 * 60 * 60 * 1000).toISOString(),
        [],
        false,
        { at: createdAt, by: 'jury' },
      ),
      id: `slot-${index + 1}`,
    }))
    const notifications = collectScheduledNotifications([poll(slots, createdAt)], NOW)

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      id: 'new-slots:poll-1:slot-1',
      kind: 'new-slots',
      recipientUserIds: null,
      excludedUserIds: ['jury'],
      title: 'Sveglia fagianotto!',
      body: 'Ci sono 5 nuovi slot disponibili per “Padel · prossima settimana”. Segna quando ci sei.',
    })
  })

  it('attende dieci minuti di quiete e raggruppa aggiunte ravvicinate', () => {
    const future = new Date(NOW + 7 * 24 * 60 * 60 * 1000).toISOString()
    const first = slot(future, [], false, { at: NOW - 18 * 60 * 1000, by: 'jury' })
    const second = {
      ...slot(future, [], false, { at: NOW - 9 * 60 * 1000, by: 'ale' }),
      id: 'slot-2',
      startsAt: new Date(NOW + 8 * 24 * 60 * 60 * 1000).toISOString(),
    }

    expect(collectScheduledNotifications([poll([first, second])], NOW)).toHaveLength(0)

    const notifications = collectScheduledNotifications(
      [poll([first, second])],
      NOW + 2 * 60 * 1000,
    )
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      id: 'new-slots:poll-1:slot-1',
      excludedUserIds: ['jury', 'ale'],
    })
  })

  it('crea una nuova notifica per uno slot aggiunto dopo la finestra di raggruppamento', () => {
    const first = slot(
      new Date(NOW + 7 * 24 * 60 * 60 * 1000).toISOString(),
      [],
      false,
      { at: NOW - 40 * 60 * 1000, by: 'jury' },
    )
    const second = {
      ...slot(
        new Date(NOW + 8 * 24 * 60 * 60 * 1000).toISOString(),
        [],
        false,
        { at: NOW - 15 * 60 * 1000, by: 'ale' },
      ),
      id: 'slot-2',
    }
    const notifications = collectScheduledNotifications([poll([first, second])], NOW)

    expect(notifications).toHaveLength(2)
    expect(notifications.map((item) => item.id)).toEqual([
      'new-slots:poll-1:slot-1',
      'new-slots:poll-1:slot-2',
    ])
    expect(notifications[1].body).toContain('C’è un nuovo slot disponibile')
  })

  it('non notifica gli slot storici privi dei metadati di creazione', () => {
    const future = new Date(NOW + 7 * 24 * 60 * 60 * 1000).toISOString()
    const legacySlot = slot(future, [], false)

    expect(collectScheduledNotifications([poll([legacySlot])], NOW)).toHaveLength(0)
  })

  it('avvisa i quattro titolari quando lo slot diventa completo e il campo è da prenotare', () => {
    const future = new Date(NOW + 8 * 24 * 60 * 60 * 1000).toISOString()
    const players = [
      signup('d', NOW - 60 * 1000),
      signup('b', NOW - 3 * 60 * 1000),
      signup('a', NOW - 4 * 60 * 1000),
      signup('c', NOW - 2 * 60 * 1000),
      { ...signup('reserve', NOW - 5 * 60 * 1000), role: 'reserve' as const },
    ]
    const notifications = collectScheduledNotifications([
      poll([slot(future, players, false)]),
    ], NOW)

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      id: `slot-ready:poll-1:slot-1:${NOW - 60 * 1000}`,
      kind: 'slot-ready',
      title: 'Slot completo!',
      recipientUserIds: ['a', 'b', 'c', 'd'],
      excludedUserIds: [],
      url: '/?poll=poll-1',
    })
    expect(notifications[0].body).toContain('Il campo è ancora da prenotare')
  })

  it('non avvisa se il campo è già prenotato o manca il quarto titolare', () => {
    const future = new Date(NOW + 8 * 24 * 60 * 60 * 1000).toISOString()
    const players = ['a', 'b', 'c', 'd'].map((id, index) => signup(
      id,
      NOW - (4 - index) * 60 * 1000,
    ))
    const incomplete = [
      ...players.slice(0, 3),
      { ...signup('reserve', NOW - 30 * 1000), role: 'reserve' as const },
    ]

    expect(collectScheduledNotifications([poll([slot(future, players)])], NOW)).toHaveLength(0)
    expect(collectScheduledNotifications([
      poll([slot(future, incomplete, false)]),
    ], NOW)).toHaveLength(0)
  })

  it('non invia notifiche retroattive oltre la finestra e cambia identità alla nuova formazione', () => {
    const future = new Date(NOW + 8 * 24 * 60 * 60 * 1000).toISOString()
    const oldPlayers = ['a', 'b', 'c', 'd'].map((id, index) => signup(
      id,
      NOW - SLOT_READY_NOTIFICATION_WINDOW_MS - (4 - index) * 60 * 1000,
    ))
    expect(collectScheduledNotifications([
      poll([slot(future, oldPlayers, false)]),
    ], NOW)).toHaveLength(0)

    const recentPlayers = [
      ...oldPlayers.slice(0, 3),
      signup('e', NOW - 60 * 1000),
    ]
    const first = collectScheduledNotifications([poll([slot(future, recentPlayers, false)])], NOW)
    const second = collectScheduledNotifications([poll([slot(future, recentPlayers, false)])], NOW)

    expect(first[0].id).toBe(`slot-ready:poll-1:slot-1:${NOW - 60 * 1000}`)
    expect(second[0].id).toBe(first[0].id)
  })

  it('a sette giorni ricorda ai quattro titolari di prenotare il campo', () => {
    const startsAt = new Date(NOW + BOOKING_REMINDER_LEAD_MS).toISOString()
    const players = [
      signup('d', NOW - SLOT_READY_NOTIFICATION_WINDOW_MS - 60 * 1000),
      signup('b', NOW - SLOT_READY_NOTIFICATION_WINDOW_MS - 3 * 60 * 1000),
      signup('a', NOW - SLOT_READY_NOTIFICATION_WINDOW_MS - 4 * 60 * 1000),
      signup('c', NOW - SLOT_READY_NOTIFICATION_WINDOW_MS - 2 * 60 * 1000),
      { ...signup('reserve', NOW - 30 * 60 * 1000), role: 'reserve' as const },
    ]
    const notifications = collectScheduledNotifications([
      poll([slot(startsAt, players, false)]),
    ], NOW)

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      id: `booking-reminder-7d:poll-1:slot-1:${startsAt}`,
      kind: 'booking-reminder-7d',
      title: 'Manca solo una settimana!',
      body: expect.stringContaining('Ricordatevi di prenotare il campo'),
      recipientUserIds: ['a', 'b', 'c', 'd'],
      excludedUserIds: [],
      url: '/?poll=poll-1',
    })
  })

  it('non ricorda la prenotazione se il campo è prenotato o la formazione è tardiva o incompleta', () => {
    const startsAt = new Date(NOW + BOOKING_REMINDER_LEAD_MS).toISOString()
    const earlyPlayers = ['a', 'b', 'c', 'd'].map((id, index) => signup(
      id,
      NOW - SLOT_READY_NOTIFICATION_WINDOW_MS - (4 - index) * 60 * 1000,
    ))
    const latePlayers = [
      ...earlyPlayers.slice(0, 3),
      signup('e', NOW),
    ]

    const notifications = collectScheduledNotifications([
      poll([
        slot(startsAt, earlyPlayers),
        { ...slot(startsAt, latePlayers, false), id: 'slot-2' },
        { ...slot(startsAt, earlyPlayers.slice(0, 3), false), id: 'slot-3' },
      ]),
    ], NOW)

    expect(notifications.filter((item) => item.kind === 'booking-reminder-7d')).toHaveLength(0)
  })

  it('emette il reminder soltanto nella finestra dopo la soglia dei sette giorni', () => {
    const startsAt = new Date(NOW + BOOKING_REMINDER_LEAD_MS).toISOString()
    const players = ['a', 'b', 'c', 'd'].map((id, index) => signup(
      id,
      NOW - SLOT_READY_NOTIFICATION_WINDOW_MS - (4 - index) * 60 * 1000,
    ))
    const game = poll([slot(startsAt, players, false)])

    expect(collectScheduledNotifications([game], NOW - 1)
      .filter((item) => item.kind === 'booking-reminder-7d')).toHaveLength(0)
    expect(collectScheduledNotifications([game], NOW + BOOKING_REMINDER_WINDOW_MS)
      .filter((item) => item.kind === 'booking-reminder-7d')).toHaveLength(0)
  })

  it('crea una nuova identità del reminder prenotazione quando lo slot viene spostato', () => {
    const firstStartsAt = new Date(NOW + BOOKING_REMINDER_LEAD_MS).toISOString()
    const movedStartsAt = new Date(NOW + BOOKING_REMINDER_LEAD_MS + 24 * 60 * 60 * 1000).toISOString()
    const players = ['a', 'b', 'c', 'd'].map((id, index) => signup(
      id,
      NOW - SLOT_READY_NOTIFICATION_WINDOW_MS - (4 - index) * 60 * 1000,
    ))
    const first = collectScheduledNotifications([
      poll([slot(firstStartsAt, players, false)]),
    ], NOW).find((item) => item.kind === 'booking-reminder-7d')
    const moved = collectScheduledNotifications([
      poll([slot(movedStartsAt, players, false)]),
    ], NOW + 24 * 60 * 60 * 1000).find((item) => item.kind === 'booking-reminder-7d')

    expect(first?.id).toBe(`booking-reminder-7d:poll-1:slot-1:${firstStartsAt}`)
    expect(moved?.id).toBe(`booking-reminder-7d:poll-1:slot-1:${movedStartsAt}`)
    expect(moved?.id).not.toBe(first?.id)
  })

  it('manda il reminder 24h soltanto ai primi quattro del campo prenotato', () => {
    const startsAt = new Date(NOW + 23 * 60 * 60 * 1000).toISOString()
    const signups = [
      signup('e', 5),
      signup('a', 1),
      signup('d', 4),
      signup('b', 2),
      signup('c', 3),
    ]
    const notifications = collectScheduledNotifications([poll([slot(startsAt, signups)])], NOW)

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      kind: 'reminder-24h',
      recipientUserIds: ['a', 'b', 'c', 'd'],
      title: 'Sveglia fagianotto!',
    })
    expect(notifications[0].body).toContain('Guarda che domani giochi')
    expect(notifications[0].body).toContain('Oasi Boschetto')
  })

  it('passa al reminder 2h e ignora slot non prenotati o già iniziati', () => {
    const players = ['a', 'b', 'c', 'd'].map((id, index) => signup(id, index))
    const inNinetyMinutes = new Date(NOW + 90 * 60 * 1000).toISOString()
    const yesterday = new Date(NOW - 24 * 60 * 60 * 1000).toISOString()
    const notifications = collectScheduledNotifications([
      poll([
        slot(inNinetyMinutes, players),
        { ...slot(inNinetyMinutes, players, false), id: 'slot-2' },
        { ...slot(yesterday, players), id: 'slot-3' },
      ]),
    ], NOW)

    expect(notifications).toHaveLength(1)
    expect(notifications[0].kind).toBe('reminder-2h')
    expect(notifications[0].title).toBe('Sveglia fagianotto!')
    expect(notifications[0].body).toContain('Guarda che tra 2 ore giochi')
  })

  it('dieci minuti dopo la fine invita tutti e quattro i titolari a dare i voti', () => {
    const players = ['a', 'b', 'c', 'd'].map((id, index) => signup(id, index))
    const finishedSlot = slot('2026-07-20T18:20', players)
    const notifications = collectScheduledNotifications([poll([finishedSlot])], NOW)

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      kind: 'match-rating',
      title: 'È ora di dare i voti',
      recipientUserIds: ['a', 'b', 'c', 'd'],
      url: '/?ratePoll=poll-1&rateSlot=slot-1',
    })
  })

  it('non invia la richiesta voti prima della scadenza, a formazione incompleta o troppo tardi', () => {
    const players = ['a', 'b', 'c', 'd'].map((id, index) => signup(id, index))
    const finishedSlot = slot('2026-07-20T18:20', players)

    expect(collectScheduledNotifications([poll([finishedSlot])], NOW - 1)).toHaveLength(0)
    expect(collectScheduledNotifications([
      poll([{ ...finishedSlot, signups: players.slice(0, 3) }]),
    ], NOW)).toHaveLength(0)
    expect(collectScheduledNotifications(
      [poll([finishedSlot])],
      NOW + MATCH_RATING_NOTIFICATION_WINDOW_MS,
    )).toHaveLength(0)
  })

  it('esclude dalla notifica chi ha già salvato o chiuso la propria pagella', () => {
    const players = ['a', 'b', 'c', 'd'].map((id, index) => signup(id, index))
    const finishedSlot = slot('2026-07-20T18:20', players)
    const notifications = collectScheduledNotifications([poll([finishedSlot])], NOW, [{
      id: 'poll-1__slot-1__a',
      pollId: 'poll-1',
      slotId: 'slot-1',
      reviewerId: 'a',
      status: 'dismissed',
      closedAt: NOW,
    }])

    expect(notifications[0].recipientUserIds).toEqual(['b', 'c', 'd'])
  })

  it('crea una nuova identità del reminder quando lo slot viene spostato', () => {
    const players = ['a', 'b', 'c', 'd'].map((id, index) => signup(id, index))
    const first = new Date(NOW + 20 * 60 * 60 * 1000).toISOString()
    const moved = new Date(NOW + 21 * 60 * 60 * 1000).toISOString()

    const firstId = collectScheduledNotifications([poll([slot(first, players)])], NOW)[0].id
    const movedId = collectScheduledNotifications([poll([slot(moved, players)])], NOW)[0].id

    expect(movedId).not.toBe(firstId)
  })

  it('mantiene i reminder per le partite prenotate anche dopo l’archiviazione', () => {
    const players = ['a', 'b', 'c', 'd'].map((id, index) => signup(id, index))
    const startsAt = new Date(NOW + 20 * 60 * 60 * 1000).toISOString()
    const notifications = collectScheduledNotifications([
      poll([slot(startsAt, players)], NOW - 60 * 60 * 1000, 'closed'),
    ], NOW)

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      kind: 'reminder-24h',
      recipientUserIds: ['a', 'b', 'c', 'd'],
    })
  })

  it('non annuncia nuovi slot di un sondaggio archiviato', () => {
    const createdAt = NOW - NEW_SLOT_QUIET_PERIOD_MS - 1
    const future = new Date(NOW + 7 * 24 * 60 * 60 * 1000).toISOString()
    const notifications = collectScheduledNotifications([
      poll([slot(future, [], false, { at: createdAt, by: 'jury' })], createdAt, 'closed'),
    ], NOW)

    expect(notifications).toHaveLength(0)
  })
})
