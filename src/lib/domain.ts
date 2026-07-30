import type {
  CreatePollInput,
  MatchPairing,
  MatchRatingPrompt,
  MatchRatingRecord,
  MatchRatingResponse,
  MatchReport,
  MatchReportPlayer,
  MatchSetInput,
  MatchSetResult,
  MemberProfile,
  PadelPoll,
  PadelSlot,
  PlayerMatch,
  PlayerMatchLists,
  SessionUser,
  Signup,
  SignupRole,
  SlotInput,
  SlotPhase,
} from '../types'
import { mondayOfWeek, PADEL_TIME_ZONE, pollWeekTitle } from './format'

export const MAX_STARTERS = 4
export const MAX_SLOTS = 14
export const DEFAULT_VENUE = 'Oasi Boschetto'
export const DEFAULT_VENUE_PHONE = '+390376290058'
export const PROFILE_NAME_MAX_LENGTH = 40
export const GUEST_NAME_MAX_LENGTH = 40
export const MATCH_RATING_DELAY_MS = 10 * 60 * 1000
export const MAX_MATCH_SETS = 5
export const MAX_MATCH_SET_SCORE = 99

const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/
const romeDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: PADEL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function romeDateTimeParts(value: Date | number): Record<string, string> {
  return Object.fromEntries(
    romeDateTimeFormatter.formatToParts(value).map((part) => [part.type, part.value]),
  )
}

export function padelDateTimeToTimestamp(value: string): number {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value)
  if (!match) return new Date(value).getTime()

  const [, year, month, day, hour, minute, second = '0', milliseconds = '0'] = match
  const wallClock = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(milliseconds.padEnd(3, '0')),
  )
  let candidate = wallClock

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = romeDateTimeParts(candidate)
    const representedWallClock = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
      Number(milliseconds.padEnd(3, '0')),
    )
    const correction = wallClock - representedWallClock
    candidate += correction
    if (correction === 0) break
  }

  return candidate
}

export function profileNameError(displayName: string): string | null {
  const cleanName = displayName.trim()
  if (/evi/i.test(cleanName)) return 'sei un asino'
  if (cleanName.length < 2) return 'Inserisci il nome che vedranno gli amici.'
  if (cleanName.length > PROFILE_NAME_MAX_LENGTH) {
    return `Il nome può avere al massimo ${PROFILE_NAME_MAX_LENGTH} caratteri.`
  }
  return null
}

export function guestNameError(displayName: string): string | null {
  const cleanName = displayName.trim()
  if (cleanName.length < 2) return 'Scrivi il nome dell’ospite.'
  if (cleanName.length > GUEST_NAME_MAX_LENGTH) {
    return `Il nome può avere al massimo ${GUEST_NAME_MAX_LENGTH} caratteri.`
  }
  return null
}

export function makeId(prefix = 'id'): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  return `${prefix}_${random}`
}

export function sortSignups(signups: Signup[]): Signup[] {
  return [...signups].sort(
    (left, right) => left.joinedAt - right.joinedAt || left.id.localeCompare(right.id),
  )
}

export function getStarters(slot: PadelSlot): Signup[] {
  return sortSignups(slot.signups)
    .filter((signup) => signup.role !== 'reserve')
    .slice(0, MAX_STARTERS)
}

export function getMatchRatingResponseId(pollId: string, slotId: string, reviewerId: string): string {
  return [pollId, slotId, reviewerId].join('__')
}

export function getSlotEndsAt(slot: PadelSlot): number {
  const startsAt = padelDateTimeToTimestamp(slot.startsAt)
  if (!Number.isFinite(startsAt) || !Number.isFinite(slot.durationMinutes)) return Number.NaN
  return startsAt + slot.durationMinutes * 60 * 1000
}

export function getMatchRatingDueAt(slot: PadelSlot): number {
  const endsAt = getSlotEndsAt(slot)
  if (!Number.isFinite(endsAt)) return Number.NaN
  return endsAt + MATCH_RATING_DELAY_MS
}

