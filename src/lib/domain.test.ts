import {
  addSignup,
  getReserves,
  getSlotPhase,
  getStarters,
  makePoll,
  nextMondayDate,
  removeSignup,
  substituteStarter,
} from './domain'
import type { MemberProfile, PadelSlot, SessionUser, Signup } from '../types'

const member = (id: string, displayName = id): MemberProfile => ({
  id,
  displayName,
  email: `${id}@example.test`,
  createdAt: 1,
})

const signup = (id: string, joinedAt: number): Signup => ({
  id: `signup-${id}`,
  userId: id,
  displayName: id.toUpperCase(),
  joinedAt,
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

  it('calcola sempre il lunedì della settimana successiva', () => {
    expect(nextMondayDate(new Date('2026-07-20T12:00:00'))).toBe('2026-07-27')
    expect(nextMondayDate(new Date('2026-07-22T12:00:00'))).toBe('2026-07-27')
  })
})

