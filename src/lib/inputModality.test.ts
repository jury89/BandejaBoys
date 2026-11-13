import { watchInputModality } from './inputModality'

describe('focus delle form in base all’interazione', () => {
  let stop: () => void
  const modality = () => document.documentElement.getAttribute('data-input-modality')
  const pointer = (pointerType: string) => {
    const event = new Event('pointerdown', { bubbles: true })
    Object.defineProperty(event, 'pointerType', { value: pointerType })
    document.dispatchEvent(event)
  }

  beforeEach(() => {
    document.documentElement.removeAttribute('data-input-modality')
    stop = watchInputModality()
  })

  afterEach(() => stop())

  it.each(['touch', 'pen'])('riconosce il contatto diretto %s su qualsiasi campo', (type) => {
    pointer(type)
    expect(modality()).toBe('touch')
  })

  it('riconosce touchstart anche senza Pointer Events', () => {
    document.dispatchEvent(new Event('touchstart', { bubbles: true }))
    expect(modality()).toBe('touch')
  })

  it('mantiene la modalità touch durante la digitazione sulla tastiera virtuale', () => {
    pointer('touch')
    for (const key of ['a', 'Backspace', 'Enter']) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    }
    expect(modality()).toBe('touch')
  })

  it.each([false, true])('ripristina il focus da tastiera con Tab, shift=%s', (shiftKey) => {
    pointer('touch')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true }))
    expect(modality()).toBe('keyboard')
    pointer('touch')
    expect(modality()).toBe('touch')
  })

  it('ripristina il comportamento desktop quando si torna al mouse', () => {
    pointer('touch')
    pointer('mouse')
    expect(modality()).toBe('pointer')
  })

  it('rimuove gli ascoltatori e ripristina l’attributo iniziale alla chiusura', () => {
    pointer('touch')
    stop()
    expect(modality()).toBeNull()
    pointer('mouse')
    expect(modality()).toBeNull()
    document.documentElement.setAttribute('data-input-modality', 'keyboard')
    stop = watchInputModality()
    pointer('touch')
    stop()
    expect(modality()).toBe('keyboard')
    document.documentElement.removeAttribute('data-input-modality')
    stop = () => {}
  })
})
