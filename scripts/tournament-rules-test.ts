/** Semantic Rules tests with synthetic resources and mocked get(): no Firestore writes or production document reads. */
import { readFileSync } from 'node:fs'
import { GoogleAuth } from 'google-auth-library'
import { makeTournament, publishTournament, registerForTournament, startTournament } from '../src/lib/domain'
import { SLOT_ADMIN_USER_ID as admin } from '../src/lib/admin'
import type { Tournament } from '../src/lib/tournamentTypes'

const now = Date.UTC(2026, 9, 1, 10)
const path = '/databases/(default)/documents/tournaments/qa'
const draft = makeTournament('qa', { title: 'QA synthetic tournament', startsAt: now + 7_200_000, venueId: 'oasi-boschetto', format: 'americano', pairing: 'rotating', capacity: 8, courts: 2, rounds: 3, pointsPerMatch: 24, scoreAccess: 'players' }, admin, now)
const open = publishTournament(draft, admin, now)
const auth = (uid: string) => ({ uid, token: { email: `${uid}@example.test`, email_verified: true } })
interface Case { label: string; testCase: Record<string, unknown> }
const cases: Case[] = []
function test(label: string, expectation: 'ALLOW' | 'DENY', method: string, actor: string | null, before?: unknown, after?: unknown, options: { time?: number; scoreId?: string; parent?: Tournament } = {}) {
  cases.push({ label, testCase: {
    expectation, expressionReportLevel: 'FULL',
    request: { path: options.scoreId ? `${path}/scores/${options.scoreId}` : path, method,
      auth: actor ? auth(actor) : null, time: new Date(options.time ?? now).toISOString(),
      ...(after ? { resource: { data: after } } : {}) },
    ...(before ? { resource: { data: before } } : {}),
    ...(options.parent ? { functionMocks: [{ function: 'get', args: [{ exactValue: path }], result: { value: { data: options.parent } } }] } : {}),
  } })
}
test('admin creates draft', 'ALLOW', 'create', admin, undefined, draft)
test('member cannot create', 'DENY', 'create', 'p0', undefined, draft)
test('anonymous cannot create', 'DENY', 'create', null, undefined, draft)
test('admin reads draft', 'ALLOW', 'get', admin, draft)
test('member cannot read draft', 'DENY', 'get', 'p0', draft)
test('member reads published', 'ALLOW', 'get', 'p0', open)
test('anonymous cannot read published', 'DENY', 'get', null, open)
test('admin publishes', 'ALLOW', 'update', admin, draft, open)
test('member cannot publish', 'DENY', 'update', 'p0', draft, open)
test('no deletion even by admin', 'DENY', 'delete', admin, open)
const joined = registerForTournament(open, { id: 'p0', displayName: 'Player zero' }, null, now)
test('member registers self', 'ALLOW', 'update', 'p0', open, joined)
test('cannot register someone else', 'DENY', 'update', 'p1', open, joined)
test('self withdrawal', 'ALLOW', 'update', 'p0', joined, open)
test('cannot remove another player', 'DENY', 'update', 'p1', joined, open)
test('cannot change format', 'DENY', 'update', 'p0', open, { ...joined, format: 'mexicano' })
test('cannot add arbitrary fields', 'DENY', 'update', 'p0', open, { ...joined, hack: true })
test('cannot register in draft', 'DENY', 'update', 'p0', draft, { ...draft, registrations: joined.registrations })
const cutoff = open.startsAt - 3_600_000
const justBefore = registerForTournament(open, { id: 'p0', displayName: 'Player zero' }, null, cutoff - 1)
test('registration one millisecond before cutoff', 'ALLOW', 'update', 'p0', open, justBefore, { time: cutoff - 1 })
test('registration at cutoff rejected using server time', 'DENY', 'update', 'p0', open, justBefore, { time: cutoff })
test('withdrawal at cutoff rejected', 'DENY', 'update', 'p0', joined, open, { time: cutoff })
test('cannot forge registration order', 'DENY', 'update', 'p0', joined, { ...joined, registrations: { p0: { ...joined.registrations.p0, joinedAt: now - 1 } } })
let full = { ...open, capacity: 4 }
for (let i = 0; i < 4; i++) full = registerForTournament(full, { id: `p${i}`, displayName: `Player ${i}` }, null, now)
test('cannot exceed capacity', 'DENY', 'update', 'p4', full, { ...full, registrations: { ...full.registrations, p4: { userId: 'p4', displayName: 'Player four', joinedAt: now, partnerId: null } } })
const chosen = { ...full, format: 'round-robin', pairing: 'chosen-fixed', capacity: 8 } as Tournament
test('can choose registered partner', 'ALLOW', 'update', 'p0', chosen, { ...chosen, registrations: { ...chosen.registrations, p0: { ...chosen.registrations.p0, partnerId: 'p1' } } })
test('cannot confirm partner on their behalf', 'DENY', 'update', 'p0', chosen, { ...chosen, registrations: { ...chosen.registrations, p0: { ...chosen.registrations.p0, partnerId: 'p1' }, p1: { ...chosen.registrations.p1, partnerId: 'p0' } } })
test('cannot choose self', 'DENY', 'update', 'p0', chosen, { ...chosen, registrations: { ...chosen.registrations, p0: { ...chosen.registrations.p0, partnerId: 'p0' } } })
let registered = open
for (let i = 0; i < 8; i++) registered = registerForTournament(registered, { id: `p${i}`, displayName: `Player ${i}` }, null, now)
const running = startTournament(registered, admin, 17, open.startsAt)
test('admin saves draw', 'ALLOW', 'update', admin, registered, running, { time: open.startsAt })
test('player cannot save draw', 'DENY', 'update', 'p0', registered, running, { time: open.startsAt })
const match = running.matches['r1-m1'], player = match.teamA.playerIds[0]
const other = Object.keys(running.registrations).find(id => ![...match.teamA.playerIds, ...match.teamB.playerIds].includes(id))!
const options = { parent: running, scoreId: match.id, time: open.startsAt }
const score = { matchId: match.id, scoreA: 14, scoreB: 10, updatedBy: player, updatedAt: open.startsAt, revision: 1 }
test('participant enters own score', 'ALLOW', 'create', player, undefined, score, options)
test('spectator cannot score', 'DENY', 'create', 'spectator', undefined, { ...score, updatedBy: 'spectator' }, options)
test('player of another match cannot score', 'DENY', 'create', other, undefined, { ...score, updatedBy: other }, options)
test('admin scores any match', 'ALLOW', 'create', admin, undefined, { ...score, updatedBy: admin }, options)
test('member can read scores', 'ALLOW', 'get', 'spectator', score, undefined, options)
test('anonymous cannot read scores', 'DENY', 'get', null, score, undefined, options)
test('cannot forge score author', 'DENY', 'create', player, undefined, { ...score, updatedBy: admin }, options)
test('cannot score before start', 'DENY', 'create', player, undefined, score, { ...options, time: open.startsAt - 1 })
test('invalid sum rejected', 'DENY', 'create', player, undefined, { ...score, scoreA: 13 }, options)
test('decimal rejected', 'DENY', 'create', player, undefined, { ...score, scoreA: 13.5, scoreB: 10.5 }, options)
test('negative rejected', 'DENY', 'create', player, undefined, { ...score, scoreA: -1, scoreB: 25 }, options)
test('wrong match id rejected', 'DENY', 'create', player, undefined, { ...score, matchId: 'other' }, options)
test('first revision must be one', 'DENY', 'create', player, undefined, { ...score, revision: 2 }, options)
test('score edit increments revision', 'ALLOW', 'update', player, score, { ...score, scoreA: 16, scoreB: 8, revision: 2 }, options)
test('stale revision rejected', 'DENY', 'update', player, score, { ...score, scoreA: 16, scoreB: 8 }, options)
test('no score deletion', 'DENY', 'delete', admin, score, undefined, options)
test('previous round frozen', 'DENY', 'update', player, score, { ...score, revision: 2 }, { ...options, parent: { ...running, currentRound: 2 } })
test('completed tournament frozen', 'DENY', 'update', admin, score, { ...score, updatedBy: admin, revision: 2 }, { ...options, parent: { ...running, status: 'completed' } })
test('cancelled tournament frozen', 'DENY', 'create', player, undefined, score, { ...options, parent: { ...running, status: 'cancelled' } })
test('admin-only scoring option', 'DENY', 'create', player, undefined, score, { ...options, parent: { ...running, scoreAccess: 'admin' } })
test('admin still scores admin-only option', 'ALLOW', 'create', admin, undefined, { ...score, updatedBy: admin }, { ...options, parent: { ...running, scoreAccess: 'admin' } })
test('completed set accepted', 'ALLOW', 'create', player, undefined, { ...score, scoreA: 7, scoreB: 6 }, { ...options, parent: { ...running, format: 'round-robin' } })
test('unfinished set rejected', 'DENY', 'create', player, undefined, { ...score, scoreA: 6, scoreB: 5 }, { ...options, parent: { ...running, format: 'knockout' } })

const projectId = JSON.parse(readFileSync('.firebaserc', 'utf8')).projects.default as string
const endpoint = `https://firebaserules.googleapis.com/v1/projects/${projectId}:test`
const client = await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient()
const headers = await client.getRequestHeaders(endpoint)
const response = await fetch(endpoint, { method: 'POST', headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json', 'x-goog-user-project': projectId },
  body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: readFileSync('firestore.rules', 'utf8') }] }, testSuite: { testCases: cases.map(t => t.testCase) } }) })
const result = await response.json() as { error?: unknown; issues?: Array<{ severity: string; description: string }>; testResults?: Array<{ state: string; debugMessages?: unknown[]; error?: unknown; functionCalls?: unknown[] }> }
if (!response.ok || result.error || result.issues?.some(i => i.severity === 'ERROR')) throw new Error(JSON.stringify(result))
const failed = cases.filter((_, i) => result.testResults?.[i]?.state !== 'SUCCESS')
for (const item of failed) console.error(item.label, JSON.stringify(result.testResults?.[cases.indexOf(item)]))
console.log(`Tournament Security Rules: ${cases.length - failed.length}/${cases.length} passed (synthetic resources only).`)
if (failed.length) process.exitCode = 1
