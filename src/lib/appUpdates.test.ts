import { appUpdateUrl, parseAppUpdateAttempt } from './appUpdates'

describe('aggiornamento della web app installata', () => {
  it('non ricarica quando la build pubblicata coincide con quella aperta', () => {
    expect(appUpdateUrl(
      'build-2',
      'build-2',
      'https://bandeja-boys.web.app/?slot=1#campo',
    )).toBeNull()
  })

  it('mantiene destinazione e parametri quando forza una release nuova', () => {
    expect(appUpdateUrl(
      'build-2',
      'build-1',
      'https://bandeja-boys.web.app/?slot=1#campo',
    )).toBe('https://bandeja-boys.web.app/?slot=1&_bbv=build-2#campo')
  })

  it('non entra in un ciclo se Safari ripropone ancora la vecchia pagina', () => {
    expect(appUpdateUrl(
      'build-2',
      'build-1',
      'https://bandeja-boys.web.app/?_bbv=build-2',
      { buildId: 'build-2', attemptedAt: 10_000 },
      20_000,
    )).toBeNull()
  })

  it('ritenta la stessa release se Safari è rimasto bloccato sulla vecchia build', () => {
    expect(appUpdateUrl(
      'build-2',
      'build-1',
      'https://bandeja-boys.web.app/?_bbv=build-2',
      { buildId: 'build-2', attemptedAt: 10_000 },
      40_000,
    )).toBe('https://bandeja-boys.web.app/?_bbv=build-2')
  })

  it('rende subito ritentabili i vecchi tentativi salvati senza timestamp', () => {
    expect(parseAppUpdateAttempt('build-2')).toEqual({
      buildId: 'build-2',
      attemptedAt: 0,
    })
  })
})
