import { readFileSync } from 'node:fs'
import { GoogleAuth } from 'google-auth-library'

interface RulesTestCase {
  expectation: 'ALLOW' | 'DENY'
  request: {
    auth?: {
      uid: string
      token: {
        email: string
        email_verified: boolean
      }
    } | null
    path: string
    method: 'create' | 'update' | 'get'
    resource?: { data: unknown }
  }
  resource?: { data: unknown }
  expressionReportLevel: 'FULL'
}

interface MatchReportPlayer {
  userId: string
  displayName: string
}

interface MatchReportSet {
  id: string
  teamA: MatchReportPlayer[]
  teamB: MatchReportPlayer[]
  scoreA: number
  scoreB: number
}

interface MatchReportDocument {
  id: string
  pollId: string
  pollTitle: string
  slotId: string
  sessionStartsAt: string
  participantIds: string[]
  participants: MatchReportPlayer[]
  sets: MatchReportSet[]
  createdBy: string
  createdByName: string
  createdAt: number
  updatedBy: string
  updatedByName: string
  updatedAt: number
}

interface TestDefinition {
  label: string
  testCase: RulesTestCase
}

const projectId = (
  JSON.parse(readFileSync('.firebaserc', 'utf8')) as {
    projects: { default: string }
  }
).projects.default
const source = readFileSync('firestore.rules', 'utf8')
const userId = 'qa-user'
const pollId = 'qa-poll'
const slotId = 'qa-slot'
const reportId = `${pollId}__${slotId}`
const path = `/databases/(default)/documents/matchReports/${reportId}`
const participants = [
  { userId, displayName: 'Codex QA' },
  { userId: 'qa-a', displayName: 'Player A' },
  { userId: 'qa-b', displayName: 'Player B' },
  { userId: 'qa-c', displayName: 'Player C' },
]
const createdAt = 1_800_000_000_000

function makeSets(count: number): MatchReportSet[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `set-${index + 1}`,
    teamA: [participants[0], participants[1]],
    teamB: [participants[2], participants[3]],
    scoreA: 6,
    scoreB: 4,
  }))
}

function makeReport(setCount = 5): MatchReportDocument {
  return {
    id: reportId,
    pollId,
    pollTitle: 'Padel · collaudo',
    slotId,
    // The Rules REST tester coerces RFC 3339-looking values to timestamps.
    // This equivalent local datetime keeps the field a string, as the Web SDK does.
    sessionStartsAt: '2026-07-29T18:00',
    participantIds: participants.map((participant) => participant.userId),
    participants,
    sets: makeSets(setCount),
    createdBy: userId,
    createdByName: 'Codex QA',
    createdAt,
    updatedBy: userId,
    updatedByName: 'Codex QA',
    updatedAt: createdAt,
  }
}

function auth(uid = userId) {
  return {
    uid,
    token: {
      email: `${uid}@example.test`,
      email_verified: false,
    },
  }
}

function notifierAuth() {
  return {
    uid: 'notifier-qa',
    token: {
      email: 'codex@kirivoraup.resend.app',
      email_verified: true,
    },
  }
}

function createCase(
  data: MatchReportDocument,
  expectation: RulesTestCase['expectation'],
  uid = userId,
): RulesTestCase {
  return {
    expectation,
    request: {
      auth: auth(uid),
      path,
      method: 'create',
      resource: { data },
    },
    expressionReportLevel: 'FULL',
  }
}

function updateCase(
  previous: MatchReportDocument,
  next: MatchReportDocument,
  expectation: RulesTestCase['expectation'],
): RulesTestCase {
  return {
    expectation,
    request: {
      auth: auth(),
      path,
      method: 'update',
      resource: { data: next },
    },
    resource: { data: previous },
    expressionReportLevel: 'FULL',
  }
}

function readCase(
  documentPath: string,
  data: unknown,
  expectation: RulesTestCase['expectation'],
  uid?: string,
): RulesTestCase {
  return {
    expectation,
    request: {
      auth: uid ? auth(uid) : null,
      path: documentPath,
      method: 'get',
    },
    resource: { data },
    expressionReportLevel: 'FULL',
  }
}

