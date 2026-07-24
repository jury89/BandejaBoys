import {
  Firestore,
  type DocumentData,
  type Query,
  type WhereFilterOp,
} from '@google-cloud/firestore'
import {
  normalizeFirestoreValue,
  parseFirestoreReadCommand,
  type FirestoreReadCommand,
} from './firestore-read.lib'

const HELP = `
Query Firestore in sola lettura

Uso:
  npm run db:get -- <documento> [opzioni]
  npm run db:query -- <collection> [opzioni]

Opzioni comuni:
  --project <id>                Project ID (default: bandeja-boys)
  --database <id>               Database ID (default: (default))
  --json                        Stampa solo JSON, senza intestazioni
  -h, --help                    Mostra questo aiuto

Opzioni query:
  --where <campo> <op> <valore> Filtro ripetibile; array e oggetti sono JSON
  --order-by <campo> <asc|desc> Ordinamento
  --select <campo,campo>        Proietta soltanto i campi indicati
  --limit <1-100>               Massimo risultati (default: 20)

Esempi:
  npm run db:get -- users/UID
  npm run db:query -- users --where displayName '==' Tommy
  npm run db:query -- notificationDeliveries --where kind '==' slot-ready --limit 10
  npm run db:query -- activityEvents --where type in '["signup_joined","signup_left"]' --json

Nota: racchiudi gli operatori simbolici, come '==', tra apici nella shell.
`.trim()

interface OutputDocument {
  path: string
  data: unknown
}

function printDocuments(
  documents: OutputDocument[],
  command: Exclude<FirestoreReadCommand, { kind: 'help' }>,
) {
  const normalized = documents.map((document) => ({
    path: document.path,
    data: normalizeFirestoreValue(document.data),
  }))

  if (command.json) {
    console.log(JSON.stringify(command.kind === 'get' ? normalized[0] ?? null : normalized, null, 2))
    return
  }

  if (command.kind === 'get') {
    if (normalized.length === 0) {
      console.log(`Documento non trovato: ${command.documentPath}`)
      return
    }
    console.log(`${normalized[0].path}\n${JSON.stringify(normalized[0].data, null, 2)}`)
    return
  }

  console.log(
    `${normalized.length} document${normalized.length === 1 ? 'o' : 'i'} `
    + `in ${command.collectionPath} (limite ${command.limit})`,
  )
  for (const document of normalized) {
    console.log(`\n${document.path}\n${JSON.stringify(document.data, null, 2)}`)
  }
}

function explainFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  if (
    message.includes('Could not load the default credentials')
    || message.includes('default credentials')
    || message.includes('UNAUTHENTICATED')
  ) {
    return [
      'Credenziali Google Cloud mancanti.',
      'Esegui: gcloud auth application-default login',
      'Poi: gcloud auth application-default set-quota-project bandeja-boys',
    ].join('\n')
  }

  if (message.includes('PERMISSION_DENIED') || message.includes('7 PERMISSION_DENIED')) {
    return 'Permesso Firestore negato per l’account Google Cloud corrente.'
  }

  return message
}

async function run() {
  let command: FirestoreReadCommand
  try {
    command = parseFirestoreReadCommand(process.argv.slice(2))
  } catch (error) {
    console.error(explainFailure(error))
    console.error('\nUsa --help per vedere la sintassi completa.')
    process.exitCode = 1
    return
  }

  if (command.kind === 'help') {
    console.log(HELP)
    return
  }

  const firestore = new Firestore({
    projectId: command.projectId,
    databaseId: command.databaseId,
  })

  try {
    if (command.kind === 'get') {
      const snapshot = await firestore.doc(command.documentPath).get()
      printDocuments(
        snapshot.exists ? [{ path: snapshot.ref.path, data: snapshot.data() }] : [],
        command,
      )
      if (!snapshot.exists) process.exitCode = 2
      return
    }

    let query: Query<DocumentData> = firestore.collection(command.collectionPath)
    for (const filter of command.filters) {
      query = query.where(filter.field, filter.operator as WhereFilterOp, filter.value)
    }
    if (command.orderBy) {
      query = query.orderBy(command.orderBy.field, command.orderBy.direction)
    }
    if (command.select.length > 0) query = query.select(...command.select)
    query = query.limit(command.limit)

    const snapshot = await query.get()
    printDocuments(
      snapshot.docs.map((document) => ({
        path: document.ref.path,
        data: document.data(),
      })),
      command,
    )
  } catch (error) {
    console.error(explainFailure(error))
    process.exitCode = 1
  } finally {
    await firestore.terminate()
  }
}

await run()
