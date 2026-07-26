import { FieldValue, Firestore } from '@google-cloud/firestore'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import {
  normalizeMotherName,
  normalizeMotherNamesByUserId,
} from '../src/lib/motivationalMessages'
import {
  parseMotherNamesCommand,
  type MotherNamesSetCommand,
} from './mother-names.lib'

const HELP = `
Gestisci i nomi privati usati nelle notifiche del lunedì

Uso:
  npm run mother-names:list
  npm run mother-names:set -- --uid <UID> --mother <nome> [--yes]

Opzioni:
  --project <id>     Project ID (default: bandeja-boys)
  --database <id>    Database ID (default: (default))
  --yes              Salta la conferma interattiva
  -h, --help         Mostra questo aiuto
`

async function confirmed(command: MotherNamesSetCommand, displayName: string): Promise<boolean> {
  if (command.confirmed) return true

  const input = createInterface({ input: stdin, output: stdout })
  try {
    const answer = await input.question(
      `Associare ${displayName} (${command.userId}) a “${normalizeMotherName(command.motherName)}”? [s/N] `,
    )
    return /^s(?:ì|i)?$/iu.test(answer.trim())
  } finally {
    input.close()
  }
}

async function run() {
  let command
  try {
    command = parseMotherNamesCommand(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
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
  const reference = firestore.doc('notificationContent/motherNames')

  try {
    if (command.kind === 'list') {
      const [directorySnapshot, usersSnapshot] = await Promise.all([
        reference.get(),
        firestore.collection('users').select('displayName').get(),
      ])
      const directory = normalizeMotherNamesByUserId(
        directorySnapshot.data()?.namesByUserId,
      )
      const displayNames = new Map(usersSnapshot.docs.map((item) => [
        item.id,
        typeof item.data().displayName === 'string'
          ? item.data().displayName
          : 'Utente sconosciuto',
      ]))
      const rows = Object.entries(directory)
        .map(([userId, motherName]) => ({
          userId,
          displayName: displayNames.get(userId) || 'Utente sconosciuto',
          motherName,
        }))
        .sort((left, right) => left.displayName.localeCompare(
          right.displayName,
          'it-IT',
          { sensitivity: 'base' },
        ))

      if (rows.length === 0) {
        console.log('Nessun abbinamento privato per UID.')
        return
      }
      rows.forEach(({ displayName, motherName, userId }) => {
        console.log(`${displayName} → ${motherName} (${userId})`)
      })
      return
    }

    const cleanMotherName = normalizeMotherName(command.motherName)
    if (!cleanMotherName) throw new Error('Il nome della mamma non è valido.')
    const userSnapshot = await firestore.doc(`users/${command.userId}`).get()
    if (!userSnapshot.exists) throw new Error(`Utente non trovato: ${command.userId}`)
    const displayName = typeof userSnapshot.data()?.displayName === 'string'
      ? userSnapshot.data()?.displayName as string
      : command.userId

    if (!await confirmed(command, displayName)) {
      console.log('Operazione annullata.')
      return
    }

    await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference)
      const current = normalizeMotherNamesByUserId(snapshot.data()?.namesByUserId)
      transaction.set(reference, {
        namesByUserId: {
          ...current,
          [command.userId]: cleanMotherName,
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    })

    console.log(`${displayName} → ${cleanMotherName}`)
  } finally {
    await firestore.terminate()
  }
}

await run()
