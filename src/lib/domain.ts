import type {
  AdminSlotRosterAction,
  CreatePollInput,
  FantasyEntry,
  FantasyLeaderboardContribution,
  FantasyLeaderboardRow,
  FantasyPlayerScore,
  FantasyRound,
  FantasyRoundPlayer,
  FantasyRoundStanding,
  FantasySelectionInput,
  GroupMatch,
  MatchFeedbackLevel,
  MatchFeedbackPrompt,
  MatchFeedbackResponse,
  MatchFeedbackSummary,
  MatchPairing,
  MatchReport,
  MatchReportPlayer,
  MatchSetInput,
  MatchSetResult,
  MatchTeamResultGroup,
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
  SlotWeekGroup,
} from '../types'
import { mondayOfWeek, PADEL_TIME_ZONE, pollWeekTitle, slotWeekTitle, weekStartForDateTime } from './format'

export const MAX_STARTERS = 4
export const MAX_SLOTS = 14
export const DEFAULT_VENUE = 'Oasi Boschetto'
export const DEFAULT_VENUE_PHONE = '+390376290058'
export const PROFILE_NAME_MAX_LENGTH = 40
export const GUEST_NAME_MAX_LENGTH = 40
export const MATCH_FEEDBACK_DELAY_MS = 30 * 60 * 1000
export const MATCH_FEEDBACK_PROMPT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_MATCH_SETS = 5
export const MAX_MATCH_SET_SCORE = 99
export const FANTASY_SETTLEMENT_GRACE_MS = 10 * 60 * 1000
export const FANTASY_FEEDBACK_FALLBACK_DELAY_MS = 24 * 60 * 60 * 1000
export const FANTASY_SETTLEMENT_DELAY_MS = 48 * 60 * 60 * 1000
export const FANTASY_BASE_SCORE = 6
export const FANTASY_STARTER_LEAGUE_POINTS = 2
export const FANTASY_TOP_PERFORMER_LEAGUE_POINTS = 3
export const FANTASY_MISSING_REPORT_VOID_REASON = 'Il referto non è stato inserito entro 48 ore.'

export interface MatchFeedbackLevelDefinition {
  level: MatchFeedbackLevel
  label: string
  description: string
  scoreUnits: number
}

export const MATCH_FEEDBACK_LEVELS: readonly MatchFeedbackLevelDefinition[] = [
  {
    level: 1,
    label: 'Fagiano da brodo',
    description: 'Oggi più che giocare, hai insaporito il campo.',
    scoreUnits: 8,
  },
  {
    level: 2,
    label: 'Fagiano ubriaco',
    description: 'Hai seguito traiettorie che la pallina non aveva nemmeno immaginato.',
    scoreUnits: 10,
  },
  {
    level: 3,
    label: 'Fagiano spaesato',
    description: 'Non hai capito benissimo cosa stesse succedendo, ma spesso eri nel posto giusto.',
    scoreUnits: 12,
  },
  {
    level: 4,
    label: 'Pavone gonfiato',
    description: 'Hai fatto una gran partita e te ne sei accorto almeno mezz’ora prima di tutti gli altri.',
    scoreUnits: 15,
  },
  {
    level: 5,
    label: 'Aquilotto reale',
    description: 'Make Padel Great Again.',
    scoreUnits: 18,
  },
] as const

export function getMatchFeedbackDefinition(level: MatchFeedbackLevel): MatchFeedbackLevelDefinition {
  return MATCH_FEEDBACK_LEVELS.find((definition) => definition.level === level)
    ?? MATCH_FEEDBACK_LEVELS[2]
}

export function getMatchFeedbackScore(level: MatchFeedbackLevel): number {
  return getMatchFeedbackDefinition(level).scoreUnits / 2
}

export function getMatchFeedbackLevelFromAverage(
  scoreUnitsTotal: number,
  ratingCount: number,
): MatchFeedbackLevel {
  if (ratingCount <= 0) return 3
  const averageUnits = scoreUnitsTotal / ratingCount
  return MATCH_FEEDBACK_LEVELS.reduce((closest, candidate) => {
    const closestDistance = Math.abs(closest.scoreUnits - averageUnits)
    const candidateDistance = Math.abs(candidate.scoreUnits - averageUnits)
    return candidateDistance < closestDistance
      || (candidateDistance === closestDistance && candidate.level > closest.level)
      ? candidate
      : closest
  }).level
}

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