function getRatingPromptForSlot(
  poll: PadelPoll,
  slot: PadelSlot,
  reviewerId: string,
): MatchRatingPrompt | null {
  if (!slot.bookedAt) return null
  const starters = getStarters(slot)
  if (starters.length !== MAX_STARTERS || !starters.some((signup) => signup.userId === reviewerId)) {
    return null
  }

  const dueAt = getMatchRatingDueAt(slot)
  if (!Number.isFinite(dueAt)) return null

  const teammates = starters
    .filter((signup) => signup.userId !== reviewerId && !signup.isGuest)
    .map((signup) => ({ userId: signup.userId, displayName: signup.displayName }))
  if (teammates.length === 0) return null

  return {
    id: getMatchRatingResponseId(poll.id, slot.id, reviewerId),
    pollId: poll.id,
    pollTitle: poll.title,
    slotId: slot.id,
    sessionStartsAt: slot.startsAt,
    sessionEndedAt: dueAt - MATCH_RATING_DELAY_MS,
    dueAt,
    reviewerId,
    teammates,
  }
}

export function getPendingMatchRatingPrompts(
  polls: PadelPoll[],
  responses: MatchRatingResponse[],
  reviewerId: string,
  now = Date.now(),
): MatchRatingPrompt[] {
  const closedPromptIds = new Set(responses.map((response) => response.id))

  return polls
    .flatMap((poll) => poll.slots.map((slot) => getRatingPromptForSlot(poll, slot, reviewerId)))
    .filter((prompt): prompt is MatchRatingPrompt => (
      prompt !== null && prompt.dueAt <= now && !closedPromptIds.has(prompt.id)
    ))
    .sort((left, right) => left.dueAt - right.dueAt || left.id.localeCompare(right.id))
}

export function getNextMatchRatingPromptAt(
  polls: PadelPoll[],
  responses: MatchRatingResponse[],
  reviewerId: string,
  now = Date.now(),
): number | null {
  const closedPromptIds = new Set(responses.map((response) => response.id))
  const nextDueAt = polls
    .flatMap((poll) => poll.slots.map((slot) => getRatingPromptForSlot(poll, slot, reviewerId)))
    .filter((prompt): prompt is MatchRatingPrompt => (
      prompt !== null && prompt.dueAt > now && !closedPromptIds.has(prompt.id)
    ))
    .map((prompt) => prompt.dueAt)
    .sort((left, right) => left - right)[0]

  return nextDueAt ?? null
}

export function getReserves(slot: PadelSlot): Signup[] {
  const starterIds = new Set(getStarters(slot).map((signup) => signup.id))
  return sortSignups(slot.signups).filter((signup) => !starterIds.has(signup.id))
}

export function getSignupPosition(slot: PadelSlot, userId: string): number {
  return sortSignups(slot.signups).findIndex((signup) => signup.userId === userId)
}

export function isStarter(slot: PadelSlot, userId: string): boolean {
  return getStarters(slot).some((signup) => signup.userId === userId)
}

export function getSlotPhase(slot: PadelSlot): SlotPhase {
  if (slot.bookedAt) return 'booked'
  return getStarters(slot).length >= MAX_STARTERS ? 'ready' : 'collecting'
}

export function isBookingCandidate(slot: PadelSlot): boolean {
  return !slot.bookedAt && getStarters(slot).length === MAX_STARTERS
}

function reportPlayers(slot: PadelSlot): MatchReportPlayer[] {
  return getStarters(slot).map((signup) => ({
    userId: signup.userId,
    displayName: signup.displayName,
  }))
}

export function getMatchReportId(pollId: string, slotId: string): string {
  return `${pollId}__${slotId}`
}

export function getMatchPairings(slot: PadelSlot): MatchPairing[] {
  const players = reportPlayers(slot)
  if (players.length !== MAX_STARTERS) return []

  return [
    { teamA: [players[0], players[1]], teamB: [players[2], players[3]] },
    { teamA: [players[0], players[2]], teamB: [players[1], players[3]] },
    { teamA: [players[0], players[3]], teamB: [players[1], players[2]] },
  ]
}

