/** Semantic Rules tests with synthetic resources and mocked get(): no Firestore writes or production document reads. */
import { readFileSync } from 'node:fs'
import { GoogleAuth } from 'google-auth-library'
import { editTournament, editTournamentOrganization, makeTournament, publishTournament, registerForTournament, saveTournamentGuest, removeTournamentGuest, startTournament, startTournamentRound } from '../src/lib/domain'
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
    expectation, expressionReportLevel: 'NONE',
    request: { path: options.scoreId ? `${path}/scores/${options.scoreId}` : path, method,
      auth: actor ? auth(actor) : null, time: new Date(options.time ?? now).toISOString(),
      ...(after ? { resource: { data: after } } : {}) },
    ...(before ? { resource: { data: before } } : {}),
    functionMocks: options.parent
      ? [{ function: 'get', args: [{ exactValue: path }], result: { value: { data: options.parent } } }]
      : [{ function: 'exists', args: [{ exactValue: path }], result: { value: Boolean(before) } }],
  } })
}
test('admin creates draft', 'ALLOW', 'create', admin, undefined, draft)
test('member cannot forge creator identity', 'DENY', 'create', 'p0', undefined, draft)
test('anonymous cannot create', 'DENY', 'create', null, undefined, draft)
test('admin reads draft', 'ALLOW', 'get', admin, draft)
test('member cannot read draft', 'DENY', 'get', 'p0', draft)
test('member reads published', 'ALLOW', 'get', 'p0', open)
test('anonymous cannot read published', 'DENY', 'get', null, open)
test('admin publishes', 'ALLOW', 'update', admin, draft, open)
test('member cannot publish', 'DENY', 'update', 'p0', draft, open)
test('no deletion even by admin', 'DENY', 'delete', admin, open)
const owner = 'organizer'
const ownDraft = makeTournament('qa', draft, owner, now)
const ownOpen = publishTournament(ownDraft, owner, now)
test('member checks unused id before creation transaction', 'ALLOW', 'get', owner)
test('anonymous cannot check unused id', 'DENY', 'get', null)
test('member creates own draft', 'ALLOW', 'create', owner, undefined, ownDraft)
test('cannot create directly published tournament', 'DENY', 'create', owner, undefined, ownOpen)
test('owner reads own draft', 'ALLOW', 'get', owner, ownDraft)
test('admin reads member draft', 'ALLOW', 'get', admin, ownDraft)
test('another member cannot read draft by id', 'DENY', 'get', 'p0', ownDraft)
test('member can list own drafts', 'ALLOW', 'list', owner, ownDraft)
test('member can list published tournaments', 'ALLOW', 'list', 'p0', ownOpen)
test('member cannot list another creator draft', 'DENY', 'list', 'p0', ownDraft)
test('owner edits own draft', 'ALLOW', 'update', owner, ownDraft, { ...ownDraft, title: 'Nuovo titolo' })
test('owner publishes own draft', 'ALLOW', 'update', owner, ownDraft, ownOpen)
test('admin publishes member draft', 'ALLOW', 'update', admin, ownDraft, ownOpen)
test('another member cannot publish member draft', 'DENY', 'update', 'p0', ownDraft, ownOpen)
test('cannot take over ownership', 'DENY', 'update', 'p0', ownOpen, { ...ownOpen, createdBy: 'p0' })
test('creator cannot transfer ownership', 'DENY', 'update', owner, ownOpen, { ...ownOpen, createdBy: 'p0' })
test('owner cancels own tournament', 'ALLOW', 'update', owner, ownOpen, { ...ownOpen, status: 'cancelled' })
test('another member cannot cancel tournament', 'DENY', 'update', 'p0', ownOpen, { ...ownOpen, status: 'cancelled' })
test('owner cannot delete tournament history', 'DENY', 'delete', owner, ownOpen)
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
test('owner saves own draw', 'ALLOW', 'update', owner, { ...registered, createdBy: owner }, { ...running, createdBy: owner }, { time: open.startsAt })
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
test('drawn standard match can score before scheduled start', 'ALLOW', 'create', player, undefined, score, { ...options, time: open.startsAt - 600000 })
test('undrawn match cannot score before scheduled start', 'DENY', 'create', player, undefined, score, { ...options, time: open.startsAt - 600000, parent: { ...running, status: 'open' } })
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
const ownedOptions = { ...options, parent: { ...running, createdBy: owner, scoreAccess: 'admin' as const } }
test('creator scores any match in organizer-only mode', 'ALLOW', 'create', owner, undefined, { ...score, updatedBy: owner }, ownedOptions)
test('admin scores member tournament in organizer-only mode', 'ALLOW', 'create', admin, undefined, { ...score, updatedBy: admin }, ownedOptions)
test('participant cannot score in organizer-only mode', 'DENY', 'create', player, undefined, score, ownedOptions)
test('creator corrects current result', 'ALLOW', 'update', owner, score, { ...score, updatedBy: owner, scoreA: 16, scoreB: 8, revision: 2 }, ownedOptions)
test('creator cannot overwrite stale result', 'DENY', 'update', owner, score, { ...score, updatedBy: owner }, ownedOptions)
test('creator can score a drawn standard match before scheduled start', 'ALLOW', 'create', owner, undefined, { ...score, updatedBy: owner }, { ...ownedOptions, time: open.startsAt - 600000 })
test('creator cannot change frozen results', 'DENY', 'update', owner, score, { ...score, updatedBy: owner, revision: 2 }, { ...ownedOptions, parent: { ...ownedOptions.parent, currentRound: 2 } })
test('creator reads own draft score collection', 'ALLOW', 'list', owner, undefined, undefined, { ...options, parent: ownDraft })
test('member cannot read another creator draft scores', 'DENY', 'list', 'p0', undefined, undefined, { ...options, parent: ownDraft })

