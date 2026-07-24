import { describe, expect, it } from 'vitest'
import {
  MONDAY_MOTIVATIONAL_CATALOG_VERSION,
  MONDAY_MOTIVATIONAL_MESSAGES,
  normalizeMotherNamesByRecipient,
  normalizeMotivationalMessages,
  personalizeMotivationalMessage,
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

  it('normalizza i nomi dei destinatari senza dipendere da maiuscole o accenti', () => {
    expect(normalizeMotherNamesByRecipient({
      ' Michele Rossì ': '  Ada  ',
      Jury: 'Ester',
      Empty: ' ',
      Invalid: 42,
    })).toEqual({
      'michele rossi': 'Ada',
      jury: 'Ester',
    })
  })

  it('sostituisce tua madre usando articoli e preposizioni corretti', () => {
    const directory = {
      'marco rossi': 'Giulia',
      michele: 'Ada',
    }

    expect(personalizeMotivationalMessage(
      'Spacca tutto: tua madre ha bisogno di una prova.',
      'Marco Rossi',
      directory,
    )).toBe('Spacca tutto: la Giulia ha bisogno di una prova.')
    expect(personalizeMotivationalMessage(
      'Non essere il problema preferito di tua madre.',
      'Marco Rossi',
      directory,
    )).toBe('Non essere il problema preferito della Giulia.')
    expect(personalizeMotivationalMessage(
      'Tua madre si aspetta di più da te.',
      'MICHELE',
      directory,
    )).toBe('L’Ada si aspetta di più da te.')
    expect(personalizeMotivationalMessage(
      'Quella santa donna di tua madre ti giudica.',
      'Michele',
      directory,
    )).toBe('Quella santa donna dell’Ada ti giudica.')
  })

  it('lascia il testo generico quando il nome non è configurato', () => {
    const message = 'Spacca tutto: tua madre ha bisogno di una prova.'

    expect(personalizeMotivationalMessage(message, 'Sconosciuto', {
      jury: 'Ester',
    })).toBe(message)
    expect(personalizeMotivationalMessage(message, undefined, {
      jury: 'Ester',
    })).toBe(message)
  })
})
