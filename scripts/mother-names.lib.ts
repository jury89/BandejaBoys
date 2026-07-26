export interface MotherNamesCommonOptions {
  projectId: string
  databaseId: string
}

export interface MotherNamesListCommand extends MotherNamesCommonOptions {
  kind: 'list'
}

export interface MotherNamesSetCommand extends MotherNamesCommonOptions {
  kind: 'set'
  userId: string
  motherName: string
  confirmed: boolean
}

export interface MotherNamesHelpCommand {
  kind: 'help'
}

export type MotherNamesCommand =
  | MotherNamesListCommand
  | MotherNamesSetCommand
  | MotherNamesHelpCommand

function optionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`L’opzione ${option} richiede un valore.`)
  }
  return value
}

export function parseMotherNamesCommand(
  args: string[],
  environment: NodeJS.ProcessEnv = process.env,
): MotherNamesCommand {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    return { kind: 'help' }
  }

  const kind = args[0]
  if (kind !== 'list' && kind !== 'set') {
    throw new Error(`Comando sconosciuto: “${kind}”. Usa list oppure set.`)
  }

  let projectId = environment.FIREBASE_PROJECT_ID
    || environment.GOOGLE_CLOUD_PROJECT
    || environment.GCLOUD_PROJECT
    || 'bandeja-boys'
  let databaseId = environment.FIRESTORE_DATABASE_ID || '(default)'
  let userId = ''
  let motherName = ''
  let confirmed = false

  for (let index = 1; index < args.length; index += 1) {
    const option = args[index]
    if (option === '--project') {
      projectId = optionValue(args, index, option)
      index += 1
      continue
    }
    if (option === '--database') {
      databaseId = optionValue(args, index, option)
      index += 1
      continue
    }
    if (kind === 'set' && option === '--uid') {
      userId = optionValue(args, index, option).trim()
      index += 1
      continue
    }
    if (kind === 'set' && option === '--mother') {
      motherName = optionValue(args, index, option)
      index += 1
      continue
    }
    if (kind === 'set' && option === '--yes') {
      confirmed = true
      continue
    }

    throw new Error(`Opzione sconosciuta: “${option}”.`)
  }

  if (kind === 'list') return { kind, projectId, databaseId }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(userId)) {
    throw new Error('Indica un UID Firebase valido con --uid.')
  }
  if (!motherName.trim()) {
    throw new Error('Indica il nome della mamma con --mother.')
  }

  return {
    kind,
    projectId,
    databaseId,
    userId,
    motherName,
    confirmed,
  }
}
