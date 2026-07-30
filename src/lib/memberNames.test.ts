import { resolveMemberName, resolvePlayerMatchNames } from './memberNames'
import type { MemberProfile, PlayerMatch } from '../types'

const members: MemberProfile[] = [{
  id: 'mattia',
  displayName: 'Mattia Baruffaldi',
  email: 'mattia.baruffaldi@example.test',
  createdAt: 1,
}]

describe('nomi dei membri', () => {
  it('preferisce il nome aggiornato del profilo alla copia salvata nell’adesione', () => {
    expect(resolveMemberName(members, 'mattia', 'mattia.baruffaldi')).toBe('Mattia Baruffaldi')
  })

  it('mantiene il nome salvato per i profili non più disponibili', () => {
    expect(resolveMemberName([], 'legacy-user', 'Mario')).toBe('Mario')
  })

  it('non ricava mai un nome dall’email', () => {
    expect(resolveMemberName([], 'missing-user', '')).toBe('Giocatore')
  })

  it('aggiorna con i profili correnti i nomi nello slot e nel referto', () => {
    const match: PlayerMatch = {
      pollId: 'poll-1',
      pollTitle: 'Padel · 27 lug – 2 ago 2026',
      slot: {
        id: 'slot-1',
        startsAt: '2026-07-29T16:00:00.000Z',
        durationMinutes: 90,
        venue: 'Oasi Boschetto',
        bookedAt: 1,
        signups: [
          {
            id: 'signup-mattia',
            userId: 'mattia',
            displayName: 'mattia.baruffaldi',
            joinedAt: 1,
          },
          {
            id: 'signup-guest',
            userId: 'guest-1',
            displayName: 'Ospite',
            joinedAt: 2,
            isGuest: true,
          },
        ],
      },
      report: {
        id: 'poll-1__slot-1',
        pollId: 'poll-1',
        pollTitle: 'Padel · 27 lug – 2 ago 2026',
        slotId: 'slot-1',
        sessionStartsAt: '2026-07-29T16:00:00.000Z',
        participantIds: ['mattia', 'guest-1', 'c', 'd'],
        participants: [
          { userId: 'mattia', displayName: 'mattia.baruffaldi' },
          { userId: 'guest-1', displayName: 'Ospite' },
          { userId: 'c', displayName: 'Cesco' },
          { userId: 'd', displayName: 'Dade' },
        ],
        sets: [{
          id: 'set-1',
          teamA: [
            { userId: 'mattia', displayName: 'mattia.baruffaldi' },
            { userId: 'guest-1', displayName: 'Ospite' },
          ],
          teamB: [
            { userId: 'c', displayName: 'Cesco' },
            { userId: 'd', displayName: 'Dade' },
          ],
          scoreA: 6,
          scoreB: 4,
        }],
        createdBy: 'mattia',
        createdByName: 'mattia.baruffaldi',
        createdAt: 1,
        updatedBy: 'mattia',
        updatedByName: 'mattia.baruffaldi',
        updatedAt: 1,
      },
    }

    const resolved = resolvePlayerMatchNames(members, match)

    expect(resolved.slot.signups.map((signup) => signup.displayName))
      .toEqual(['Mattia Baruffaldi', 'Ospite'])
    expect(resolved.report?.participants[0].displayName).toBe('Mattia Baruffaldi')
    expect(resolved.report?.sets[0].teamA.map((player) => player.displayName))
      .toEqual(['Mattia Baruffaldi', 'Ospite'])
  })
})