const oneSet = makeReport(1)
const fiveSets = makeReport(5)
const validUpdate = {
  ...fiveSets,
  sets: fiveSets.sets.map((set, index) => (
    index === 0 ? { ...set, scoreA: 7, scoreB: 5 } : set
  )),
  updatedAt: createdAt + 1,
}
const outsiderId = 'qa-outsider'
const outsiderReport = {
  ...oneSet,
  createdBy: outsiderId,
  updatedBy: outsiderId,
}
const duplicatePlayer = makeReport(1)
duplicatePlayer.sets[0] = {
  ...duplicatePlayer.sets[0],
  teamB: [participants[2], participants[2]],
}
const tiedSet = makeReport(1)
tiedSet.sets[0] = {
  ...tiedSet.sets[0],
  scoreB: tiedSet.sets[0].scoreA,
}
const forbiddenUpdate = {
  ...validUpdate,
  pollTitle: 'Titolo alterato',
}
const feedbackResponseId = `${reportId}__${userId}`
const feedbackResponse = {
  id: feedbackResponseId,
  pollId,
  slotId,
  reviewerId: userId,
  status: 'submitted',
  ratings: [{ playerId: 'qa-a', playerName: 'Player A', level: 4, scoreUnits: 15 }],
  closedAt: createdAt,
}
const summaryId = `${reportId}__qa-a`
const summary = {
  id: summaryId,
  pollId,
  slotId,
  playerId: 'qa-a',
  scoreUnitsTotal: 30,
  ratingCount: 2,
  lastResponseId: feedbackResponseId,
  updatedAt: createdAt,
}
const fantasyRoundPath = `/databases/(default)/documents/fantasyRounds/${reportId}`
const fantasyRound = {
  id: reportId,
  pollId,
  pollTitle: oneSet.pollTitle,
  slotId,
  slotStartsAt: oneSet.sessionStartsAt,
  slotEndsAt: createdAt + 90 * 60_000,
  locksAt: createdAt,
  settlesAt: createdAt + (90 * 60_000) + (48 * 60 * 60_000),
  participantIds: participants.map((participant) => participant.userId),
  participants,
  rosterKey: JSON.stringify(participants.map((participant) => participant.userId)),
  status: 'open',
  createdAt,
  updatedAt: createdAt,
}
const updatedFantasyRound = {
  ...fantasyRound,
  participantIds: [userId, 'qa-a', 'qa-b', 'qa-e'],
  participants: [participants[0], participants[1], participants[2], {
    userId: 'qa-e',
    displayName: 'Player E',
  }],
  rosterKey: JSON.stringify([userId, 'qa-a', 'qa-b', 'qa-e']),
  updatedAt: createdAt + 1,
}