export function hasExistingSlotAtDateTime(
  startsAt: string,
  existingSlots: ReadonlyArray<Pick<PadelSlot, 'startsAt'>>,
): boolean {
  const candidateTimestamp = padelDateTimeToTimestamp(startsAt)
  if (!Number.isFinite(candidateTimestamp)) return false

  const candidateMinute = Math.floor(candidateTimestamp / 60_000)
  return existingSlots.some((slot) => {
    const existingTimestamp = padelDateTimeToTimestamp(slot.startsAt)
    return Number.isFinite(existingTimestamp)
      && Math.floor(existingTimestamp / 60_000) === candidateMinute
  })
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

export function isGuestSignup(signup: Signup): boolean {
  return signup.isGuest === true
    || Boolean(signup.addedBy)
    || /^guest[_-]/.test(signup.userId)
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

export function getMatchFeedbackResponseId(pollId: string, slotId: string, reviewerId: string): string {
  return [pollId, slotId, reviewerId].join('__')
}

export function getMatchFeedbackSummaryId(
  pollId: string,
  slotId: string,
  playerId: string,
): string {
  return [pollId, slotId, playerId].join('__')
}

export function aggregateMatchFeedbackSummaries(
  responses: MatchFeedbackResponse[],
): MatchFeedbackSummary[] {
  const summaries = new Map<string, MatchFeedbackSummary>()

  responses.forEach((response) => {
    if (response.status !== 'submitted' || !response.ratings) return

    response.ratings.forEach((rating) => {
      const id = getMatchFeedbackSummaryId(response.pollId, response.slotId, rating.playerId)
      const current = summaries.get(id)
      const isLatest = !current
        || response.closedAt > current.updatedAt
        || (response.closedAt === current.updatedAt && response.id.localeCompare(current.lastResponseId) > 0)

      summaries.set(id, {
        id,
        pollId: response.pollId,
        slotId: response.slotId,
        playerId: rating.playerId,
        scoreUnitsTotal: (current?.scoreUnitsTotal ?? 0) + rating.scoreUnits,
        ratingCount: (current?.ratingCount ?? 0) + 1,
        lastResponseId: isLatest ? response.id : current.lastResponseId,
        updatedAt: isLatest ? response.closedAt : current.updatedAt,
      })
    })
  })

  return [...summaries.values()].sort((left, right) => left.id.localeCompare(right.id))
}

export function getSlotEndsAt(slot: PadelSlot): number {
  const startsAt = padelDateTimeToTimestamp(slot.startsAt)
  if (!Number.isFinite(startsAt) || !Number.isFinite(slot.durationMinutes)) return Number.NaN
  return startsAt + slot.durationMinutes * 60 * 1000
}

export function getMatchFeedbackDueAt(slot: PadelSlot): number {
  const endsAt = getSlotEndsAt(slot)
  if (!Number.isFinite(endsAt)) return Number.NaN
  return endsAt + MATCH_FEEDBACK_DELAY_MS
}

function getFeedbackPromptForSlot(
  poll: PadelPoll,
  slot: PadelSlot,
  voterId: string,
): MatchFeedbackPrompt | null {
  if (!slot.bookedAt) return null
  const starters = getStarters(slot)
  if (starters.length !== MAX_STARTERS || !starters.some((signup) => signup.userId === voterId)) {
    return null
  }

  const dueAt = getMatchFeedbackDueAt(slot)
  if (!Number.isFinite(dueAt)) return null

  const candidates = starters
    .filter((signup) => signup.userId !== voterId && !isGuestSignup(signup))
    .map((signup) => ({ userId: signup.userId, displayName: signup.displayName }))
  if (candidates.length === 0) return null

  return {
    id: getMatchFeedbackResponseId(poll.id, slot.id, voterId),
    pollId: poll.id,
    pollTitle: slotWeekTitle(slot.startsAt),
    slotId: slot.id,
    sessionStartsAt: slot.startsAt,
    sessionEndedAt: dueAt - MATCH_FEEDBACK_DELAY_MS,
    dueAt,
    reviewerId: voterId,
    candidates,
  }
}

export function getPendingMatchFeedbackPrompts(
  polls: PadelPoll[],
  responses: MatchFeedbackResponse[],
  voterId: string,
  now = Date.now(),
): MatchFeedbackPrompt[] {
  const closedPromptIds = new Set(responses.map((response) => response.id))

  return polls
    .flatMap((poll) => poll.slots.map((slot) => getFeedbackPromptForSlot(poll, slot, voterId)))
    .filter((prompt): prompt is MatchFeedbackPrompt => (
      prompt !== null
      && prompt.dueAt <= now
      && now < prompt.dueAt + MATCH_FEEDBACK_PROMPT_EXPIRY_MS
      && !closedPromptIds.has(prompt.id)
    ))
    .sort((left, right) => left.dueAt - right.dueAt || left.id.localeCompare(right.id))
}

export function getNextMatchFeedbackPromptAt(
  polls: PadelPoll[],
  responses: MatchFeedbackResponse[],
  voterId: string,
  now = Date.now(),
): number | null {
  const closedPromptIds = new Set(responses.map((response) => response.id))
  const nextDueAt = polls
    .flatMap((poll) => poll.slots.map((slot) => getFeedbackPromptForSlot(poll, slot, voterId)))
    .filter((prompt): prompt is MatchFeedbackPrompt => (
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

function matchTeamKey(team: MatchReportPlayer[]): string {
  return JSON.stringify(team.map((player) => player.userId).sort())
}

export function groupMatchReportSetsByTeams(
  sets: MatchSetResult[],
): MatchTeamResultGroup[] {
  const groups = new Map<string, MatchTeamResultGroup>()

  sets.forEach((set, index) => {
    const teamAKey = matchTeamKey(set.teamA)
    const teamBKey = matchTeamKey(set.teamB)
    const key = JSON.stringify([teamAKey, teamBKey].sort())
    const existing = groups.get(key)

    if (!existing) {
      groups.set(key, {
        key,
        teamA: set.teamA,
        teamB: set.teamB,
        sets: [{
          setId: set.id,
          setNumber: index + 1,
          scoreA: set.scoreA,
          scoreB: set.scoreB,
        }],
      })
      return
    }

    const sameOrientation = matchTeamKey(existing.teamA) === teamAKey
    existing.sets.push({
      setId: set.id,
      setNumber: index + 1,
      scoreA: sameOrientation ? set.scoreA : set.scoreB,
      scoreB: sameOrientation ? set.scoreB : set.scoreA,
    })
  })

  return [...groups.values()]
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
  feedbackSummaries: MatchFeedbackSummary[] = [],
  matchReports: MatchReport[] = [],
): PlayerMatchLists {
  const reportsByMatch = new Map(matchReports.map((report) => [
    getMatchReportId(report.pollId, report.slotId),
    report,
  ]))
  const summariesByMatch = new Map<string, MatchFeedbackSummary[]>()
  feedbackSummaries.forEach((summary) => {
    const key = getMatchReportId(summary.pollId, summary.slotId)
    summariesByMatch.set(key, [...(summariesByMatch.get(key) ?? []), summary])
  })
  const matches: Array<PlayerMatch & { startsAt: number; endsAt: number }> = polls
    .flatMap((poll) => poll.slots.map((slot) => {
      const startsAt = padelDateTimeToTimestamp(slot.startsAt)
      return {
        pollId: poll.id,
        pollTitle: slotWeekTitle(slot.startsAt),
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
    const matchSummaries = summariesByMatch.get(getMatchReportId(pollId, slot.id)) ?? []
    const summary = matchSummaries.find((candidate) => candidate.playerId === userId)

    return {
      pollId,
      pollTitle,
      slot,
      report: reportsByMatch.get(getMatchReportId(pollId, slot.id)),
      ...(summary && summary.ratingCount > 0 ? {
        receivedFeedback: {
          level: getMatchFeedbackLevelFromAverage(summary.scoreUnitsTotal, summary.ratingCount),
          ratingCount: summary.ratingCount,
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

export function getOtherPlayedMatches(
  polls: PadelPoll[],
  viewerId: string,
  now = Date.now(),
  feedbackSummaries: MatchFeedbackSummary[] = [],
  matchReports: MatchReport[] = [],
): GroupMatch[] {
  const reportsByMatch = new Map(matchReports.map((report) => [
    getMatchReportId(report.pollId, report.slotId),
    report,
  ]))
  const summariesByMatchAndPlayer = new Map(feedbackSummaries.map((summary) => [
    `${getMatchReportId(summary.pollId, summary.slotId)}__${summary.playerId}`,
    summary,
  ]))

  return polls
    .flatMap((poll) => poll.slots.map((slot) => ({
      pollId: poll.id,
      pollTitle: slotWeekTitle(slot.startsAt),
      slot,
      startsAt: padelDateTimeToTimestamp(slot.startsAt),
      endsAt: getSlotEndsAt(slot),
    })))
    .filter((match) => {
      const starters = getStarters(match.slot)
      return (
        Number.isFinite(match.startsAt)
        && Number.isFinite(match.endsAt)
        && Boolean(match.slot.bookedAt)
        && match.endsAt <= now
        && starters.length === MAX_STARTERS
        && !starters.some((signup) => signup.userId === viewerId)
      )
    })
    .sort((left, right) => (
      right.startsAt - left.startsAt || left.slot.id.localeCompare(right.slot.id)
    ))
    .map(({ pollId, pollTitle, slot }) => ({
      pollId,
      pollTitle,
      slot,
      report: reportsByMatch.get(getMatchReportId(pollId, slot.id)),
      playerFeedback: getStarters(slot).map((signup) => {
        const summary = summariesByMatchAndPlayer.get(
          `${getMatchReportId(pollId, slot.id)}__${signup.userId}`,
        )
        return {
          userId: signup.userId,
          level: getMatchFeedbackLevelFromAverage(
            summary?.scoreUnitsTotal ?? 0,
            summary?.ratingCount ?? 0,
          ),
          ratingCount: summary?.ratingCount ?? 0,
        }
      }),
    }))
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function getFantasyRoundId(pollId: string, slotId: string): string {
  return `${pollId}__${slotId}`
}

export function getFantasyRosterKey(participantIds: readonly string[]): string {
  return JSON.stringify([...participantIds])
}

interface FantasyRoundCandidate {
  id: string
  pollId: string
  pollTitle: string
  slotId: string
  slotStartsAt: string
  slotEndsAt: number
  locksAt: number
  settlesAt: number
  participantIds: string[]
  participants: FantasyRoundPlayer[]
  rosterKey: string
}

function fantasyRoundCandidate(poll: PadelPoll, slot: PadelSlot): FantasyRoundCandidate | null {
  const starters = getStarters(slot)
  const locksAt = padelDateTimeToTimestamp(slot.startsAt)
  const slotEndsAt = getSlotEndsAt(slot)
  if (
    !slot.bookedAt
    || starters.length !== MAX_STARTERS
    || starters.some(isGuestSignup)
    || !Number.isFinite(locksAt)
    || !Number.isFinite(slotEndsAt)
  ) {
    return null
  }

  const participants = starters.map((signup) => ({
    userId: signup.userId,
    displayName: signup.displayName,
  }))
  const participantIds = participants.map((participant) => participant.userId)
  return {
    id: getFantasyRoundId(poll.id, slot.id),
    pollId: poll.id,
    pollTitle: slotWeekTitle(slot.startsAt),
    slotId: slot.id,
    slotStartsAt: slot.startsAt,
    slotEndsAt,
    locksAt,
    settlesAt: slotEndsAt + FANTASY_SETTLEMENT_DELAY_MS,
    participantIds,
    participants,
    rosterKey: getFantasyRosterKey(participantIds),
  }
}

export function makeFantasyRound(
  poll: PadelPoll,
  slot: PadelSlot,
  now = Date.now(),
): FantasyRound | null {
  const candidate = fantasyRoundCandidate(poll, slot)
  if (!candidate || candidate.locksAt <= now) return null
  return {
    ...candidate,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  }
}

export function reconcileFantasyRoundRosterMutation(
  poll: PadelPoll,
  slotId: string,
  round: FantasyRound,
  now = poll.updatedAt,
): FantasyRound {
  if (!['open', 'pending'].includes(round.status) || now >= round.locksAt) return round

  const slot = poll.slots.find((item) => item.id === slotId)
  const candidate = slot ? fantasyRoundCandidate(poll, slot) : null
  if (!candidate) {
    return round.status === 'pending'
      ? round
      : suspendFantasyRound(round, now)
  }

  if (candidate.locksAt <= now) return round

  return {
    ...round,
    participantIds: candidate.participantIds,
    participants: candidate.participants,
    rosterKey: candidate.rosterKey,
    status: 'open',
    updatedAt: now,
  }
}

export function fantasySelectionError(
  round: FantasyRound,
  managerId: string,
  input: FantasySelectionInput,
  now = Date.now(),
): string | null {
  if (round.status !== 'open') return 'Questo round è già terminato.'
  if (now >= round.locksAt) return 'Le formazioni sono già state bloccate.'
  if (round.participantIds.includes(managerId)) {
    return 'I quattro titolari non possono partecipare al fantasy di questa partita.'
  }
  if (
    input.playerIds.length !== 2
    || input.playerIds[0] === input.playerIds[1]
    || !input.playerIds.every((userId) => round.participantIds.includes(userId))
  ) {
    return 'Scegli due titolari diversi.'
  }
  if (!input.playerIds.includes(input.captainId)) {
    return 'Scegli il capitano tra i due giocatori selezionati.'
  }
  return null
}

export function makeFantasyEntry(
  round: FantasyRound,
  manager: SessionUser,
  input: FantasySelectionInput,
  existing?: FantasyEntry,
  now = Date.now(),
): FantasyEntry {
  const inputError = fantasySelectionError(round, manager.id, input, now)
  if (inputError) throw new Error(inputError)
  if (existing && (existing.id !== manager.id || existing.roundId !== round.id)) {
    throw new Error('La formazione salvata appartiene a un altro round.')
  }

  return {
    id: manager.id,
    roundId: round.id,
    pollId: round.pollId,
    slotId: round.slotId,
    managerId: manager.id,
    managerName: manager.displayName,
    playerIds: [...input.playerIds],
    captainId: input.captainId,
    rosterKey: round.rosterKey,
    locksAt: round.locksAt,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}

export function fantasyEntryIsCurrent(
  round: FantasyRound,
  entry: FantasyEntry | undefined,
): boolean {
  return Boolean(
    entry
    && entry.roundId === round.id
    && entry.rosterKey === round.rosterKey
    && !round.participantIds.includes(entry.managerId)
    && entry.playerIds.length === 2
    && entry.playerIds[0] !== entry.playerIds[1]
    && entry.playerIds.every((userId) => round.participantIds.includes(userId))
    && entry.playerIds.includes(entry.captainId),
  )
}

function fantasyPlayerScores(
  round: FantasyRound,
  report: MatchReport,
  feedbackSummaries: MatchFeedbackSummary[],
): FantasyPlayerScore[] {
  const feedbackByPlayer = new Map(
    feedbackSummaries
      .filter((summary) => summary.pollId === round.pollId && summary.slotId === round.slotId)
      .map((summary) => [summary.playerId, summary]),
  )
  const statsByPlayer = new Map(round.participants.map((player) => [
    player.userId,
    { setWins: 0, setLosses: 0, gameDifference: 0 },
  ]))

  report.sets.forEach((set) => {
    const teamAWon = set.scoreA > set.scoreB
    set.teamA.forEach((player) => {
      const stats = statsByPlayer.get(player.userId)
      if (!stats) return
      stats.setWins += teamAWon ? 1 : 0
      stats.setLosses += teamAWon ? 0 : 1
      stats.gameDifference += set.scoreA - set.scoreB
    })
    set.teamB.forEach((player) => {
      const stats = statsByPlayer.get(player.userId)
      if (!stats) return
      stats.setWins += teamAWon ? 0 : 1
      stats.setLosses += teamAWon ? 1 : 0
      stats.gameDifference += set.scoreB - set.scoreA
    })
  })

  const baseScores = round.participants.map((player) => {
    const stats = statsByPlayer.get(player.userId)!
    const feedback = feedbackByPlayer.get(player.userId)
    const ratingCount = feedback?.ratingCount ?? 0
    const baseRating = ratingCount > 0
      ? roundTo((feedback?.scoreUnitsTotal ?? 0) / ratingCount / 2, 2)
      : FANTASY_BASE_SCORE
    return {
      ...player,
      scoringModel: 'feedback-v3' as const,
      baseRating,
      ratingCount,
      usedDefaultRating: ratingCount === 0,
      feedbackLevel: getMatchFeedbackLevelFromAverage(
        feedback?.scoreUnitsTotal ?? 0,
        ratingCount,
      ),
      isMvp: false,
      ...stats,
    }
  })
  const bestGameDifference = Math.max(...baseScores.map((score) => score.gameDifference))
  const bestBaseRating = Math.max(...baseScores.map((score) => score.baseRating))

  return baseScores.map((score) => {
    const resultBonus = score.setWins > score.setLosses
      ? 1.5
      : score.setWins < score.setLosses ? -0.5 : 0
    const differenceBonus = bestGameDifference > 0
      && score.gameDifference === bestGameDifference ? 0.5 : 0
    const isTopPerformer = score.baseRating === bestBaseRating
    return {
      ...score,
      resultBonus,
      differenceBonus,
      mvpBonus: 0,
      fantasyScore: roundTo(score.baseRating + resultBonus + differenceBonus, 2),
      isTopPerformer,
    }
  })
}

function fantasyStandingLeaguePoints(rank: number): number {
  if (rank === 1) return 5
  if (rank === 2) return 3
  if (rank === 3) return 1
  return 0
}

function compareFantasyStandings(
  left: Omit<FantasyRoundStanding, 'rank' | 'leaguePoints'>,
  right: Omit<FantasyRoundStanding, 'rank' | 'leaguePoints'>,
): number {
  return right.totalScore - left.totalScore
    || right.captainRating - left.captainRating
    || right.baseRatingTotal - left.baseRatingTotal
    || left.managerName.localeCompare(right.managerName, 'it')
    || left.managerId.localeCompare(right.managerId)
}

function sameFantasyStandingRank(
  left: Omit<FantasyRoundStanding, 'rank' | 'leaguePoints'>,
  right: Omit<FantasyRoundStanding, 'rank' | 'leaguePoints'>,
): boolean {
  return left.totalScore === right.totalScore
    && left.captainRating === right.captainRating
    && left.baseRatingTotal === right.baseRatingTotal
}

export function scoreFantasyRound(
  round: FantasyRound,
  entries: FantasyEntry[],
  report: MatchReport,
  feedbackSummaries: MatchFeedbackSummary[],
  now = Date.now(),
): FantasyRound {
  if (!matchReportMatchesFantasyRound(round, report)) {
    throw new Error('Il referto non corrisponde alla formazione bloccata del round.')
  }

  const playerScores = fantasyPlayerScores(round, report, feedbackSummaries)
  const scoresByPlayer = new Map(playerScores.map((score) => [score.userId, score]))
  const ranked = entries
    .filter((entry) => fantasyEntryIsCurrent(round, entry))
    .map((entry) => {
      const selectedScores = entry.playerIds.map((userId) => scoresByPlayer.get(userId)!)
      const captain = scoresByPlayer.get(entry.captainId)!
      return {
        managerId: entry.managerId,
        managerName: entry.managerName,
        playerIds: entry.playerIds,
        captainId: entry.captainId,
        totalScore: roundTo(
          selectedScores.reduce((total, score) => total + score.fantasyScore, 0)
            + captain.fantasyScore * 0.5
            + ((captain.isTopPerformer ?? captain.isMvp) ? 2 : 0),
          2,
        ),
        captainRating: captain.baseRating,
        baseRatingTotal: roundTo(
          selectedScores.reduce((total, score) => total + score.baseRating, 0),
          2,
        ),
      }
    })
    .sort(compareFantasyStandings)

  let previous: typeof ranked[number] | undefined
  let previousRank = 0
  const standings: FantasyRoundStanding[] = ranked.map((standing, index) => {
    const rank = previous && sameFantasyStandingRank(previous, standing)
      ? previousRank
      : index + 1
    previous = standing
    previousRank = rank
    return {
      ...standing,
      rank,
      leaguePoints: fantasyStandingLeaguePoints(rank),
    }
  })

  const scoredRound: FantasyRound = {
    ...round,
    status: 'scored',
    playerScores,
    standings,
    settledAt: now,
    updatedAt: now,
  }
  delete scoredRound.voidReason
  return scoredRound
}

function matchReportMatchesFantasyRound(round: FantasyRound, report: MatchReport): boolean {
  const reportParticipantIds = new Set(report.participantIds)
  return report.pollId === round.pollId
    && report.slotId === round.slotId
    && reportParticipantIds.size === round.participantIds.length
    && round.participantIds.every((userId) => reportParticipantIds.has(userId))
}

function voidFantasyRound(
  round: FantasyRound,
  reason: string,
  now: number,
): FantasyRound {
  return {
    ...round,
    status: 'void',
    voidReason: reason,
    settledAt: now,
    updatedAt: now,
  }
}

function suspendFantasyRound(round: FantasyRound, now: number): FantasyRound {
  return {
    ...round,
    status: 'pending',
    updatedAt: now,
  }
}

function fantasyCandidateChanged(
  round: FantasyRound,
  candidate: FantasyRoundCandidate,
): boolean {
  return round.pollTitle !== candidate.pollTitle
    || round.slotStartsAt !== candidate.slotStartsAt
    || round.slotEndsAt !== candidate.slotEndsAt
    || round.locksAt !== candidate.locksAt
    || round.settlesAt !== candidate.settlesAt
    || round.rosterKey !== candidate.rosterKey
}

export function reconcileFantasyRounds(
  polls: PadelPoll[],
  existingRounds: FantasyRound[],
  entries: FantasyEntry[],
  feedbackSummaries: MatchFeedbackSummary[],
  feedbackResponses: MatchFeedbackResponse[],
  matchReports: MatchReport[],
  now = Date.now(),
): FantasyRound[] {
  const candidates = new Map<string, FantasyRoundCandidate>()
  polls.forEach((poll) => {
    poll.slots.forEach((slot) => {
      const candidate = fantasyRoundCandidate(poll, slot)
      if (candidate) candidates.set(candidate.id, candidate)
    })
  })
  const reportsByRound = new Map(matchReports.map((report) => [
    getFantasyRoundId(report.pollId, report.slotId),
    report,
  ]))
  const existingById = new Map(existingRounds.map((round) => [round.id, round]))

  const reconciled: FantasyRound[] = existingRounds.map((round) => {
    const candidate = candidates.get(round.id)

    if (round.status === 'void' && round.voidReason === FANTASY_MISSING_REPORT_VOID_REASON) {
      const lateReport = reportsByRound.get(round.id)
      if (!lateReport || !matchReportMatchesFantasyRound(round, lateReport)) return round
      return scoreFantasyRound(
        round,
        entries.filter((entry) => entry.roundId === round.id),
        lateReport,
        feedbackSummaries,
        now,
      )
    }

    if (round.status === 'pending') {
      if (!candidate || candidate.locksAt <= now) return round
      return {
        ...round,
        ...candidate,
        status: 'open',
        updatedAt: now,
      }
    }
    if (round.status !== 'open') return round

    if (now < round.locksAt) {
      if (!candidate) return suspendFantasyRound(round, now)
      if (candidate.locksAt <= now) return round
      return fantasyCandidateChanged(round, candidate)
        ? { ...round, ...candidate, updatedAt: now }
        : round
    }

    if (
      !candidate
      || candidate.rosterKey !== round.rosterKey
      || candidate.locksAt !== round.locksAt
    ) {
      return voidFantasyRound(round, 'La formazione è cambiata al momento del blocco.', now)
    }

    const candidateReport = reportsByRound.get(round.id)
    const report = candidateReport && matchReportMatchesFantasyRound(round, candidateReport)
      ? candidateReport
      : undefined
    const participantIds = new Set(round.participantIds)
    const relevantResponses = feedbackResponses.filter((response) => (
      response.pollId === round.pollId
      && response.slotId === round.slotId
      && participantIds.has(response.reviewerId)
    ))
    const closedVoterIds = new Set(relevantResponses.map((response) => response.reviewerId))
    const feedbackResponseCount = closedVoterIds.size
    const feedbackIsComplete = round.participantIds.every((userId) => closedVoterIds.has(userId))
    const settlementReadyAt = report && feedbackIsComplete
      ? Math.max(
          round.slotEndsAt,
          report.updatedAt,
          ...relevantResponses.map((response) => response.closedAt),
        ) + FANTASY_SETTLEMENT_GRACE_MS
      : undefined
    const progressChanged = round.hasMatchReport !== Boolean(report)
      || round.feedbackResponseCount !== feedbackResponseCount
      || round.settlementReadyAt !== settlementReadyAt
    const roundWithProgress: FantasyRound = progressChanged
      ? {
          ...round,
          hasMatchReport: Boolean(report),
          feedbackResponseCount,
          ...(settlementReadyAt === undefined ? {} : { settlementReadyAt }),
          updatedAt: now,
        }
      : round
    const canSettleWhenComplete = settlementReadyAt !== undefined && now >= settlementReadyAt
    const feedbackFallbackAt = round.slotEndsAt + FANTASY_FEEDBACK_FALLBACK_DELAY_MS
    const canUseFeedbackFallback = Boolean(report)
      && now >= Math.max(feedbackFallbackAt, (report?.updatedAt ?? 0) + FANTASY_SETTLEMENT_GRACE_MS)
    if (now < round.settlesAt && !canSettleWhenComplete && !canUseFeedbackFallback) {
      return roundWithProgress
    }

    if (!report) {
      return voidFantasyRound(roundWithProgress, FANTASY_MISSING_REPORT_VOID_REASON, now)
    }
    return scoreFantasyRound(
      roundWithProgress,
      entries.filter((entry) => entry.roundId === round.id),
      report,
      feedbackSummaries,
      now,
    )
  })

  candidates.forEach((candidate) => {
    if (existingById.has(candidate.id) || candidate.locksAt <= now) return
    reconciled.push({
      ...candidate,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    })
  })

  return reconciled.sort((left, right) => (
    right.locksAt - left.locksAt || left.id.localeCompare(right.id)
  ))
}

export function getFantasyLeaderboard(rounds: FantasyRound[]): FantasyLeaderboardRow[] {
  const rows = new Map<string, Omit<FantasyLeaderboardRow, 'rank'>>()

  const addContribution = ({
    managerId,
    managerName,
    wins,
    contribution,
  }: {
    managerId: string
    managerName: string
    wins: number
    contribution: FantasyLeaderboardContribution
  }) => {
    const current = rows.get(managerId)
    rows.set(managerId, {
      managerId,
      managerName,
      leaguePoints: (current?.leaguePoints ?? 0) + contribution.leaguePoints,
      wins: (current?.wins ?? 0) + wins,
      rawFantasyPoints: roundTo(
        (current?.rawFantasyPoints ?? 0) + contribution.rawFantasyPoints,
        2,
      ),
      roundsPlayed: (current?.roundsPlayed ?? 0) + 1,
      contributions: [...(current?.contributions ?? []), contribution]
        .sort((left, right) => right.playedAt - left.playedAt || left.roundId.localeCompare(right.roundId)),
    })
  }

  rounds
    .filter((round) => round.status === 'scored')
    .forEach((round) => {
      ;(round.standings ?? []).forEach((standing) => {
        addContribution({
          managerId: standing.managerId,
          managerName: standing.managerName,
          wins: standing.rank === 1 ? 1 : 0,
          contribution: {
            roundId: round.id,
            pollTitle: round.pollTitle,
            playedAt: round.locksAt,
            source: 'formation',
            leaguePoints: standing.leaguePoints,
            rawFantasyPoints: standing.totalScore,
            rank: standing.rank,
          },
        })
      })

      const scoresByPlayer = new Map(
        (round.playerScores ?? []).map((score) => [score.userId, score]),
      )
      round.participants.forEach((participant) => {
        const score = scoresByPlayer.get(participant.userId)
        addContribution({
          managerId: participant.userId,
          managerName: participant.displayName,
          wins: 0,
          contribution: {
            roundId: round.id,
            pollTitle: round.pollTitle,
            playedAt: round.locksAt,
            source: score?.isTopPerformer ? 'top-performer' : score?.isMvp ? 'mvp' : 'starter',
            leaguePoints: (score?.isTopPerformer ?? score?.isMvp)
              ? FANTASY_TOP_PERFORMER_LEAGUE_POINTS
              : FANTASY_STARTER_LEAGUE_POINTS,
            rawFantasyPoints: score?.fantasyScore ?? 0,
          },
        })
      })
    })

  const sorted = [...rows.values()].sort((left, right) => (
    right.leaguePoints - left.leaguePoints
    || right.wins - left.wins
    || right.rawFantasyPoints - left.rawFantasyPoints
    || left.managerName.localeCompare(right.managerName, 'it')
    || left.managerId.localeCompare(right.managerId)
  ))

  let previous: typeof sorted[number] | undefined
  let previousRank = 0
  return sorted.map((row, index) => {
    const isTied = previous
      && row.leaguePoints === previous.leaguePoints
      && row.wins === previous.wins
      && row.rawFantasyPoints === previous.rawFantasyPoints
    const rank = isTied ? previousRank : index + 1
    previous = row
    previousRank = rank
    return { ...row, rank }
  })
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

export function getUpcomingSlotWeeks(polls: PadelPoll[], now = Date.now()): SlotWeekGroup[] {
  const groups = new Map<string, SlotWeekGroup>()

  polls.forEach((poll) => {
    poll.slots.forEach((slot) => {
      const endsAt = getSlotEndsAt(slot)
      if (!Number.isFinite(endsAt) || endsAt <= now) return

      const weekStart = weekStartForDateTime(slot.startsAt)
      if (!weekStart) return

      const group = groups.get(weekStart) ?? {
        id: `week-${weekStart}`,
        weekStart,
        entries: [],
      }
      group.entries.push({ poll, slot })
      groups.set(weekStart, group)
    })
  })

  return [...groups.values()]
    .map((group) => ({
      ...group,
      entries: [...group.entries].sort((left, right) => (
        left.slot.startsAt.localeCompare(right.slot.startsAt)
        || left.poll.createdAt - right.poll.createdAt
        || left.slot.id.localeCompare(right.slot.id)
      )),
    }))
    .sort((left, right) => left.weekStart.localeCompare(right.weekStart))
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

export function setSignupRole(
  slot: PadelSlot,
  signupId: string,
  role: SignupRole,
): PadelSlot {
  const signup = slot.signups.find((entry) => entry.id === signupId)
  if (!signup) throw new Error('Giocatore non trovato nello slot.')

  const currentRole = getStarters(slot).some((entry) => entry.id === signupId)
    ? 'starter'
    : 'reserve'
  if (currentRole === role) return slot
  if (role === 'starter' && getStarters(slot).length >= MAX_STARTERS) {
    throw new Error('Sposta prima un titolare tra le riserve.')
  }

  return {
    ...slot,
    signups: sortSignups(slot.signups.map((entry) => (
      entry.id === signupId ? { ...entry, role } : entry
    ))),
  }
}

export function applyAdminSlotRosterAction(
  slot: PadelSlot,
  action: AdminSlotRosterAction,
  changedAt = Date.now(),
): PadelSlot {
  if (action.kind === 'add') {
    if (slot.signups.some((signup) => signup.userId === action.member.id)) {
      throw new Error('Il giocatore è già presente nello slot.')
    }
    return addSignup(slot, action.member, changedAt, action.role)
  }

  const signup = slot.signups.find((entry) => entry.id === action.signupId)
  if (!signup) throw new Error('Giocatore non trovato nello slot.')
  if (action.kind === 'remove') return removeSignup(slot, signup.userId)
  return setSignupRole(slot, signup.id, action.role)
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
  const guest = slot.signups.find((signup) => signup.id === signupId && isGuestSignup(signup))
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
  if (input.slots.length === 0) throw new Error('Aggiungi almeno uno slot.')
  if (input.slots.length > MAX_SLOTS) throw new Error(`Puoi inserire al massimo ${MAX_SLOTS} slot.`)

  const normalizedSlots = input.slots.map(normalizeSlotInput)
  if (new Set(normalizedSlots.map((slot) => slot.startsAt)).size !== normalizedSlots.length) {
    throw new Error('Hai inserito due slot uguali.')
  }
  const targetWeekStart = weekStartForDateTime(normalizedSlots[0].startsAt)
  if (!targetWeekStart) throw new Error('Scegli una data valida per lo slot.')

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
