import {
  DEFAULT_VENUE,
  addSlotToPoll,
  addSignup,
  getReserves,
  getSlotPhase,
  getStarters,
  makePoll,
  nextMondayDate,
  removeSignup,
  removeSlotFromPoll,
  rescheduleSlot,
  setSlotBooking,
  substituteStarter,
} from './domain'
import type { MemberProfile, PadelPoll, PadelSlot, SessionUser, Signup, SignupRole } from '../types'

const member = (id: string, displayName = id): MemberProfile => ({
  id,
  displayName,
  email: `${id}@example.test`,
  createdAt: 1,
})

const signup = (id: string, joinedAt: number, role?: SignupRole): Signup => ({
  id: `signup-${id}`,
  userId: id,
  displayName: id.toUpperCase(),
  joinedAt,
  role,
})

const slot = (signups: Signup[] = []): PadelSlot => ({
  id: 'slot-1',
  startsAt: '2026-07-28T19:30:00.000Z',
  durationMinutes: 90,
  venue: '',
  signups,
})

describe('ordine adesioni', () => {
  it('mantiene la precedenza cronologica anche se gli input arrivano disordinati', () => {
    const current = slot([signup('b', 20), signup('a', 10), signup('c', 30)])
    expect(getStarters(current).map((item) => item.userId)).toEqual(['a', 'b', 'c'])
  })

  it('mette la quinta adesione in prima posizione tra le riserve', () => {
    let current = slot()
    ;['a', 'b', 'c', 'd', 'e'].forEach((id, index) => {
      current = addSignup(current, member(id), index + 1)
    })
    expect(getStarters(current).map((item) => item.userId)).toEqual(['a', 'b', 'c', 'd'])
    expect(getReserves(current).map((item) => item.userId)).toEqual(['e'])
  })

  it('promuove automaticamente la prima riserva quando un titolare si ritira', () => {
    const current = slot(['a', 'b', 'c', 'd', 'e'].map((id, index) => signup(id, index)))
    const updated = removeSignup(current, 'b')
    expect(getStarters(updated).map((item) => item.userId)).toEqual(['a', 'c', 'd', 'e'])
    expect(getReserves(updated)).toHaveLength(0)
  })

  it('ignora una doppia adesione dello stesso giocatore', () => {
    const current = slot([signup('a', 1)])
    expect(addSignup(current, member('a'), 2)).toBe(current)
  })

  it('permette di scegliere la riserva anche quando ci sono posti da titolare', () => {
    const current = addSignup(slot(), member('a'), 1, 'reserve')

    expect(getStarters(current)).toHaveLength(0)
    expect(getReserves(current).map((item) => item.userId)).toEqual(['a'])
    expect(getSlotPhase(current)).toBe('collecting')
  })

  it('assegna un posto da titolare dopo una riserva volontaria senza cambiarne il ruolo', () => {
    let current = addSignup(slot(), member('a'), 1, 'reserve')
    current = addSignup(current, member('b'), 2, 'starter')

    expect(getStarters(current).map((item) => item.userId)).toEqual(['b'])
    expect(getReserves(current).map((item) => item.userId)).toEqual(['a'])
  })

  it('mantiene in riserva una scelta volontaria finché la formazione non era completa', () => {
    const current = slot([signup('a', 1, 'starter'), signup('b', 2, 'reserve')])
    const updated = removeSignup(current, 'a')

    expect(getStarters(updated)).toHaveLength(0)
    expect(getReserves(updated).map((item) => item.userId)).toEqual(['b'])
  })

  it('promuove la prima riserva esplicita se si ritira un titolare dalla formazione completa', () => {
    const current = slot([
      signup('a', 1, 'starter'),
      signup('b', 2, 'starter'),
      signup('c', 3, 'starter'),
      signup('d', 4, 'starter'),
      signup('e', 5, 'reserve'),
    ])
    const updated = removeSignup(current, 'b')

    expect(getStarters(updated).map((item) => item.userId)).toEqual(['a', 'c', 'd', 'e'])
    expect(getReserves(updated)).toHaveLength(0)
  })

  it('rifiuta una quinta adesione richiesta esplicitamente da titolare', () => {
    const current = slot(['a', 'b', 'c', 'd'].map((id, index) => signup(id, index, 'starter')))

    expect(() => addSignup(current, member('e'), 5, 'starter')).toThrow('quattro posti da titolare')
  })
})