// Guests never impersonate a member, count towards capacity, and share the cutoff.
const guestJoined = saveTournamentGuest(ownOpen, 'guest:ciccio', 'Ciccio', null, owner, now)
test('organizer adds external guest', 'ALLOW', 'update', owner, ownOpen, guestJoined)
test('admin adds external guest', 'ALLOW', 'update', admin, ownOpen, guestJoined)
test('another member cannot add external guest', 'DENY', 'update', 'p0', ownOpen, guestJoined)
test('organizer renames external guest', 'ALLOW', 'update', owner, guestJoined, saveTournamentGuest(guestJoined, 'guest:ciccio', 'Ciccio Rossi', null, owner, now))
test('organizer removes external guest', 'ALLOW', 'update', owner, guestJoined, removeTournamentGuest(guestJoined, 'guest:ciccio', owner, now))
test('guest registration forbidden at cutoff even for organizer', 'DENY', 'update', owner, ownOpen, guestJoined, { time: cutoff })
test('guest removal forbidden at cutoff even for admin', 'DENY', 'update', admin, guestJoined, ownOpen, { time: cutoff })
test('member cannot turn own registration into guest', 'DENY', 'update', 'p0', open, { ...joined, registrations: { p0: { ...joined.registrations.p0, isGuest: true } } })
test('organizer cannot exceed capacity with guest', 'DENY', 'update', owner, { ...full, createdBy: owner }, { ...full, createdBy: owner, registrations: { ...full.registrations, ...guestJoined.registrations } })

