export const DEFAULT_QUERY_LIMIT = 20
export const MAX_QUERY_LIMIT = 100

export const WHERE_OPERATORS = [
  '<',
  '<=',
  '==',
  '!=',
  '>=',
  '>',
  'array-contains',
  'in',
  'not-in',
  'array-contains-any',
] as const

export type WhereOperator = typeof WHERE_OPERATORS[number]

interface CommonOptions {
  projectId: string
  databaseId: string
  json: boolean
}
export interface GetCommand extends CommonOptions {
  kind: 'get'
  documentPath: string
}

export interface QueryFilter {
  field: string
  operator: WhereOperator
  value: unknown
}

export interface QueryCommand extends CommonOptions {
  kind: 'query'
  collectionPath: string
  filters: QueryFilter[]
  limit: number
  orderBy?: {
    field: string
    direction: 'asc' | 'desc'
  }
  select: string[]
}

export interface HelpCommand {
  kind: 'help'
}

export type FirestoreReadCommand = GetCommand | QueryCommand | HelpCommand

const REDACTED_FIELDS = new Set([
  'avatarDataUrl',
  'endpoint',
  'keys',
  'auth',
  'p256dh',
])

function readOptionValue(args: string[], index: number, option: string) {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`L'opzione ${option} richiede un valore.`)
  }
  return value
}

function normalizeFirestorePath(path: string, expected: 'collection' | 'document') {
  const normalized = path.trim()
  const segments = normalized.split('/')

  if (
    !normalized
    || normalized.startsWith('/')
    || normalized.endsWith('/')
    || segments.some((segment) => !segment)
  ) {
    throw new Error(`Percorso Firestore non valido: "${path}".`)
  }

  const expectsEvenSegments = expected === 'document'
  if ((segments.length % 2 === 0) !== expectsEvenSegments) {
    throw new Error(
      expected === 'document'
        ? `Il percorso "${path}" deve identificare un documento.`
        : `Il percorso "${path}" deve identificare una collection.`,
    )
  }

  return normalized
}

function parseLimit(raw: string) {
  const limit = Number(raw)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_QUERY_LIMIT) {
    throw new Error(`--limit deve essere un intero tra 1 e ${MAX_QUERY_LIMIT}.`)
  }
  return limit
}

export function parseQueryValue(raw: string): unknown {
  const value = raw.trim()

  if (
    value === 'true'
    || value === 'false'
    || value === 'null'
    || /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)
    || value.startsWith('[')
    || value.startsWith('{')
  ) {
    try {
      return JSON.parse(value)
    } catch {
      throw new Error(`Valore JSON non valido: ${raw}`)
    }
  }

  return raw
}

export function parseFirestoreReadCommand(
  args: string[],
  environment: NodeJS.ProcessEnv = process.env,
): FirestoreReadCommand {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    return { kind: 'help' }
  }

  const kind = args[0]
  if (kind !== 'get' && kind !== 'query') {
    throw new Error(`Comando sconosciuto: "${kind}". Usa get oppure query.`)
  }

  const path = args[1]
  if (!path || path.startsWith('--')) {
    throw new Error(
      kind === 'get'
        ? 'Indica il percorso del documento da leggere.'
        : 'Indica il percorso della collection da interrogare.',
    )
  }

  let projectId = environment.FIREBASE_PROJECT_ID
    || environment.GOOGLE_CLOUD_PROJECT
    || environment.GCLOUD_PROJECT
    || 'bandeja-boys'
  let databaseId = environment.FIRESTORE_DATABASE_ID || '(default)'
  let json = false
  let limit = DEFAULT_QUERY_LIMIT
  let orderBy: QueryCommand['orderBy']
  const filters: QueryFilter[] = []
  let select: string[] = []

  for (let index = 2; index < args.length; index += 1) {
    const option = args[index]

    if (option === '--json') {
      json = true
      continue
    }

    if (option === '--project') {
      projectId = readOptionValue(args, index, option)
      index += 1
      continue
    }

    if (option === '--database') {
      databaseId = readOptionValue(args, index, option)
      index += 1
      continue
    }

    if (kind === 'query' && option === '--limit') {
      limit = parseLimit(readOptionValue(args, index, option))
      index += 1
      continue
    }

    if (kind === 'query' && option === '--select') {
      select = readOptionValue(args, index, option)
        .split(',')
        .map((field) => field.trim())
        .filter(Boolean)
      if (select.length === 0) throw new Error('--select richiede almeno un campo.')
      index += 1
      continue
    }

    if (kind === 'query' && option === '--order-by') {
      const field = readOptionValue(args, index, option)
      const direction = args[index + 2]
      if (direction !== 'asc' && direction !== 'desc') {
        throw new Error('--order-by richiede un campo seguito da asc oppure desc.')
      }
      orderBy = { field, direction }
      index += 2
      continue
    }

    if (kind === 'query' && option === '--where') {
      const field = readOptionValue(args, index, option)
      const operator = args[index + 2]
      const rawValue = args[index + 3]
      if (!WHERE_OPERATORS.includes(operator as WhereOperator)) {
        throw new Error(`Operatore Firestore non supportato: "${operator || ''}".`)
      }
      if (rawValue === undefined || rawValue.startsWith('--')) {
        throw new Error('--where richiede campo, operatore e valore.')
      }

      const value = parseQueryValue(rawValue)
      if (
        (operator === 'in' || operator === 'not-in' || operator === 'array-contains-any')
        && !Array.isArray(value)
      ) {
        throw new Error(`${operator} richiede un array JSON, per esempio '["A","B"]'.`)
      }

      filters.push({
        field,
        operator: operator as WhereOperator,
        value,
      })
      index += 3
      continue
    }

    throw new Error(`Opzione sconosciuta: "${option}".`)
  }

  if (!projectId.trim()) throw new Error('Project ID Firebase non valido.')
  if (!databaseId.trim()) throw new Error('Database ID Firestore non valido.')

  const common = {
    projectId: projectId.trim(),
    databaseId: databaseId.trim(),
    json,
  }

  if (kind === 'get') {
    return {
      ...common,
      kind,
      documentPath: normalizeFirestorePath(path, 'document'),
    }
  }

  return {
    ...common,
    kind,
    collectionPath: normalizeFirestorePath(path, 'collection'),
    filters,
    limit,
    orderBy,
    select,
  }
}

function looksLikeTimestamp(value: object): value is { toDate: () => Date } {
  return 'toDate' in value && typeof value.toDate === 'function'
}

export function normalizeFirestoreValue(value: unknown, fieldName?: string): unknown {
  if (fieldName && REDACTED_FIELDS.has(fieldName)) return '[oscurato]'
  if (typeof value === 'string' && value.startsWith('data:image/')) {
    return `[immagine omessa: ${value.length} caratteri]`
  }
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value
  }
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) {
    return value.map((item) => normalizeFirestoreValue(item))
  }
  if (typeof value === 'object') {
    if (looksLikeTimestamp(value)) return value.toDate().toISOString()

    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        normalizeFirestoreValue(item, key),
      ]),
    )
  }
  return String(value)
}