const tests: TestDefinition[] = [
  {
    label: 'creazione con un set',
    testCase: createCase(oneSet, 'ALLOW'),
  },
  {
    label: 'creazione con cinque set',
    testCase: createCase(fiveSets, 'ALLOW'),
  },
  {
    label: 'modifica con cinque set',
    testCase: updateCase(fiveSets, validUpdate, 'ALLOW'),
  },
  {
    label: 'utente estraneo',
    testCase: createCase(outsiderReport, 'DENY', outsiderId),
  },
  {
    label: 'giocatore duplicato nel set',
    testCase: createCase(duplicatePlayer, 'DENY'),
  },
  {
    label: 'set in parità',
    testCase: createCase(tiedSet, 'DENY'),
  },
  {
    label: 'sei set',
    testCase: createCase(makeReport(6), 'DENY'),
  },
  {
    label: 'metadati immutabili modificati',
    testCase: updateCase(fiveSets, forbiddenUpdate, 'DENY'),
  },
  {
    label: 'referto leggibile da un altro membro',
    testCase: readCase(path, oneSet, 'ALLOW', outsiderId),
  },
  {
    label: 'referto non leggibile senza autenticazione',
    testCase: readCase(path, oneSet, 'DENY'),
  },
  {
    label: 'giudizio aggregato leggibile da un membro',
    testCase: readCase(
      `/databases/(default)/documents/matchFeedbackSummaries/${summaryId}`,
      summary,
      'ALLOW',
      outsiderId,
    ),
  },
  {
    label: 'giudizio aggregato non leggibile senza autenticazione',
    testCase: readCase(
      `/databases/(default)/documents/matchFeedbackSummaries/${summaryId}`,
      summary,
      'DENY',
    ),
  },
  {
    label: 'giudizio individuale non leggibile da un membro estraneo',
    testCase: readCase(
      `/databases/(default)/documents/matchFeedbackResponses/${feedbackResponseId}`,
      feedbackResponse,
      'DENY',
      outsiderId,
    ),
  },
  {
    label: 'giudizio individuale leggibile dal revisore',
    testCase: readCase(
      `/databases/(default)/documents/matchFeedbackResponses/${feedbackResponseId}`,
      feedbackResponse,
      'ALLOW',
      userId,
    ),
  },
  {
    label: 'round fantasy creato soltanto dal notifier',
    testCase: {
      expectation: 'ALLOW',
      request: {
        auth: notifierAuth(),
        path: fantasyRoundPath,
        method: 'create',
        resource: { data: fantasyRound },
      },
      expressionReportLevel: 'FULL',
    },
  },
  {
    label: 'membro non può creare un round fantasy fidato',
    testCase: {
      expectation: 'DENY',
      request: {
        auth: auth(),
        path: fantasyRoundPath,
        method: 'create',
        resource: { data: fantasyRound },
      },
      expressionReportLevel: 'FULL',
    },
  },
  {
    label: 'notifier può riallineare un round fantasy',
    testCase: {
      expectation: 'ALLOW',
      request: {
        auth: notifierAuth(),
        path: fantasyRoundPath,
        method: 'update',
        resource: { data: updatedFantasyRound },
      },
      resource: { data: fantasyRound },
      expressionReportLevel: 'FULL',
    },
  },
  {
    label: 'round fantasy leggibile da un membro',
    testCase: readCase(fantasyRoundPath, fantasyRound, 'ALLOW', outsiderId),
  },
  {
    label: 'round fantasy non leggibile senza autenticazione',
    testCase: readCase(fantasyRoundPath, fantasyRound, 'DENY'),
  },
]

const endpoint = `https://firebaserules.googleapis.com/v1/projects/${projectId}:test`
const googleAuth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
})
const client = await googleAuth.getClient()
const requestHeaders = await client.getRequestHeaders(endpoint)
const authHeaders = requestHeaders instanceof Headers
  ? Object.fromEntries(requestHeaders.entries())
  : requestHeaders
const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    ...authHeaders,
    'content-type': 'application/json',
    'x-goog-user-project': projectId,
  },
  body: JSON.stringify({
    source: {
      files: [{
        name: 'firestore.rules',
        content: source,
      }],
    },
    testSuite: {
      testCases: tests.map(({ testCase }) => testCase),
    },
  }),
})
const payload = await response.json() as {
  error?: { message?: string }
  issues?: Array<{
    severity?: string
    description?: string
    sourcePosition?: { line?: number; column?: number }
  }>
  testResults?: Array<{
    state?: string
    debugMessages?: string[]
    errorPosition?: { line?: number; column?: number }
  }>
}

if (!response.ok) {
  throw new Error(
    `Rules API ${response.status}: ${payload.error?.message ?? 'errore sconosciuto'}`,
  )
}

const failures: string[] = []
for (const issue of payload.issues ?? []) {
  if (issue.severity === 'ERROR') {
    failures.push(
      `regole ${issue.sourcePosition?.line ?? '?'}:${issue.sourcePosition?.column ?? '?'} `
      + `${issue.description ?? 'errore sconosciuto'}`,
    )
  }
}
tests.forEach((test, index) => {
  const result = payload.testResults?.[index]
  if (result?.state !== 'SUCCESS') {
    failures.push(
      `${test.label}: ${result?.state ?? 'risultato mancante'} `
      + `(${result?.errorPosition?.line ?? '?'}:${result?.errorPosition?.column ?? '?'})`,
    )
  }
  for (const message of result?.debugMessages ?? []) {
    failures.push(`${test.label}: ${message}`)
  }
})

if (failures.length > 0) {
  console.error(`FAIL: ${failures.join('\nFAIL: ')}`)
  process.exit(1)
}

console.log(
  `PASS: ${tests.length} casi semantici superati per referti, giudizi aggregati e scelte private.`,
)