const timedDraft = makeTournament('qa', { ...draft, format: 'round-robin', pairing: 'random-fixed', capacity: 10, courts: 2, scoringMode: 'timed', matchMinutes: 15 }, owner, now)
const timedOpen = publishTournament(timedDraft, owner, now)
let timedRegistered = timedOpen
for (let i = 0; i < 8; i++) timedRegistered = registerForTournament(timedRegistered, { id: `p${i}`, displayName: `Player ${i}` }, null, now)
timedRegistered = saveTournamentGuest(timedRegistered, 'guest:a', 'Ospite A', null, owner, now)
timedRegistered = saveTournamentGuest(timedRegistered, 'guest:b', 'Ospite B', null, owner, now)
const timedDrawn = startTournament(timedRegistered, owner, 42, timedOpen.startsAt)
const timedStarted = startTournamentRound(timedDrawn, owner, timedOpen.startsAt)
const timedMatch = timedStarted.matches['r1-m1']
const timedOptions = { parent: timedStarted, scoreId: timedMatch.id, time: timedOpen.startsAt }
const timedScore = { matchId: timedMatch.id, scoreA: 4, scoreB: 4, updatedBy: owner, updatedAt: timedOpen.startsAt, revision: 1 }
const endsAt = timedOpen.startsAt + 900_000
test('timed draft supported', 'ALLOW', 'create', owner, undefined, timedDraft)
test('timed mode cannot use knockout', 'DENY', 'create', owner, undefined, { ...timedDraft, format: 'knockout', capacity: 8 })
test('timed mode needs concurrent courts', 'DENY', 'create', owner, undefined, { ...timedDraft, courts: 1 })
test('duration minimum validated', 'DENY', 'create', owner, undefined, { ...timedDraft, matchMinutes: 4 })
test('duration maximum validated', 'DENY', 'create', owner, undefined, { ...timedDraft, matchMinutes: 31 })
test('duration must be integer', 'DENY', 'create', owner, undefined, { ...timedDraft, matchMinutes: 15.5 })
test('cannot create with prestarted timer', 'DENY', 'create', owner, undefined, { ...timedDraft, roundStartedAt: now })
test('timed tournament published', 'ALLOW', 'update', owner, timedDraft, timedOpen)
test('timed draw with guests accepted', 'ALLOW', 'update', owner, timedRegistered, timedDrawn, { time: timedOpen.startsAt })
test('organizer starts timer', 'ALLOW', 'update', owner, timedDrawn, timedStarted, { time: timedOpen.startsAt })
test('admin starts timer', 'ALLOW', 'update', admin, timedDrawn, timedStarted, { time: timedOpen.startsAt })
test('player cannot start timer', 'DENY', 'update', 'p0', timedDrawn, timedStarted, { time: timedOpen.startsAt })
const earlyAt = timedOpen.startsAt - 3000000
const earlyStarted = startTournamentRound(timedDrawn, owner, earlyAt)
test('organizer starts timer before scheduled start', 'ALLOW', 'update', owner, timedDrawn, earlyStarted, { time: earlyAt })
test('admin starts timer before scheduled start', 'ALLOW', 'update', admin, timedDrawn, earlyStarted, { time: earlyAt })
test('player cannot start early timer', 'DENY', 'update', 'p0', timedDrawn, earlyStarted, { time: earlyAt })
test('early timer cannot be predated', 'DENY', 'update', owner, timedDrawn, { ...earlyStarted, roundStartedAt: earlyAt - 120001 }, { time: earlyAt })
test('early timer cannot be postdated', 'DENY', 'update', owner, timedDrawn, { ...earlyStarted, roundStartedAt: earlyAt + 120001 }, { time: earlyAt })
const earlyOptions = { ...timedOptions, parent: earlyStarted, time: earlyAt }
test('early timer allows organizer scores', 'ALLOW', 'create', owner, undefined, timedScore, earlyOptions)
test('early timer allows involved player scores', 'ALLOW', 'create', timedMatch.teamA.playerIds[0], undefined, { ...timedScore, updatedBy: timedMatch.teamA.playerIds[0] }, earlyOptions)
test('early match still requires timer', 'DENY', 'create', owner, undefined, timedScore, { ...earlyOptions, parent: timedDrawn })
test('early match spectator cannot score', 'DENY', 'create', 'spectator', undefined, { ...timedScore, updatedBy: 'spectator' }, earlyOptions)
test('early timer cannot restart', 'DENY', 'update', owner, earlyStarted, { ...earlyStarted, roundStartedAt: earlyAt + 1000 }, { time: earlyAt + 1000 })
const earlyNext = { ...earlyStarted, currentRound: 2, roundStartedAt: null }
test('early timer must expire before advance', 'DENY', 'update', owner, earlyStarted, earlyNext, { time: earlyAt + 899999 })
test('early timer can advance before scheduled start after expiry', 'ALLOW', 'update', owner, earlyStarted, earlyNext, { time: earlyAt + 900000 })
test('next early round needs a fresh timer', 'ALLOW', 'update', owner, earlyNext, { ...earlyNext, roundStartedAt: earlyAt + 900000 }, { time: earlyAt + 900000 })
test('timer cannot be backdated', 'DENY', 'update', owner, timedDrawn, { ...timedStarted, roundStartedAt: now }, { time: timedOpen.startsAt })
test('timer cannot restart', 'DENY', 'update', owner, timedStarted, { ...timedStarted, roundStartedAt: timedOpen.startsAt + 1000 }, { time: timedOpen.startsAt + 1000 })
test('timer cannot clear in same round', 'DENY', 'update', owner, timedStarted, timedDrawn, { time: endsAt })
test('score rejected until shared timer starts', 'DENY', 'create', owner, undefined, timedScore, { ...timedOptions, parent: timedDrawn })
test('timed draw accepted', 'ALLOW', 'create', owner, undefined, timedScore, timedOptions)
test('timed zero draw accepted', 'ALLOW', 'create', owner, undefined, { ...timedScore, scoreA: 0, scoreB: 0 }, timedOptions)
test('timed short game score accepted', 'ALLOW', 'create', owner, undefined, { ...timedScore, scoreA: 3, scoreB: 2 }, timedOptions)
test('timed count bounded', 'DENY', 'create', owner, undefined, { ...timedScore, scoreA: 100 }, timedOptions)
test('timed decimal rejected', 'DENY', 'create', owner, undefined, { ...timedScore, scoreA: 3.5 }, timedOptions)
test('timed negative rejected', 'DENY', 'create', owner, undefined, { ...timedScore, scoreA: -1 }, timedOptions)
test('timed spectator cannot score', 'DENY', 'create', 'spectator', undefined, { ...timedScore, updatedBy: 'spectator' }, timedOptions)
const timedNext = { ...timedStarted, currentRound: 2, roundStartedAt: null }
test('cannot advance before timer ends', 'DENY', 'update', owner, timedStarted, timedNext, { time: endsAt - 1 })
test('can advance after timer ends', 'ALLOW', 'update', owner, timedStarted, timedNext, { time: endsAt })
test('cannot skip a timed round', 'DENY', 'update', owner, timedStarted, { ...timedNext, currentRound: 3 }, { time: endsAt })
test('cannot finish before timer ends', 'DENY', 'update', owner, timedStarted, { ...timedStarted, status: 'completed' }, { time: endsAt - 1 })
test('cannot finish before the final round', 'DENY', 'update', owner, timedStarted, { ...timedStarted, status: 'completed' }, { time: endsAt })
test('can complete expired final round', 'ALLOW', 'update', owner, { ...timedStarted, currentRound: 5 }, { ...timedStarted, currentRound: 5, status: 'completed' }, { time: endsAt })
test('owner can change duration before cutoff', 'ALLOW', 'update', owner, timedOpen, { ...timedOpen, matchMinutes: 5 })
test('owner can change scoring before first signup', 'ALLOW', 'update', owner, timedOpen, { ...timedOpen, scoringMode: 'standard' })
const legacyDraft = Object.fromEntries(Object.entries(draft).filter(([key]) => !['scoringMode', 'matchMinutes', 'warmupMinutes', 'changeoverMinutes', 'roundStartedAt'].includes(key)))
test('legacy draft remains editable', 'ALLOW', 'update', admin, legacyDraft, { ...legacyDraft, title: 'Legacy title' })
test('legacy tournament remains publishable', 'ALLOW', 'update', admin, legacyDraft, { ...legacyDraft, status: 'open', published: true })

