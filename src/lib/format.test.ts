import {
  formatRatingAverage,
  mondayOfWeek,
  pollWeekTitle,
  relationshipPerformanceLabel,
  slotDateParts,
  slotWeekTitle,
  weekLabel,
  weekStartForDateTime,
} from './format'

describe('sintesi dei rapporti tra giocatori', () => {
  it('spiega set vinti, vantaggio, svantaggio e parità nei game', () => {
    expect(relationshipPerformanceLabel({
      setWins: 2,
      setsPlayed: 3,
      winRate: 66.7,
      gameDifference: 3,
    })).toBe('2 set vinti su 3 (66,7%) · 3 game fatti in più degli avversari')
    expect(relationshipPerformanceLabel({
      setWins: 0,
      setsPlayed: 4,
      winRate: 0,
      gameDifference: -16,
    })).toBe('0 set vinti su 4 (0%) · 16 game fatti in meno degli avversari')
    expect(relationshipPerformanceLabel({
      setWins: 1,
      setsPlayed: 3,
      winRate: 33.3,
      gameDifference: 0,
    })).toBe('1 set vinto su 3 (33,3%) · stesso numero di game degli avversari')
  })
})

describe('medie delle pagelle', () => {
  it('arrotonda al mezzo punto più vicino senza decimali inutili', () => {
    expect(formatRatingAverage(7.3)).toBe('7,5')
    expect(formatRatingAverage(7.8)).toBe('8')
    expect(formatRatingAverage(7.2)).toBe('7')
  })
})

describe('orari degli slot', () => {
  it('mostra sempre giorno e ora di Roma anche se l’istante è espresso in UTC', () => {
    expect(slotDateParts('2026-07-28T18:30:00.000Z')).toMatchObject({
      weekday: 'MAR',
      day: '28',
      month: 'LUG',
      time: '20:30',
    })
    expect(slotDateParts('2026-12-15T18:30:00.000Z').time).toBe('19:30')
  })
})

describe('etichette settimanali', () => {
  it('genera un titolo riconoscibile con intervallo e anno', () => {
    expect(pollWeekTitle('2026-07-27')).toBe('Padel · 27 lug – 2 ago 2026')
    expect(weekLabel('2026-07-27')).toBe('27 lug — 2 ago')
  })

  it('riconduce qualsiasi giorno alla settimana da lunedì a domenica', () => {
    expect(mondayOfWeek('2026-08-05')).toBe('2026-08-03')
    expect(mondayOfWeek('2026-08-09')).toBe('2026-08-03')
    expect(pollWeekTitle('2026-08-05')).toBe('Padel · 3 ago – 9 ago 2026')
    expect(weekLabel('2026-08-05')).toBe('3 ago — 9 ago')
  })

  it('ricava la settimana dalla data effettiva dello slot nel fuso di Roma', () => {
    expect(weekStartForDateTime('2026-08-09T21:30')).toBe('2026-08-03')
    expect(weekStartForDateTime('2026-08-16T22:30:00.000Z')).toBe('2026-08-17')
    expect(slotWeekTitle('2026-08-16T22:30:00.000Z')).toBe('Padel · 17 ago – 23 ago 2026')
  })

  it('esplicita entrambi gli anni quando la settimana attraversa Capodanno', () => {
    expect(pollWeekTitle('2026-12-28')).toBe('Padel · 28 dic 2026 – 3 gen 2027')
  })

  it('usa un fallback sicuro per una data non valida', () => {
    expect(mondayOfWeek('2026-02-30')).toBeNull()
    expect(pollWeekTitle('2026-02-30')).toBe('Padel')
    expect(weekLabel('2026-02-30')).toBe('')
  })
})
