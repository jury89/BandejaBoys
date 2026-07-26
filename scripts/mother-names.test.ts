import { describe, expect, it } from 'vitest'
import { parseMotherNamesCommand } from './mother-names.lib'

describe('mother names CLI', () => {
  it('interpreta un aggiornamento confermato', () => {
    expect(parseMotherNamesCommand([
      'set',
      '--uid',
      'user-1',
      '--mother',
      'La Lori',
      '--yes',
    ], {})).toEqual({
      kind: 'set',
      projectId: 'bandeja-boys',
      databaseId: '(default)',
      userId: 'user-1',
      motherName: 'La Lori',
      confirmed: true,
    })
  })

  it('interpreta la lista con un progetto esplicito', () => {
    expect(parseMotherNamesCommand([
      'list',
      '--project',
      'test-project',
    ], {})).toEqual({
      kind: 'list',
      projectId: 'test-project',
      databaseId: '(default)',
    })
  })

  it('rifiuta UID, nomi e opzioni mancanti', () => {
    expect(() => parseMotherNamesCommand(['set', '--uid', 'uid/non-valido', '--mother', 'Ada'], {}))
      .toThrow('UID Firebase valido')
    expect(() => parseMotherNamesCommand(['set', '--uid', 'user-1'], {}))
      .toThrow('nome della mamma')
    expect(() => parseMotherNamesCommand(['list', '--uid', 'user-1'], {}))
      .toThrow('Opzione sconosciuta')
  })
})