const adaptiveDraft = makeTournament('qa', { ...timedDraft, capacity: 12, totalMinutes: 90 }, owner, now)
const adaptiveOpen = publishTournament(adaptiveDraft, owner, now)
let adaptiveRegistered = adaptiveOpen
for (let i = 0; i < 12; i++) adaptiveRegistered = registerForTournament(adaptiveRegistered, { id: `p${i}`, displayName: `Player ${i}` }, null, now)
const adaptiveDrawn = startTournament(adaptiveRegistered, owner, 42, cutoff)
const adaptiveStarted = startTournamentRound(adaptiveDrawn, owner, adaptiveOpen.startsAt)
const adaptiveSettings = { capacity: 14, courts: 3, totalMinutes: 120, warmupMinutes: 5, changeoverMinutes: 2 }
const adaptiveEdited = editTournamentOrganization(adaptiveRegistered, adaptiveSettings, owner, now)
test('adaptive draft on fewer courts accepted', 'ALLOW', 'create', owner, undefined, adaptiveDraft)
test('adaptive publication accepted', 'ALLOW', 'update', owner, adaptiveDraft, adaptiveOpen)
test('adaptive self registration accepted', 'ALLOW', 'update', 'p0', adaptiveOpen, registerForTournament(adaptiveOpen, { id: 'p0', displayName: 'Zero' }, null, now))
const adaptiveChosen = registerForTournament({ ...adaptiveOpen, pairing: 'chosen-fixed' }, { id: 'p0', displayName: 'Zero' }, null, now)
const adaptivePartner = registerForTournament(adaptiveChosen, { id: 'p1', displayName: 'One' }, 'p0', now)
test('adaptive chosen partner registration accepted within expression budget', 'ALLOW', 'update', 'p1', adaptiveChosen, adaptivePartner)
test('adaptive reciprocal partner update accepted', 'ALLOW', 'update', 'p0', adaptivePartner, registerForTournament(adaptivePartner, { id: 'p0', displayName: 'Zero' }, 'p1', now))
test('adaptive self withdrawal accepted', 'ALLOW', 'update', 'p1', adaptivePartner, adaptiveChosen)
test('budget cannot be negative', 'DENY', 'create', owner, undefined, { ...adaptiveDraft, totalMinutes: -1 })
test('budget cannot exceed 12 hours', 'DENY', 'create', owner, undefined, { ...adaptiveDraft, totalMinutes: 721 })
test('budget must be integer', 'DENY', 'create', owner, undefined, { ...adaptiveDraft, totalMinutes: 90.5 })
test('budget cannot be insufficient', 'DENY', 'create', owner, undefined, { ...adaptiveDraft, totalMinutes: 30 })
test('budget requires timed matches', 'DENY', 'create', owner, undefined, { ...adaptiveDraft, scoringMode: 'standard' })
test('derived duration cannot be forged', 'DENY', 'create', owner, undefined, { ...adaptiveDraft, matchMinutes: 15 })
test('adaptive capacity must be even', 'DENY', 'create', owner, undefined, { ...adaptiveDraft, capacity: 11 })
test('organizer edits organization before cutoff', 'ALLOW', 'update', owner, adaptiveRegistered, adaptiveEdited)
test('admin edits organization before cutoff', 'ALLOW', 'update', admin, adaptiveRegistered, adaptiveEdited)
test('other members cannot edit organization', 'DENY', 'update', 'p0', adaptiveRegistered, adaptiveEdited)
test('organization cannot change at cutoff', 'DENY', 'update', owner, adaptiveRegistered, adaptiveEdited, { time: cutoff })
test('organization edit can also reschedule before draw', 'ALLOW', 'update', owner, adaptiveRegistered, { ...adaptiveEdited, startsAt: now + 86_400_000 })
test('organization cannot remove existing registrants', 'DENY', 'update', owner, adaptiveRegistered, { ...adaptiveRegistered, capacity: 10, matchMinutes: 15 })
test('legacy open tournament can explicitly adopt a budget', 'ALLOW', 'update', owner, timedRegistered, editTournamentOrganization(timedRegistered, { capacity: 12, courts: 2, totalMinutes: 90 }, owner, now))
test('adaptive draw saves eight court slots for twelve players', 'ALLOW', 'update', owner, adaptiveRegistered, adaptiveDrawn, { time: cutoff })
test('adaptive draw cannot precede registration cutoff', 'DENY', 'update', owner, adaptiveRegistered, adaptiveDrawn, { time: cutoff - 1 })
const adaptiveTen = { ...adaptiveRegistered, registrations: timedRegistered.registrations }
const adaptiveTenDrawn = startTournament(adaptiveTen, owner, 42, cutoff)
test('draw recomputes duration from actual ten players', 'ALLOW', 'update', owner, adaptiveTen, adaptiveTenDrawn, { time: cutoff })
test('recomputed draw cannot precede cutoff either', 'DENY', 'update', owner, adaptiveTen, adaptiveTenDrawn, { time: cutoff - 1 })
test('draw cannot keep old capacity duration', 'DENY', 'update', owner, adaptiveTen, { ...adaptiveTenDrawn, matchMinutes: 8 }, { time: cutoff })
test('draw cannot forge total rounds', 'DENY', 'update', owner, adaptiveRegistered, { ...adaptiveDrawn, totalRounds: 5 }, { time: cutoff })
test('running tournament cannot change organization', 'DENY', 'update', owner, adaptiveDrawn, { ...adaptiveDrawn, totalMinutes: 120, matchMinutes: 12 }, { time: cutoff })
test('running legacy cannot acquire budget', 'DENY', 'update', owner, timedDrawn, { ...timedDrawn, totalMinutes: 90 }, { time: cutoff })
test('adaptive shared timer starts', 'ALLOW', 'update', owner, adaptiveDrawn, adaptiveStarted, { time: adaptiveOpen.startsAt })
test('adaptive timer uses derived eight minutes', 'ALLOW', 'update', owner, adaptiveStarted, { ...adaptiveStarted, currentRound: 2, roundStartedAt: null }, { time: adaptiveOpen.startsAt + 480_000 })
test('adaptive timer cannot advance early', 'DENY', 'update', owner, adaptiveStarted, { ...adaptiveStarted, currentRound: 2, roundStartedAt: null }, { time: adaptiveOpen.startsAt + 479_999 })
const longDraft = makeTournament('qa', { ...adaptiveDraft, capacity: 24, courts: 1, totalMinutes: 720 }, owner, now)
let longRegistered = publishTournament(longDraft, owner, now)
for (let i = 0; i < 24; i++) longRegistered = registerForTournament(longRegistered, { id: `p${i}`, displayName: `Player ${i}` }, null, now)
test('larger schedules may exceed thirty-one rounds', 'ALLOW', 'update', owner, longRegistered, startTournament(longRegistered, owner, 42, cutoff), { time: cutoff })
test('longer available time supports matches over thirty minutes', 'ALLOW', 'create', owner, undefined, makeTournament('qa', { ...adaptiveDraft, capacity: 6, courts: 2, totalMinutes: 180 }, owner, now))