export function matchSetInputsError(slot: PadelSlot, inputs: MatchSetInput[]): string | null {
  const participants = reportPlayers(slot)
  if (participants.length !== MAX_STARTERS) {
    return 'Il referto richiede esattamente quattro titolari.'
  }
  if (inputs.length < 1 || inputs.length > MAX_MATCH_SETS) {
    return `Inserisci da 1 a ${MAX_MATCH_SETS} set.`
  }

  const participantIds = new Set(participants.map((player) => player.userId))
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index]
    const teamIds = input.teamAUserIds
    if (
      teamIds.length !== 2
      || teamIds[0] === teamIds[1]
      || !teamIds.every((userId) => participantIds.has(userId))
    ) {
      return `Scegli una coppia valida per il set ${index + 1}.`
    }
    if (
      !Number.isInteger(input.scoreA)
      || !Number.isInteger(input.scoreB)
      || input.scoreA < 0
      || input.scoreB < 0
      || input.scoreA > MAX_MATCH_SET_SCORE
      || input.scoreB > MAX_MATCH_SET_SCORE
    ) {
      return `Inserisci un punteggio valido per il set ${index + 1}.`
    }
    if (input.scoreA === input.scoreB) {
      return `Il set ${index + 1} non può finire in parità.`
    }
  }

  return null
}

function makeMatchSetResults(
  participants: MatchReportPlayer[],
  inputs: MatchSetInput[],
): MatchSetResult[] {
  const byId = new Map(participants.map((player) => [player.userId, player]))
  return inputs.map((input, index) => {
    const teamAIds = new Set(input.teamAUserIds)
    const teamA = input.teamAUserIds.map((userId) => byId.get(userId)) as [
      MatchReportPlayer,
      MatchReportPlayer,
    ]
    const teamB = participants.filter((player) => !teamAIds.has(player.userId)) as [
      MatchReportPlayer,
      MatchReportPlayer,
    ]
    return {
      id: `set-${index + 1}`,
      teamA,
      teamB,
      scoreA: input.scoreA,
      scoreB: input.scoreB,
    }
  })
}

export function makeMatchReport(
  match: PlayerMatch,
  editor: SessionUser,
  inputs: MatchSetInput[],
  existing?: MatchReport,
  now = Date.now(),
): MatchReport {
  const inputError = matchSetInputsError(match.slot, inputs)
  if (inputError) throw new Error(inputError)

  const id = getMatchReportId(match.pollId, match.slot.id)
  const currentParticipants = reportPlayers(match.slot)
  const currentParticipantIds = currentParticipants.map((player) => player.userId)
  if (
    existing
    && (
      existing.id !== id
      || existing.participantIds.length !== currentParticipantIds.length
      || existing.participantIds.some((userId, index) => userId !== currentParticipantIds[index])
    )
  ) {
    throw new Error('La formazione della partita è cambiata. Aggiorna la pagina e riprova.')
  }

  const participants = currentParticipants
  const participantIds = currentParticipantIds
  return {
    id,
    pollId: match.pollId,
    pollTitle: existing?.pollTitle ?? match.pollTitle,
    slotId: match.slot.id,
    sessionStartsAt: existing?.sessionStartsAt ?? match.slot.startsAt,
    participantIds,
    participants,
    sets: makeMatchSetResults(participants, inputs),
    createdBy: existing?.createdBy ?? editor.id,
    createdByName: existing?.createdByName ?? editor.displayName,
    createdAt: existing?.createdAt ?? now,
    updatedBy: editor.id,
    updatedByName: editor.displayName,
    updatedAt: now,
  }
}

export function getPlayerMatches(
  polls: PadelPoll[],
  userId: string,
  now = Date.now(),
  receivedRatings: MatchRatingRecord[] = [],
  matchReports: MatchReport[] = [],
): PlayerMatchLists {
  const reportsByMatch = new Map(matchReports.map((report) => [
    getMatchReportId(report.pollId, report.slotId),
    report,
  ]))
  const matches: Array<PlayerMatch & { startsAt: number; endsAt: number }> = polls
    .flatMap((poll) => poll.slots.map((slot) => {
      const startsAt = padelDateTimeToTimestamp(slot.startsAt)
      return {
        pollId: poll.id,
        pollTitle: pollWeekTitle(poll.targetWeekStart),
        slot,
        startsAt,
        endsAt: getSlotEndsAt(slot),
      }
    }))
    .filter((match) => (
      Number.isFinite(match.startsAt)
      && Number.isFinite(match.endsAt)
      && getStarters(match.slot).length === MAX_STARTERS
      && isStarter(match.slot, userId)
    ))

  const toPlayerMatch = ({ pollId, pollTitle, slot }: PlayerMatch): PlayerMatch => {
    const scores = receivedRatings
      .filter((rating) => (
        rating.revieweeId === userId
        && rating.pollId === pollId
        && rating.slotId === slot.id
        && Number.isFinite(rating.score)
        && rating.score >= 1
        && rating.score <= 10
      ))
      .map((rating) => rating.score)

    return {
      pollId,
      pollTitle,
      slot,
      report: reportsByMatch.get(getMatchReportId(pollId, slot.id)),
      ...(scores.length > 0 ? {
        receivedRating: {
          average: scores.reduce((total, score) => total + score, 0) / scores.length,
          count: scores.length,
        },
      } : {}),
    }
  }

  return {
    upcoming: matches
      .filter((match) => match.startsAt > now)
      .sort((left, right) => left.startsAt - right.startsAt || left.slot.id.localeCompare(right.slot.id))
      .map(toPlayerMatch),
    past: matches
      .filter((match) => Boolean(match.slot.bookedAt) && match.endsAt <= now)
      .sort((left, right) => right.startsAt - left.startsAt || left.slot.id.localeCompare(right.slot.id))
      .map(toPlayerMatch),
  }
}

