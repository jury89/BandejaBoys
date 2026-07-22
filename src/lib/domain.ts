import type {
  CreatePollInput,
  MatchRatingPrompt,
  MatchRatingRecord,
  MatchRatingResponse,
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
import { pollWeekTitle } from './format'

export const MAX_STARTERS = 4
export const MAX_SLOTS = 14
export const DEFAULT_VENUE = 'Oasi Boschetto'
export const DEFAULT_VENUE_PHONE = '+390376290058'
export const PROFILE_NAME_MAX_LENGTH = 40
export const MATCH_RATING_DELAY_MS = 10 * 60 * 1000

const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/
const romeDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

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
    const parts = Object.fromEntries(
      romeDateTimeFormatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]),
    )
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

export function getMatchRatingDueAt(slot: PadelSlot): number {
  const startsAt = padelDateTimeToTimestamp(slot.startsAt)
  if (!Number.isFinite(startsAt) || !Number.isFinite(slot.durationMinutes)) return Number.NaN
  return startsAt + slot.durationMinutes * 60 * 1000 + MATCH_RATING_DELAY_MS
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

  return {
    id: getMatchRatingResponseId(poll.id, slot.id, reviewerId),
    pollId: poll.id,
    pollTitle: poll.title,
    slotId: slot.id,
    sessionStartsAt: slot.startsAt,
    sessionEndedAt: dueAt - MATCH_RATING_DELAY_MS,
    dueAt,
    reviewerId,
    teammates: starters
      .filter((signup) => signup.userId !== reviewerId)
      .map((signup) => ({ userId: signup.userId, displayName: signup.displayName })),
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

export function getPlayerMatches(
  polls: PadelPoll[],
  userId: string,
  now = Date.now(),
  receivedRatings: MatchRatingRecord[] = [],
): PlayerMatchLists {
  const matches: Array<PlayerMatch & { startsAt: number; endsAt: number }> = polls
    .flatMap((poll) => poll.slots.map((slot) => {
      const startsAt = padelDateTimeToTimestamp(slot.startsAt)
      return {
        pollId: poll.id,
        pollTitle: poll.title,
        slot,
        startsAt,
        endsAt: startsAt + slot.durationMinutes * 60 * 1000,
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
          const startsAt = padelDateTimeToTimestamp(slot.startsAt)
          return Number.isFinite(startsAt) && startsAt > now
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
  const date = new Date(startsAt)
  if (Number.isNaN(date.getTime())) throw new Error('Scegli una data e un orario validi.')
  if (![0, 30].includes(date.getMinutes()) || date.getSeconds() !== 0 || date.getMilliseconds() !== 0) {
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
  if (!input.targetWeekStart) throw new Error('Scegli la settimana di gioco.')
  if (input.slots.length === 0) throw new Error('Aggiungi almeno uno slot.')
  if (input.slots.length > MAX_SLOTS) throw new Error(`Puoi inserire al massimo ${MAX_SLOTS} slot.`)

  const normalizedSlots = input.slots.map(normalizeSlotInput)
  if (new Set(normalizedSlots.map((slot) => slot.startsAt)).size !== normalizedSlots.length) {
    throw new Error('Hai inserito due slot uguali.')
  }

  return {
    title: pollWeekTitle(input.targetWeekStart),
    targetWeekStart: input.targetWeekStart,
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
  const date = new Date(from)
  date.setHours(12, 0, 0, 0)
  const daysUntilMonday = ((8 - date.getDay()) % 7) || 7
  date.setDate(date.getDate() + daysUntilMonday)
  return toDateInput(date)
}

export function toDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function toDateTimeInput(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${toDateInput(date)}T${hours}:${minutes}`
}

export function defaultSlotForWeek(weekStart: string, dayOffset = 1): string {
  const date = new Date(`${weekStart}T19:30:00`)
  date.setDate(date.getDate() + dayOffset)
  return toDateTimeInput(date)
}
