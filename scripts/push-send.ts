import { execFileSync } from 'node:child_process'
import { stdin, stdout } from 'node:process'
import { createInterface, type Interface } from 'node:readline/promises'
import { Firestore } from '@google-cloud/firestore'
import {
  DEFAULT_PUSH_TITLE,
  buildWorkflowDispatchArgs,
  parsePushSendOptions,
  resolvePushRecipient,
  validatePushContent,
  type PushRecipient,
} from './push-send.lib'

const HELP = `
Invia una notifica push a un membro di Bandeja Boys

Uso interattivo:
  npm run push:send

Uso con argomenti:
  npm run push:send -- Tommy --title "Forza Tommy" --message "Rimettiti presto!"
  npm run push:send -- --to Luigi --title "Padel" --message "Chiama il campo" --yes

Opzioni:
  --to <nome>             Destinatario, senza distinzione tra maiuscole e minuscole
  --uid <uid>             UID Firebase, utile se due persone hanno lo stesso nome
  --title <titolo>        Titolo della push, massimo 80 caratteri
  --message <messaggio>   Testo della push, massimo 240 caratteri
  --project <id>          Project ID (default: bandeja-boys)
  --database <id>         Database ID (default: (default))
  --dry-run               Mostra l’anteprima senza inviare
  --no-wait               Non attende il completamento del workflow
  -y, --yes               Invia senza chiedere conferma
  -h, --help              Mostra questo aiuto
`.trim()

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
  if (message.includes('ENOENT') && message.includes('gh')) {
    return 'GitHub CLI non trovata. Installa gh ed esegui gh auth login.'
  }
  return message
}

async function loadRecipients(firestore: Firestore): Promise<PushRecipient[]> {
  const [usersSnapshot, subscriptionsSnapshot] = await Promise.all([
    firestore.collection('users').select('displayName').get(),
    firestore.collection('pushSubscriptions').select('userId').get(),
  ])
  const devicesByUser = new Map<string, number>()
  for (const subscription of subscriptionsSnapshot.docs) {
    const userId = subscription.data().userId
    if (typeof userId !== 'string' || !userId) continue
    devicesByUser.set(userId, (devicesByUser.get(userId) || 0) + 1)
  }

  return usersSnapshot.docs
    .map((document) => ({
      id: document.id,
      displayName: String(document.data().displayName || '').trim(),
      deviceCount: devicesByUser.get(document.id) || 0,
    }))
    .filter((recipient) => recipient.displayName)
    .sort((left, right) => left.displayName.localeCompare(
      right.displayName,
      'it',
      { sensitivity: 'base' },
    ))
}

function deviceLabel(count: number) {
  return `${count} dispositiv${count === 1 ? 'o' : 'i'}`
}

async function chooseRecipient(
  recipients: PushRecipient[],
  prompt: Interface,
) {
  console.log('\nDestinatari:')
  recipients.forEach((recipient, index) => {
    const availability = recipient.deviceCount > 0
      ? deviceLabel(recipient.deviceCount)
      : 'notifiche non attive'
    console.log(`  ${index + 1}. ${recipient.displayName} — ${availability}`)
  })

  while (true) {
    const answer = (await prompt.question('\nScegli il numero del destinatario: ')).trim()
    const index = Number(answer) - 1
    if (Number.isInteger(index) && recipients[index]) return recipients[index]
    console.log('Scelta non valida, riprova.')
  }
}

function extractRun(output: string) {
  const url = output.split(/\s+/).find(
    (value) => /^https:\/\/github\.com\/.+\/actions\/runs\/\d+$/.test(value),
  )
  return {
    url,
    id: url?.match(/\/runs\/(\d+)$/)?.[1],
  }
}

function sendViaGitHub(
  recipient: PushRecipient,
  title: string,
  message: string,
  wait: boolean,
) {
  const dispatchOutput = execFileSync(
    'gh',
    buildWorkflowDispatchArgs(recipient, title, message),
    { encoding: 'utf8' },
  ).trim()
  const run = extractRun(dispatchOutput)
  console.log(`\nNotifica accodata${run.url ? `: ${run.url}` : '.'}`)

  if (!wait || !run.id) return
  execFileSync('gh', ['run', 'watch', run.id, '--exit-status'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const log = execFileSync('gh', ['run', 'view', run.id, '--log'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const summaries = Array.from(log.matchAll(/Notifiche: [^\r\n]+/g), (match) => match[0])
  console.log(summaries.at(-1) || 'Workflow completato correttamente.')
}

async function run() {
  const options = parsePushSendOptions(process.argv.slice(2))
  if (options.help) {
    console.log(HELP)
    return
  }

  const firestore = new Firestore({
    projectId: options.projectId,
    databaseId: options.databaseId,
  })
  let prompt: Interface | undefined

  try {
    const recipients = await loadRecipients(firestore)
    if (recipients.length === 0) throw new Error('Non ci sono utenti nel database.')

    let recipient = resolvePushRecipient(recipients, options)
  const needsPrompt = !recipient
    || !options.title
    || !options.message
    || (!options.yes && !options.dryRun)
    if (needsPrompt) {
      if (!stdin.isTTY || !stdout.isTTY) {
        throw new Error('Modalità non interattiva: specifica destinatario, titolo, messaggio e --yes.')
      }
      prompt = createInterface({ input: stdin, output: stdout })
    }

    recipient ||= await chooseRecipient(recipients, prompt!)
    if (recipient.deviceCount === 0) {
      throw new Error(`${recipient.displayName} non ha dispositivi con notifiche attive.`)
    }

    const title = options.title
      || (await prompt!.question(`Titolo [${DEFAULT_PUSH_TITLE}]: `)).trim()
      || DEFAULT_PUSH_TITLE
    const message = options.message
      || (await prompt!.question('Messaggio: ')).trim()
    const content = validatePushContent(title, message)

    console.log('\nRiepilogo')
    console.log(`  Destinatario: ${recipient.displayName} (${deviceLabel(recipient.deviceCount)})`)
    console.log(`  Titolo: ${content.title}`)
    console.log(`  Messaggio: ${content.message}`)

    if (options.dryRun) {
      console.log('\nSimulazione completata: nessuna notifica inviata.')
      return
    }

    if (!options.yes) {
      const confirmation = (await prompt!.question('\nInviare ora? [s/N] ')).trim()
      if (!/^s(?:ì|i)?$/i.test(confirmation)) {
        console.log('Invio annullato.')
        return
      }
    }

    sendViaGitHub(recipient, content.title, content.message, options.wait)
  } finally {
    prompt?.close()
    await firestore.terminate()
  }
}

try {
  await run()
} catch (error) {
  console.error(explainFailure(error))
  process.exitCode = 1
}