export function getUpcomingPolls(polls: PadelPoll[], now = Date.now()): PadelPoll[] {
  return polls
    .map((poll) => ({
      ...poll,
      slots: poll.slots
        .filter((slot) => {
          const endsAt = getSlotEndsAt(slot)
          return Number.isFinite(endsAt) && endsAt > now
        })
        .sort((left, right) => left.startsAt.localeCompare(right.startsAt)),
    }))
    .filter((poll) => poll.slots.length > 0)
    .sort((left, right) => {
      const firstSlotOrder = left.slots[0].startsAt.localeCompare(right.slots[0].startsAt)
      if (firstSlotOrder !== 0) return firstSlotOrder

      return left.targetWeekStart.localeCompare(right.targetWeekStart)
        || left.createdAt - right.createdAt
        || left.id.localeCompare(right.id)
    })
}

export function setSlotBooking(
  slot: PadelSlot,
  bookedBy: Pick<SessionUser, 'id' | 'displayName'> | null,
  bookedAt = Date.now(),
): PadelSlot {
  if (bookedBy) {
    return {
      ...slot,
      venue: DEFAULT_VENUE,
      bookedAt,
      bookedBy: bookedBy.id,
      bookedByName: bookedBy.displayName,
    }
  }

  const unbooked = { ...slot, venue: '' }
  delete unbooked.bookedAt
  delete unbooked.bookedBy
  delete unbooked.bookedByName
  return unbooked
}

export function addSignup(
  slot: PadelSlot,
  member: Pick<MemberProfile, 'id' | 'displayName'>,
  joinedAt = Date.now(),
  role?: SignupRole,
): PadelSlot {
  if (slot.signups.some((signup) => signup.userId === member.id)) return slot

  const selectedRole = role ?? (getStarters(slot).length < MAX_STARTERS ? 'starter' : 'reserve')
  if (selectedRole === 'starter' && getStarters(slot).length >= MAX_STARTERS) {
    throw new Error('I quattro posti da titolare sono già occupati. Segnati come riserva.')
  }

  return {
    ...slot,
    signups: sortSignups([
      ...slot.signups,
      {
        id: makeId('signup'),
        userId: member.id,
        displayName: member.displayName,
        joinedAt,
        role: selectedRole,
      },
    ]),
  }
}

export function addGuestSignup(
  slot: PadelSlot,
  displayName: string,
  addedBy: Pick<MemberProfile, 'id' | 'displayName'>,
  joinedAt = Date.now(),
  role?: SignupRole,
): PadelSlot {
  const cleanName = displayName.trim().replace(/\s+/g, ' ')
  const validationError = guestNameError(cleanName)
  if (validationError) throw new Error(validationError)

  const selectedRole = role ?? (getStarters(slot).length < MAX_STARTERS ? 'starter' : 'reserve')
  if (selectedRole === 'starter' && getStarters(slot).length >= MAX_STARTERS) {
    throw new Error('I quattro posti da titolare sono già occupati. Aggiungilo come riserva.')
  }

  return {
    ...slot,
    signups: sortSignups([
      ...slot.signups,
      {
        id: makeId('signup'),
        userId: makeId('guest'),
        displayName: cleanName,
        joinedAt,
        role: selectedRole,
        isGuest: true,
        addedBy: addedBy.id,
        addedByName: addedBy.displayName,
      },
    ]),
  }
}

