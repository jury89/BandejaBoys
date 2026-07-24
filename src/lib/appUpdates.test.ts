import { appUpdateUrl } from './appUpdates'

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
      'build-2',
    )).toBeNull()
  })
})
