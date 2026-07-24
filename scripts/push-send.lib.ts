export const DEFAULT_PUSH_TITLE = 'Bandeja Boys'
export const MAX_PUSH_TITLE_LENGTH = 80
export const MAX_PUSH_MESSAGE_LENGTH = 240

export interface PushRecipient {
  id: string
  displayName: string
  deviceCount: number
}

export interface PushSendOptions {
  to?: string
  uid?: string
  title?: string
  message?: string
  projectId: string
  databaseId: string
  yes: boolean
  dryRun: boolean
  wait: boolean
  help: boolean
}

function readOptionValue(args: string[], index: number, option: string) {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`L'opzione ${option} richiede un valore.`)
  }
  return value
}

function validateText(value: string | undefined, label: string, maximum: number) {
  const normalized = value?.trim()
  if (normalized && normalized.length > maximum) {
    throw new Error(`${label} supera i ${maximum} caratteri.`)
  }
  return normalized
}

export function parsePushSendOptions(
  args: string[],
  environment: NodeJS.ProcessEnv = process.env,
): PushSendOptions {
  let to: string | undefined
  let uid: string | undefined
  let title: string | undefined
  let message: string | undefined
  let projectId = environment.FIREBASE_PROJECT_ID
    || environment.GOOGLE_CLOUD_PROJECT
    || environment.GCLOUD_PROJECT
    || 'bandeja-boys'
  let databaseId = environment.FIRESTORE_DATABASE_ID || '(default)'
  let yes = false
  let dryRun = false
  let wait = true
  let help = false

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index]

    if (option === '--help' || option === '-h') {
      help = true
      continue
    }
    if (option === '--yes' || option === '-y') {
      yes = true
      continue
    }
    if (option === '--dry-run') {
      dryRun = true
      continue
    }
    if (option === '--no-wait') {
      wait = false
      continue
    }
    if (option === '--to') {
      to = readOptionValue(args, index, option)
      index += 1
      continue
    }
    if (option === '--uid') {
      uid = readOptionValue(args, index, option)
      index += 1
      continue
    }
    if (option === '--title') {
      title = readOptionValue(args, index, option)
      index += 1
      continue
    }
    if (option === '--message') {
      message = readOptionValue(args, index, option)
      index += 1
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
    if (!option.startsWith('--') && !to) {
      to = option
      continue
    }

    throw new Error(`Opzione sconosciuta: "${option}".`)
  }

  if (to && uid) throw new Error('Usa --to oppure --uid, non entrambi.')
  if (!projectId.trim()) throw new Error('Project ID Firebase non valido.')
  if (!databaseId.trim()) throw new Error('Database ID Firestore non valido.')

  return {
    to: to?.trim(),
    uid: uid?.trim(),
    title: validateText(title, 'Il titolo', MAX_PUSH_TITLE_LENGTH),
    message: validateText(message, 'Il messaggio', MAX_PUSH_MESSAGE_LENGTH),
    projectId: projectId.trim(),
    databaseId: databaseId.trim(),
    yes,
    dryRun,
    wait,
    help,
  }
}

export function resolvePushRecipient(
  recipients: PushRecipient[],
  options: Pick<PushSendOptions, 'to' | 'uid'>,
) {
  if (options.uid) {
    const recipient = recipients.find((candidate) => candidate.id === options.uid)
    if (!recipient) throw new Error(`Nessun utente con UID "${options.uid}".`)
    return recipient
  }

  const requestedName = options.to
  if (!requestedName) return undefined
  const matches = recipients.filter(
    (candidate) => candidate.displayName.localeCompare(
      requestedName,
      'it',
      { sensitivity: 'base' },
    ) === 0,
  )
  if (matches.length === 0) throw new Error(`Nessun utente chiamato "${requestedName}".`)
  if (matches.length > 1) {
    throw new Error(`Più utenti si chiamano "${requestedName}": usa --uid per distinguerli.`)
  }
  return matches[0]
}

export function validatePushContent(title: string, message: string) {
  const normalizedTitle = validateText(title, 'Il titolo', MAX_PUSH_TITLE_LENGTH)
  const normalizedMessage = validateText(message, 'Il messaggio', MAX_PUSH_MESSAGE_LENGTH)
  if (!normalizedTitle) throw new Error('Il titolo non può essere vuoto.')
  if (!normalizedMessage) throw new Error('Il messaggio non può essere vuoto.')
  return {
    title: normalizedTitle,
    message: normalizedMessage,
  }
}

export function buildWorkflowDispatchArgs(
  recipient: PushRecipient,
  title: string,
  message: string,
) {
  return [
    'workflow',
    'run',
    'notifications.yml',
    '--ref',
    'main',
    '-f',
    `test_user_id=${recipient.id}`,
    '-f',
    `test_title=${title}`,
    '-f',
    `test_message=${message}`,
    '-f',
    'test_mode=standard',
  ]
}
