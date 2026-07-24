import { describe, expect, it } from 'vitest'
import {
  MONDAY_MOTIVATIONAL_MESSAGES,
  normalizeMotivationalMessages,
} from './motivationalMessages'

describe('frasi motivazionali del lunedì', () => {
  it('contiene cento frasi uniche adatte a una notifica', () => {
    expect(MONDAY_MOTIVATIONAL_MESSAGES).toHaveLength(100)
    expect(new Set(MONDAY_MOTIVATIONAL_MESSAGES)).toHaveLength(100)
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
})
