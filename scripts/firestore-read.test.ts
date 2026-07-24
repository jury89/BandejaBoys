import { describe, expect, it } from 'vitest'
import {
  DEFAULT_QUERY_LIMIT,
  normalizeFirestoreValue,
  parseFirestoreReadCommand,
  parseQueryValue,
} from './firestore-read.lib'

describe('Firestore read CLI', () => {
  it('interpreta la lettura di un documento con progetto esplicito', () => {
    expect(parseFirestoreReadCommand([
      'get',
      'users/user-1',
      '--project',
      'test-project',
      '--json',
    ], {})).toEqual({
      kind: 'get',
      documentPath: 'users/user-1',
      projectId: 'test-project',
      databaseId: '(default)',
      json: true,
    })
  })

  it('interpreta filtri ripetuti, selezione, ordine e limite', () => {
    expect(parseFirestoreReadCommand([
      'query',
      'activityEvents',
      '--where',
      'type',
      'in',
      '["signup_joined","signup_left"]',
      '--where',
      'occurredAt',
      '>=',
      '100',
      '--order-by',
      'occurredAt',
      'desc',
      '--select',
      'type,actorName,occurredAt',
      '--limit',
      '12',
    ], {})).toEqual({
      kind: 'query',
      collectionPath: 'activityEvents',
      projectId: 'bandeja-boys',
      databaseId: '(default)',
      json: false,
      filters: [
        {
          field: 'type',
          operator: 'in',
          value: ['signup_joined', 'signup_left'],
        },
        {
          field: 'occurredAt',
          operator: '>=',
          value: 100,
        },
      ],
      orderBy: {
        field: 'occurredAt',
        direction: 'desc',
      },
      select: ['type', 'actorName', 'occurredAt'],
      limit: 12,
    })
  })

  it('usa un limite prudente per le query senza --limit', () => {
    const command = parseFirestoreReadCommand(['query', 'users'], {})
    expect(command.kind === 'query' && command.limit).toBe(DEFAULT_QUERY_LIMIT)
  })

  it('rifiuta percorsi del tipo sbagliato', () => {
    expect(() => parseFirestoreReadCommand(['get', 'users'], {}))
      .toThrow('deve identificare un documento')
    expect(() => parseFirestoreReadCommand(['query', 'users/user-1'], {}))
      .toThrow('deve identificare una collection')
  })

  it('rifiuta limiti e filtri che potrebbero produrre query involontarie', () => {
    expect(() => parseFirestoreReadCommand(['query', 'users', '--limit', '101'], {}))
      .toThrow('tra 1 e 100')
    expect(() => parseFirestoreReadCommand([
      'query',
      'users',
      '--where',
      'displayName',
      'in',
      'Tommy',
    ], {})).toThrow('richiede un array JSON')
  })

  it('converte valori JSON senza alterare le stringhe normali', () => {
    expect(parseQueryValue('false')).toBe(false)
    expect(parseQueryValue('18.5')).toBe(18.5)
    expect(parseQueryValue('Tommy')).toBe('Tommy')
  })

  it('normalizza timestamp e oscura i dati sensibili', () => {
    expect(normalizeFirestoreValue({
      displayName: 'Tommy',
      avatarDataUrl: 'data:image/jpeg;base64,abc',
      endpoint: 'https://push.example/token',
      nested: {
        sentAt: {
          toDate: () => new Date('2026-07-24T07:00:00.000Z'),
        },
      },
    })).toEqual({
      displayName: 'Tommy',
      avatarDataUrl: '[oscurato]',
      endpoint: '[oscurato]',
      nested: {
        sentAt: '2026-07-24T07:00:00.000Z',
      },
    })
  })
})
