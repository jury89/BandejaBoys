import { describe, expect, it } from 'vitest'
import {
  MONDAY_MOTIVATIONAL_CATALOG_VERSION,
  MONDAY_MOTIVATIONAL_MESSAGES,
  normalizeMotherName,
  normalizeMotherNamesByUserId,
  normalizeMotivationalMessages,
  personalizeMotivationalMessageWithMotherName,
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

  it('normalizza gli abbinamenti privati per UID e rimuove l’articolo già gestito dal testo', () => {
    expect(normalizeMotherName('  La Lori  ')).toBe('Lori')
    expect(normalizeMotherNamesByUserId({
      ' user-1 ': ' La Lori ',
      'uid/non-valido': 'Ada',
      'user-2': 42,
    })).toEqual({
      'user-1': 'Lori',
    })
  })

  it('sostituisce tua madre usando articoli e preposizioni corretti', () => {
    expect(personalizeMotivationalMessageWithMotherName(
      'Spacca tutto: tua madre ha bisogno di una prova.',
      'Giulia',
    )).toBe('Spacca tutto: la Giulia ha bisogno di una prova.')
    expect(personalizeMotivationalMessageWithMotherName(
      'Non essere il problema preferito di tua madre.',
      'Giulia',
    )).toBe('Non essere il problema preferito della Giulia.')
    expect(personalizeMotivationalMessageWithMotherName(
      'Tua madre si aspetta di più da te.',
      'Ada',
    )).toBe('La Ada si aspetta di più da te.')
    expect(personalizeMotivationalMessageWithMotherName(
      'Quella santa donna di tua madre ti giudica.',
      'Ada',
    )).toBe('Quella santa donna della Ada ti giudica.')
    expect(personalizeMotivationalMessageWithMotherName(
      'Tua madre oggi fa il tifo per te.',
      'La Lori',
    )).toBe('La Lori oggi fa il tifo per te.')
  })

  it('lascia il testo generico quando il nome non è configurato', () => {
    const message = 'Spacca tutto: tua madre ha bisogno di una prova.'

    expect(personalizeMotivationalMessageWithMotherName(message, undefined)).toBe(message)
  })
})
