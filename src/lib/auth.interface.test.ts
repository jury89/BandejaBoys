import { getLocalProfiles, subscribeToSession, updateAccountProfile } from './auth'

vi.mock('./firebase', () => ({ hasRemoteBackend: false, firebaseAuth: null, firestore: null }))

describe('persistenza della preferenza interfaccia in demo', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('bandeja-boys:accounts', JSON.stringify([
      { id: 'jury', displayName: 'Jury', email: 'jury@example.test', createdAt: 1, passwordHash: 'test' },
      { id: 'alex', displayName: 'Alex', email: 'alex@example.test', createdAt: 2, passwordHash: 'test' },
    ]))
    localStorage.setItem('bandeja-boys:session', 'jury')
  })
  afterEach(() => localStorage.clear())

  it('mantiene gli accrediti fidati nel profilo demo quando si salvano le preferenze', async () => {
    const credits = { 'winter-2026-27': { points: 20, reason: 'Ingresso a stagione in corso', grantedAt: 1, grantedBy: 'admin' } }
    const accounts = JSON.parse(localStorage.getItem('bandeja-boys:accounts')!)
    accounts[0].fantasyStartingCredits = credits
    localStorage.setItem('bandeja-boys:accounts', JSON.stringify(accounts))
    const profile = getLocalProfiles()[0]
    expect(profile.fantasyStartingCredits).toEqual(credits)
    await updateAccountProfile(profile, 'Jury', undefined, undefined, undefined, 'nuova')
    expect(getLocalProfiles()[0].fantasyStartingCredits).toEqual(credits)
  })

  it('salva più campi per account, conserva i preferiti con i vecchi client e li può azzerare', async () => {
    const next = await updateAccountProfile(getLocalProfiles()[0], 'Jury', undefined, undefined, undefined, undefined, ['sport-city-mantova', 'tennis-club-mantova'])
    expect(getLocalProfiles()[0].preferredVenueIds).toEqual(['tennis-club-mantova', 'sport-city-mantova'])
    expect(getLocalProfiles()[1].preferredVenueIds).toEqual([])
    await updateAccountProfile(next, 'Jury Demo')
    expect(getLocalProfiles()[0].preferredVenueIds).toEqual(next.preferredVenueIds)
    await updateAccountProfile(next, 'Jury', undefined, undefined, undefined, undefined, [])
    expect(getLocalProfiles()[0].preferredVenueIds).toEqual([])
  })

  it('salva per account, notifica la sessione e mantiene compatibili i vecchi aggiornamenti', async () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToSession(listener)
    try {
      const player = getLocalProfiles()[0]
      expect(player.interfaceMode).toBe('classica')
      const next = await updateAccountProfile(player, 'Jury', undefined, undefined, undefined, 'nuova')
      expect(getLocalProfiles().map(p => p.interfaceMode)).toEqual(['nuova', 'classica'])
      expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ interfaceMode: 'nuova' }))
      await updateAccountProfile(next, 'Jury Demo')
      expect(getLocalProfiles()[0].interfaceMode).toBe('nuova')
      await updateAccountProfile(next, 'Jury', undefined, undefined, undefined, 'classica')
      expect(getLocalProfiles()[0].interfaceMode).toBe('classica')
    } finally { unsubscribe() }
  })
})
