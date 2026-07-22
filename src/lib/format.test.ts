import { pollWeekTitle, weekLabel } from './format'

describe('etichette settimanali', () => {
  it('genera un titolo riconoscibile con intervallo e anno', () => {
    expect(pollWeekTitle('2026-07-27')).toBe('Padel · 27 lug – 2 ago 2026')
    expect(weekLabel('2026-07-27')).toBe('27 lug — 2 ago')
  })

  it('esplicita entrambi gli anni quando la settimana attraversa Capodanno', () => {
    expect(pollWeekTitle('2026-12-28')).toBe('Padel · 28 dic 2026 – 3 gen 2027')
  })

  it('usa un fallback sicuro per una data non valida', () => {
    expect(pollWeekTitle('2026-02-30')).toBe('Padel')
  })
})