describe('sostituzioni', () => {
  it('sostituisce un titolare con una riserva preservando il posto e rimuovendo il doppione', () => {
    const current = slot(['a', 'b', 'c', 'd', 'e'].map((id, index) => signup(id, index)))
    const updated = substituteStarter(current, 'b', member('e', 'Elena'), 99)
    expect(getStarters(updated).map((item) => item.userId)).toEqual(['a', 'e', 'c', 'd'])
    expect(updated.signups).toHaveLength(4)
    expect(updated.signups[1].substitutedFor).toEqual({ userId: 'b', displayName: 'B', at: 99 })
  })

  it('sostituisce un titolare con un membro non ancora segnato senza cambiare il totale', () => {
    const current = slot(['a', 'b', 'c', 'd', 'e'].map((id, index) => signup(id, index)))
    const updated = substituteStarter(current, 'a', member('f', 'Franca'), 99)
    expect(getStarters(updated)[0].userId).toBe('f')
    expect(updated.signups).toHaveLength(5)
    expect(getReserves(updated)[0].userId).toBe('e')
  })

  it('impedisce di scegliere un altro titolare come sostituto', () => {
    const current = slot(['a', 'b', 'c', 'd'].map((id, index) => signup(id, index)))
    expect(() => substituteStarter(current, 'a', member('b'))).toThrow('già tra i titolari')
  })
})