// General editing: creator before cutoff, only Jury across owners/after cutoff.
for (const actor of [owner, admin]) {
  test(`${actor} edits a published tournament`, 'ALLOW', 'update', actor, ownOpen, editTournament(ownOpen, { ...ownOpen, title: 'Nuova coppa', venueId: 'sport-city-mantova', capacity: 12, startsAt: now + 86_400_000 }, actor, now))
  test(`${actor} cannot backdate a new start`, 'DENY', 'update', actor, ownOpen, { ...ownOpen, startsAt: now + 3_600_000 })
  const enrolled = { ...registered, createdBy: owner }
  for (const change of [{ format: 'mexicano' }, { pairing: 'chosen-fixed' }, { pointsPerMatch: 16 }]) {
    test(`${actor} cannot change enrolled players rules ${JSON.stringify(change)}`, 'DENY', 'update', actor, enrolled, { ...enrolled, ...change })
  }
  const standard = editTournament(timedRegistered, { ...timedRegistered, scoringMode: 'standard', totalMinutes: null, matchMinutes: 15 }, actor, now)
  test(`${actor} changes enrolled timed matches to sets`, 'ALLOW', 'update', actor, timedRegistered, standard)
  const timed = editTournament(standard, { ...standard, scoringMode: 'timed', totalMinutes: 90 }, actor, now)
  test(`${actor} changes enrolled sets to timed matches`, 'ALLOW', 'update', actor, standard, timed)
  test(`${actor} cannot remove entrants while changing duration`, 'DENY', 'update', actor, standard, { ...timed, registrations: {} })
  test(`${actor} changes adaptive matches to sets`, 'ALLOW', 'update', actor, adaptiveRegistered, editTournament(adaptiveRegistered, { ...adaptiveRegistered, scoringMode: 'standard', totalMinutes: null, matchMinutes: 15 }, actor, now))
  test(`${actor} cannot remove entrants while changing settings`, 'DENY', 'update', actor, enrolled, { ...enrolled, title: 'Nuovo nome', registrations: {} })
}
const standardEnrolled = editTournament(timedRegistered, { ...timedRegistered, scoringMode: 'standard', totalMinutes: null, matchMinutes: 15 }, owner, now)
const convertedEnrolled = editTournament(standardEnrolled, { ...standardEnrolled, scoringMode: 'timed', totalMinutes: 90 }, admin, cutoff)
test('creator cannot change duration at cutoff', 'DENY', 'update', owner, standardEnrolled, convertedEnrolled, { time: cutoff })
test('admin changes duration at cutoff', 'ALLOW', 'update', admin, standardEnrolled, convertedEnrolled, { time: cutoff })
test('other member cannot change duration', 'DENY', 'update', 'p0', standardEnrolled, convertedEnrolled, { time: cutoff })
test('other member cannot edit published title', 'DENY', 'update', 'p0', ownOpen, { ...ownOpen, title: 'Nome forzato' })
test('owner cannot edit at cutoff', 'DENY', 'update', owner, ownOpen, { ...ownOpen, title: 'Nome tardivo' }, { time: cutoff })
test('admin edits another owner draft', 'ALLOW', 'update', admin, ownDraft, { ...ownDraft, title: 'Bozza corretta' })
test('admin edits closed undrawn logistics without rescheduling', 'ALLOW', 'update', admin, adaptiveRegistered, editTournament(adaptiveRegistered, { ...adaptiveRegistered, ...adaptiveSettings }, admin, cutoff), { time: cutoff })
test('admin can reopen undrawn tournament with future date', 'ALLOW', 'update', admin, adaptiveRegistered, editTournament(adaptiveRegistered, { ...adaptiveRegistered, startsAt: now + 86_400_000 }, admin, cutoff), { time: cutoff })
test('admin cannot transfer tournament ownership', 'DENY', 'update', admin, ownOpen, { ...ownOpen, createdBy: admin })
for (const status of ['running', 'completed', 'cancelled'] as const) {
  const historical = { ...timedStarted, status }
  test(`admin corrects ${status} metadata preserving clock`, 'ALLOW', 'update', admin, historical, editTournament(historical, { ...historical, title: 'Storico corretto', venueId: 'tennis-club-mantova' }, admin, endsAt), { time: endsAt })
  test(`creator cannot correct ${status} metadata`, 'DENY', 'update', owner, historical, { ...historical, title: 'Correzione vietata' }, { time: endsAt })
  for (const change of [{ capacity: 12 }, { startsAt: now + 86_400_000 }, { courts: 3 }, { scoreAccess: 'admin' }, { scoringMode: 'standard' }, { matchMinutes: 20 }]) {
    test(`admin cannot change ${status} draw settings ${JSON.stringify(change)}`, 'DENY', 'update', admin, historical, { ...historical, ...change }, { time: endsAt })
  }
  test(`metadata edits cannot replace ${status} draw`, 'DENY', 'update', admin, historical, { ...historical, title: 'Altro nome', matches: {} }, { time: endsAt })
}

