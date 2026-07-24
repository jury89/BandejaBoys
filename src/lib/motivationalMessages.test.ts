import { describe, expect, it } from 'vitest'
import {
  MONDAY_MOTIVATIONAL_CATALOG_VERSION,
  MONDAY_MOTIVATIONAL_MESSAGES,
  normalizeMotivationalMessages,
  resolveMotivationalCatalog,
} from './motivationalMessages'

describe('frasi motivazionali del lunedì', () => {
  it('contiene centocinquanta frasi uniche adatte a una notifica', () => {
    expect(MONDAY_MOTIVATIONAL_CATALOG_VERSION).toBe(2)
    expect(MONDAY_MOTIVATIONAL_MESSAGES).toHaveLength(150)
    expect(new Set(MONDAY_MOTIVATIONAL_MESSAGES)).toHaveLength(150)
    expect(MONDAY_MOTIVATIONAL_MESSAGES.every((message) => (
      message.length >= 20 && message.length <= 180
    ))).toBe(true)
  })

  it('ripulisce i dati letti da Firestore e rimuove i duplicati', () => {
    expect(normalizeMotivationalMessages([
      '  Spacca tutto. ',
      'Sei una roccia.',
      'Spacca tutto.',
      42,
      '',
      null,
    ])).toEqual(['Spacca tutto.', 'Sei una roccia.'])
    expect(normalizeMotivationalMessages({ messages: [] })).toEqual([])
  })

  it('migra il catalogo storico e conserva un catalogo già aggiornato', () => {
    expect(resolveMotivationalCatalog({
      messages: ['Vecchia frase'],
    })).toEqual({
      messages: [...MONDAY_MOTIVATIONAL_MESSAGES],
      needsWrite: true,
    })
    expect(resolveMotivationalCatalog({
      catalogVersion: MONDAY_MOTIVATIONAL_CATALOG_VERSION,
      messages: [' Frase personalizzata ', 'Frase personalizzata'],
    })).toEqual({
      messages: ['Frase personalizzata'],
      needsWrite: false,
    })
  })
})