export function removeSignup(slot: PadelSlot, userId: string): PadelSlot {
  const starters = getStarters(slot)
  const reserves = getReserves(slot)
  const shouldPromote = starters.length === MAX_STARTERS
    && starters.some((signup) => signup.userId === userId)
    && reserves.length > 0
  const promotedId = shouldPromote ? reserves[0].id : null

  return {
    ...slot,
    signups: sortSignups(slot.signups
      .filter((signup) => signup.userId !== userId)
      .map((signup) => signup.id === promotedId ? { ...signup, role: 'starter' as const } : signup)),
  }
}

export function removeGuestSignup(slot: PadelSlot, signupId: string): PadelSlot {
  const guest = slot.signups.find((signup) => signup.id === signupId && signup.isGuest)
  if (!guest) throw new Error('Ospite non trovato.')
  return removeSignup(slot, guest.userId)
}

export function substituteStarter(
  slot: PadelSlot,
  outgoingUserId: string,
  replacement: Pick<MemberProfile, 'id' | 'displayName'>,
  at = Date.now(),
): PadelSlot {
  const ordered = sortSignups(slot.signups)
  const starters = getStarters(slot)
  const outgoing = starters.find((signup) => signup.userId === outgoingUserId)
  const replacementIsStarter = starters.some((signup) => signup.userId === replacement.id)

  if (!outgoing) {
    throw new Error('Solo un titolare può passare il proprio posto.')
  }
  if (replacement.id === outgoingUserId) {
    throw new Error('Scegli una persona diversa.')
  }
  if (replacementIsStarter) {
    throw new Error('La persona scelta è già tra i titolari.')
  }

  const withoutReplacement = ordered.filter((signup) => signup.userId !== replacement.id)
  const adjustedOutgoingIndex = withoutReplacement.findIndex((signup) => signup.id === outgoing.id)
  withoutReplacement[adjustedOutgoingIndex] = {
    ...outgoing,
    userId: replacement.id,
    displayName: replacement.displayName,
    role: 'starter',
    substitutedFor: {
      userId: outgoing.userId,
      displayName: outgoing.displayName,
      at,
    },
  }

  return { ...slot, signups: withoutReplacement }
}

export function updateSlot(
  poll: PadelPoll,
  slotId: string,
  updater: (slot: PadelSlot) => PadelSlot,
  updatedAt = Date.now(),
): PadelPoll {
  let found = false
  const slots = poll.slots.map((slot) => {
    if (slot.id !== slotId) return slot
    found = true
    return updater(slot)
  })
  if (!found) throw new Error('Slot non trovato.')
  return { ...poll, slots, updatedAt }
}

export function removeSlotFromPoll(
  poll: PadelPoll,
  slotId: string,
  updatedAt = Date.now(),
): PadelPoll {
  if (!poll.slots.some((slot) => slot.id === slotId)) throw new Error('Slot non trovato.')
  if (poll.slots.length === 1) {
    throw new Error('Un sondaggio deve avere almeno uno slot.')
  }

  return {
    ...poll,
    slots: poll.slots.filter((slot) => slot.id !== slotId),
    updatedAt,
  }
}

export function rescheduleSlot(
  poll: PadelPoll,
  slotId: string,
  startsAt: string,
  updatedAt = Date.now(),
): PadelPoll {
  const normalizedStartsAt = normalizeStartsAt(startsAt)
  if (poll.slots.some((slot) => slot.id !== slotId && slot.startsAt === normalizedStartsAt)) {
    throw new Error('Esiste già uno slot con questa data e questo orario.')
  }

  const updated = updateSlot(
    poll,
    slotId,
    (slot) => ({ ...slot, startsAt: normalizedStartsAt }),
    updatedAt,
  )
  return {
    ...updated,
    slots: [...updated.slots].sort((left, right) => left.startsAt.localeCompare(right.startsAt)),
  }
}