const projectId = JSON.parse(readFileSync('.firebaserc', 'utf8')).projects.default as string
const endpoint = `https://firebaserules.googleapis.com/v1/projects/${projectId}:test`
const client = await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient()
const headers = await client.getRequestHeaders(endpoint)
let failed = 0
// Omit expression traces (the API can fail serializing them) and serialize small batches.
for (let offset = 0; offset < cases.length; offset += 25) {
  const batch = cases.slice(offset, offset + 25)
  const response = await fetch(endpoint, { method: 'POST', headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json', 'x-goog-user-project': projectId },
    body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: readFileSync('firestore.rules', 'utf8') }] }, testSuite: { testCases: batch.map(t => t.testCase) } }) })
  const result = await response.json() as { error?: unknown; issues?: Array<{ severity: string; description: string }>; testResults?: Array<{ state: string; debugMessages?: unknown[]; error?: unknown; functionCalls?: unknown[] }> }
  if (!response.ok || result.error || result.issues?.some(i => i.severity === 'ERROR')) throw new Error(`Batch ${offset + 1}: ${JSON.stringify(result)}`)
  batch.forEach((item, i) => {
    if (result.testResults?.[i]?.state !== 'SUCCESS') { failed++; console.error(item.label, JSON.stringify(result.testResults?.[i])) }
  })
}
console.log(`Tournament Security Rules: ${cases.length - failed}/${cases.length} passed (synthetic resources only).`)
if (failed) process.exitCode = 1