describe('stato slot e creazione sondaggio', () => {
  it('passa da raccolta a prenotabile a prenotato', () => {
    expect(getSlotPhase(slot([signup('a', 1)]))).toBe('collecting')
    const ready = slot(['a', 'b', 'c', 'd'].map((id, index) => signup(id, index)))
    expect(getSlotPhase(ready)).toBe('ready')
    expect(getSlotPhase({ ...ready, bookedAt: 12 })).toBe('booked')
  })

  it('registra sempre la prenotazione all’Oasi Boschetto senza richiedere quattro giocatori', () => {
    const current = slot([signup('a', 1)])
    const booked = setSlotBooking(current, member('jury', 'Jury'), 12)

    expect(booked.signups).toEqual(current.signups)
    expect(booked).toMatchObject({
      venue: DEFAULT_VENUE,
      bookedAt: 12,
      bookedBy: 'jury',
      bookedByName: 'Jury',
    })
    expect(getSlotPhase(booked)).toBe('booked')
  })

  it('ordina gli slot e rifiuta due proposte identiche', () => {
    const creator: SessionUser = member('jury', 'Jury')
    const poll = makePoll(
      {
        title: '  Prossima settimana  ',
        targetWeekStart: '2026-07-27',
        slots: [
          { startsAt: '2026-07-30T20:00', durationMinutes: 90 },
          { startsAt: '2026-07-28T19:30', durationMinutes: 90 },
        ],
      },
      creator,
      100,
    )
    expect(poll.title).toBe('Prossima settimana')
    expect(poll.slots[0].startsAt < poll.slots[1].startsAt).toBe(true)
    expect(poll.slots[0]).toMatchObject({
      createdAt: 100,
      createdBy: 'jury',
      createdByName: 'Jury',
    })

    expect(() => makePoll(
      {
        title: 'Duplicato',
        targetWeekStart: '2026-07-27',
        slots: [
          { startsAt: '2026-07-28T19:30', durationMinutes: 90 },
          { startsAt: '2026-07-28T19:30', durationMinutes: 60 },
        ],
      },
      creator,
    )).toThrow('due slot uguali')
  })

  it('accetta soltanto orari alla mezz’ora o all’ora esatta', () => {
    const creator: SessionUser = member('jury', 'Jury')

    expect(() => makePoll(
      {
        title: 'Orario non valido',
        targetWeekStart: '2026-07-27',
        slots: [{ startsAt: '2026-07-28T19:15', durationMinutes: 90 }],
      },
      creator,
    )).toThrow('minuti 00 oppure 30')
  })

  it('calcola sempre il lunedì della settimana successiva', () => {
    expect(nextMondayDate(new Date('2026-07-20T12:00:00'))).toBe('2026-07-27')
    expect(nextMondayDate(new Date('2026-07-22T12:00:00'))).toBe('2026-07-27')
  })

  it('sposta uno slot conservando adesioni e prenotazione e riordina il sondaggio', () => {
    const booked = {
      ...slot([signup('a', 1)]),
      venue: 'Bandeja Club',
      bookedAt: 10,
      bookedBy: 'jury',
      bookedByName: 'Jury',
    }
    const later = { ...slot(), id: 'slot-2', startsAt: '2026-07-30T19:30:00.000Z' }
    const current: PadelPoll = {
      id: 'poll-1',
      title: 'Test',
      targetWeekStart: '2026-07-27',
      createdBy: 'jury',
      createdByName: 'Jury',
      createdAt: 1,
      updatedAt: 1,
      status: 'open',
      slots: [booked, later],
    }

    const updated = rescheduleSlot(current, booked.id, '2026-07-31T20:00', 99)

    expect(updated.updatedAt).toBe(99)
    expect(updated.slots.map((item) => item.id)).toEqual(['slot-2', 'slot-1'])
    expect(updated.slots[1]).toMatchObject({
      startsAt: new Date('2026-07-31T20:00').toISOString(),
      venue: 'Bandeja Club',
      bookedAt: 10,
      signups: booked.signups,
    })
    expect(() => rescheduleSlot(current, booked.id, later.startsAt)).toThrow('Esiste già uno slot')
  })

  it('elimina uno slot preservando gli altri e impedisce di lasciare un sondaggio vuoto', () => {
    const first = slot([signup('a', 1)])
    const second = { ...slot(), id: 'slot-2', startsAt: '2026-07-30T19:30:00.000Z' }
    const current: PadelPoll = {
      id: 'poll-1',
      title: 'Test',
      targetWeekStart: '2026-07-27',
      createdBy: 'jury',
      createdByName: 'Jury',
      createdAt: 1,
      updatedAt: 1,
      status: 'open',
      slots: [first, second],
    }

    const updated = removeSlotFromPoll(current, first.id, 99)

    expect(updated.updatedAt).toBe(99)
    expect(updated.slots).toEqual([second])
    expect(current.slots).toHaveLength(2)
    expect(() => removeSlotFromPoll(updated, second.id)).toThrow('almeno uno slot')
    expect(() => removeSlotFromPoll(current, 'slot-assente')).toThrow('Slot non trovato')
  })

  it('aggiunge uno slot a un sondaggio aperto con autore e istante di creazione', () => {
    const current: PadelPoll = {
      id: 'poll-1',
      title: 'Test',
      targetWeekStart: '2026-07-27',
      createdBy: 'jury',
      createdByName: 'Jury',
      createdAt: 1,
      updatedAt: 1,
      status: 'open',
      slots: [slot()],
    }

    const updated = addSlotToPoll(
      current,
      { startsAt: '2026-07-27T18:30', durationMinutes: 90 },
      member('ale', 'Ale'),
      99,
    )

    expect(updated.updatedAt).toBe(99)
    expect(updated.slots).toHaveLength(2)
    expect(updated.slots[0]).toMatchObject({
      startsAt: new Date('2026-07-27T18:30').toISOString(),
      createdAt: 99,
      createdBy: 'ale',
      createdByName: 'Ale',
      signups: [],
    })
  })

  it('non aggiunge duplicati o nuovi slot a un sondaggio chiuso', () => {
    const current: PadelPoll = {
      id: 'poll-1',
      title: 'Test',
      targetWeekStart: '2026-07-27',
      createdBy: 'jury',
      createdByName: 'Jury',
      createdAt: 1,
      updatedAt: 1,
      status: 'open',
      slots: [slot()],
    }

    expect(() => addSlotToPoll(
      current,
      { startsAt: current.slots[0].startsAt, durationMinutes: 90 },
      member('ale'),
    )).toThrow('Esiste già uno slot')
    expect(() => addSlotToPoll(
      { ...current, status: 'closed' },
      { startsAt: '2026-07-30T18:30', durationMinutes: 90 },
      member('ale'),
    )).toThrow('Riapri il sondaggio')
  })
})