function normalizeStartsAt(startsAt: string) {
  const timestamp = padelDateTimeToTimestamp(startsAt)
  if (Number.isNaN(timestamp)) throw new Error('Scegli una data e un orario validi.')

  const localParts = LOCAL_DATE_TIME_PATTERN.exec(startsAt)
  const date = new Date(timestamp)
  const minutes = localParts ? Number(localParts[5]) : date.getUTCMinutes()
  const seconds = localParts ? Number(localParts[6] ?? 0) : date.getUTCSeconds()
  const milliseconds = localParts
    ? Number((localParts[7] ?? '0').padEnd(3, '0'))
    : date.getUTCMilliseconds()
  if (![0, 30].includes(minutes) || seconds !== 0 || milliseconds !== 0) {
    throw new Error('Scegli un orario con minuti 00 oppure 30.')
  }
  return date.toISOString()
}

function normalizeSlotInput(input: SlotInput) {
  if (![60, 90, 120].includes(input.durationMinutes)) {
    throw new Error('Scegli una durata valida per lo slot.')
  }
  return {
    startsAt: normalizeStartsAt(input.startsAt),
    durationMinutes: input.durationMinutes,
  }
}

export function addSlotToPoll(
  poll: PadelPoll,
  input: SlotInput,
  creator: Pick<SessionUser, 'id' | 'displayName'>,
  now = Date.now(),
): PadelPoll {
  if (poll.status !== 'open') throw new Error('Riapri il sondaggio prima di aggiungere uno slot.')
  if (poll.slots.length >= MAX_SLOTS) throw new Error(`Puoi inserire al massimo ${MAX_SLOTS} slot.`)

  const normalized = normalizeSlotInput(input)
  if (poll.slots.some((slot) => slot.startsAt === normalized.startsAt)) {
    throw new Error('Esiste già uno slot con questa data e questo orario.')
  }

  const newSlot: PadelSlot = {
    id: makeId('slot'),
    ...normalized,
    createdAt: now,
    createdBy: creator.id,
    createdByName: creator.displayName,
    venue: '',
    signups: [],
  }

  return {
    ...poll,
    slots: [...poll.slots, newSlot].sort((left, right) => left.startsAt.localeCompare(right.startsAt)),
    updatedAt: now,
  }
}

export function makePoll(
  input: CreatePollInput,
  creator: SessionUser,
  now = Date.now(),
): Omit<PadelPoll, 'id'> {
  const targetWeekStart = mondayOfWeek(input.targetWeekStart)
  if (!targetWeekStart) throw new Error('Scegli la settimana di gioco.')
  if (input.slots.length === 0) throw new Error('Aggiungi almeno uno slot.')
  if (input.slots.length > MAX_SLOTS) throw new Error(`Puoi inserire al massimo ${MAX_SLOTS} slot.`)

  const normalizedSlots = input.slots.map(normalizeSlotInput)
  if (new Set(normalizedSlots.map((slot) => slot.startsAt)).size !== normalizedSlots.length) {
    throw new Error('Hai inserito due slot uguali.')
  }

  return {
    title: pollWeekTitle(targetWeekStart),
    targetWeekStart,
    createdBy: creator.id,
    createdByName: creator.displayName,
    createdAt: now,
    updatedAt: now,
    status: 'open',
    slots: normalizedSlots
      .map((slot, index) => ({
        id: makeId(`slot${index + 1}`),
        startsAt: slot.startsAt,
        durationMinutes: slot.durationMinutes,
        createdAt: now,
        createdBy: creator.id,
        createdByName: creator.displayName,
        venue: '',
        signups: [],
      }))
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt)),
  }
}

export function nextMondayDate(from = new Date()): string {
  const [year, month, day] = toDateInput(from).split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  const daysUntilMonday = ((8 - date.getUTCDay()) % 7) || 7
  date.setUTCDate(date.getUTCDate() + daysUntilMonday)
  return utcDateInput(date)
}

export function toDateInput(date: Date): string {
  const parts = romeDateTimeParts(date)
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function toDateTimeInput(date: Date): string {
  const parts = romeDateTimeParts(date)
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

function utcDateInput(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDaysToDateTimeInput(value: string, days: number): string {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value)
  if (!match) throw new Error('Scegli una data e un orario validi.')

  const [, year, month, day, hour, minute] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + days, 12))
  return `${utcDateInput(date)}T${hour}:${minute}`
}

export function defaultSlotForWeek(weekStart: string, dayOffset = 1): string {
  const normalizedWeekStart = mondayOfWeek(weekStart) ?? weekStart
  return addDaysToDateTimeInput(`${normalizedWeekStart}T19:30`, dayOffset)
}
