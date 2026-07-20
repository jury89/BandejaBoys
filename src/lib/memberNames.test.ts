import { resolveMemberName } from './memberNames'
import type { MemberProfile } from '../types'

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
})
