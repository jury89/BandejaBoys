import type { PadelPoll, PadelSlot, Signup } from '../types'
import { collectScheduledNotifications, createTestNotification } from './notificationSchedule'

const NOW = Date.parse('2026-07-20T18:00:00.000Z')

const signup = (userId: string, joinedAt: number): Signup => ({
  id: `signup-${userId}`,
  userId,
  displayName: userId.toUpperCase(),
  joinedAt,
})

const slot = (startsAt: string, signups: Signup[], booked = true): PadelSlot => ({
  id: 'slot-1',
  startsAt,
  durationMinutes: 90,
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

  it('avvisa tutti tranne il creatore quando nasce un sondaggio', () => {
    const notifications = collectScheduledNotifications([poll([], NOW - 60 * 60 * 1000)], NOW)

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      kind: 'new-poll',
      recipientUserIds: null,
      excludedUserIds: ['jury'],
      title: 'Sveglia fagianotto!',
      body: 'È uscito un nuovo sondaggio: “Padel · prossima settimana”, pubblicato da Jury. Segna quando ci sei.',
    })
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
})
