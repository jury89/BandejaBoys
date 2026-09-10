import { interfaceOverride, normalizeInterfaceMode, resolveInterfaceMode, withoutInterfaceOverride } from './interfaceMode'

describe('scelta interfaccia', () => {
  it('mantiene la classica per profili precedenti o valori non validi', () => {
    for (const value of [undefined, null, '', 'classic', 'NEW', 1, {}]) {
      expect(normalizeInterfaceMode(value)).toBe('classica')
      expect(resolveInterfaceMode('', value)).toBe('classica')
    }
    expect(resolveInterfaceMode('', 'nuova')).toBe('nuova')
  })

  it('applica solo override riconosciuti prima della preferenza del profilo', () => {
    expect(resolveInterfaceMode('?ux=classica', 'nuova')).toBe('classica')
    expect(resolveInterfaceMode('?ux=nuova', 'classica')).toBe('nuova')
    expect(resolveInterfaceMode('?ux=invalid', 'nuova')).toBe('nuova')
    expect(interfaceOverride('?ux=')).toBeNull()
    expect(interfaceOverride('?UX=nuova')).toBeNull()
  })

  it('rimuove soltanto gli override senza perdere deep link e altri parametri', () => {
    expect(withoutInterfaceOverride('https://example.test/?_swv=abc&ux=nuova&report=123&ux=classica#statistiche/jury'))
      .toBe('/?_swv=abc&report=123#statistiche/jury')
    expect(withoutInterfaceOverride('https://example.test/app?ux=nuova')).toBe('/app')
  })
})
