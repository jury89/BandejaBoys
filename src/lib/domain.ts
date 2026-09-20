import { DEFAULT_VENUE_ID, slotVenueId, slotVenueName, validateVenueId } from './venues'
import { getFantasySeasonForRound } from './fantasySeasons'
import { isSlotAdmin } from './admin'
import type { Tournament, TournamentInput, TournamentMatch, TournamentRegistration, TournamentScore, TournamentStanding, TournamentTeam } from './tournamentTypes'
import type {
  AdminSlotRosterAction,
  CreatePollInput,
  FantasyEntry,
  FantasyCourtStanding,
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
  PlayerMatchPerformance,
  PlayerMatchLists,
  PlayerStatistics,
  PlayerStatisticsRelationship,
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
  existingSlots: ReadonlyArray<Pick<PadelSlot, 'startsAt' | 'venueId'> & Partial<Pick<PadelSlot, 'venue'>>>,
  venueId = DEFAULT_VENUE_ID,
): boolean {
  const candidateTimestamp = padelDateTimeToTimestamp(startsAt)
  if (!Number.isFinite(candidateTimestamp)) return false

  const candidateMinute = Math.floor(candidateTimestamp / 60_000)
  return existingSlots.some((slot) => {
    const existingTimestamp = padelDateTimeToTimestamp(slot.startsAt)
    return slotVenueId(slot) === venueId && Number.isFinite(existingTimestamp)
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

interface PlayerRelationshipAccumulator {
  userId: string
  displayName: string
  setsPlayed: number
  setWins: number
  setLosses: number
  gamesFor: number
  gamesAgainst: number
}

const playerStatisticsClockFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: PADEL_TIME_ZONE,
})

const weekdayIndexByLabel: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

function playerStatisticsSlotClock(startsAt: string): {
  weekday: number
  startMinutes: number
} | null {
  const timestamp = padelDateTimeToTimestamp(startsAt)
  if (!Number.isFinite(timestamp)) return null

  const parts = Object.fromEntries(
    playerStatisticsClockFormatter
      .formatToParts(timestamp)
      .map((part) => [part.type, part.value]),
  )
  const weekday = weekdayIndexByLabel[parts.weekday]
  const hour = Number(parts.hour)
  const minute = Number(parts.minute)
  if (weekday === undefined || !Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return { weekday, startMinutes: hour * 60 + minute }
}

function mostFrequentValue(values: number[]): number | null {
  if (values.length === 0) return null
  const counts = new Map<number, number>()
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1))
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]?.[0] ?? null
}

function relationshipRows(
  relationships: Map<string, PlayerRelationshipAccumulator>,
): PlayerStatisticsRelationship[] {
  return [...relationships.values()]
    .map((relationship) => ({
      ...relationship,
      gameDifference: relationship.gamesFor - relationship.gamesAgainst,
      winRate: relationship.setsPlayed > 0
        ? Math.round((relationship.setWins / relationship.setsPlayed) * 1_000) / 10
        : 0,
    }))
    .sort((left, right) => (
      right.setsPlayed - left.setsPlayed
      || right.winRate - left.winRate
      || left.displayName.localeCompare(right.displayName, 'it')
    ))
}

function addRelationshipSet(
  relationships: Map<string, PlayerRelationshipAccumulator>,
  player: MatchReportPlayer,
  gamesFor: number,
  gamesAgainst: number,
) {
  const current = relationships.get(player.userId) ?? {
    userId: player.userId,
    displayName: player.displayName,
    setsPlayed: 0,
    setWins: 0,
    setLosses: 0,
    gamesFor: 0,
    gamesAgainst: 0,
  }
  current.displayName = player.displayName
  current.setsPlayed += 1
  current.setWins += gamesFor > gamesAgainst ? 1 : 0
  current.setLosses += gamesFor < gamesAgainst ? 1 : 0
  current.gamesFor += gamesFor
  current.gamesAgainst += gamesAgainst
  relationships.set(player.userId, current)
}

export function getPlayerMatchPerformance(
  match: PlayerMatch,
  playerId: string,
): PlayerMatchPerformance {
  const performance: PlayerMatchPerformance = {
    pollId: match.pollId,
    slotId: match.slot.id,
    setsPlayed: 0,
    setWins: 0,
    setLosses: 0,
    gamesFor: 0,
    gamesAgainst: 0,
    gameDifference: 0,
  }

  match.report?.sets.forEach((set) => {
    const playsForA = set.teamA.some((player) => player.userId === playerId)
    const playsForB = set.teamB.some((player) => player.userId === playerId)
    if (playsForA === playsForB) return

    const gamesFor = playsForA ? set.scoreA : set.scoreB
    const gamesAgainst = playsForA ? set.scoreB : set.scoreA
    performance.setsPlayed += 1
    performance.setWins += gamesFor > gamesAgainst ? 1 : 0
    performance.setLosses += gamesFor < gamesAgainst ? 1 : 0
    performance.gamesFor += gamesFor
    performance.gamesAgainst += gamesAgainst
  })
  performance.gameDifference = performance.gamesFor - performance.gamesAgainst
  return performance
}

export function getPlayerStatistics(
  matches: PlayerMatch[],
  playerId: string,
  feedbackSummaries: MatchFeedbackSummary[] = [],
): PlayerStatistics {
  const performances = matches.map((match) => getPlayerMatchPerformance(match, playerId))
  const reportedPerformances = performances.filter((performance) => performance.setsPlayed > 0)
  const teammates = new Map<string, PlayerRelationshipAccumulator>()
  const opponents = new Map<string, PlayerRelationshipAccumulator>()
  const clocks = matches
    .map((match) => playerStatisticsSlotClock(match.slot.startsAt))
    .filter((clock): clock is NonNullable<typeof clock> => Boolean(clock))
  let longestSetWinStreak = 0
  let currentSetWinStreak = 0
  let biggestSetWin: number | null = null
  let biggestSetLoss: number | null = null
  let tieBreakWins = 0
  let tieBreakLosses = 0

  ;[...matches]
    .sort((left, right) => (
      padelDateTimeToTimestamp(left.slot.startsAt) - padelDateTimeToTimestamp(right.slot.startsAt)
      || left.slot.id.localeCompare(right.slot.id)
    ))
    .forEach((match) => {
      match.report?.sets.forEach((set) => {
        const playsForA = set.teamA.some((player) => player.userId === playerId)
        const playsForB = set.teamB.some((player) => player.userId === playerId)
        if (playsForA === playsForB) return

        const ownTeam = playsForA ? set.teamA : set.teamB
        const opposingTeam = playsForA ? set.teamB : set.teamA
        const gamesFor = playsForA ? set.scoreA : set.scoreB
        const gamesAgainst = playsForA ? set.scoreB : set.scoreA
        const won = gamesFor > gamesAgainst
        const margin = Math.abs(gamesFor - gamesAgainst)
        const teammate = ownTeam.find((player) => player.userId !== playerId)
        if (teammate) addRelationshipSet(teammates, teammate, gamesFor, gamesAgainst)
        opposingTeam.forEach((opponent) => {
          addRelationshipSet(opponents, opponent, gamesFor, gamesAgainst)
        })

        if (won) {
          currentSetWinStreak += 1
          longestSetWinStreak = Math.max(longestSetWinStreak, currentSetWinStreak)
          biggestSetWin = Math.max(biggestSetWin ?? 0, margin)
        } else {
          currentSetWinStreak = 0
          biggestSetLoss = Math.max(biggestSetLoss ?? 0, margin)
        }

        if (Math.max(gamesFor, gamesAgainst) === 7 && Math.min(gamesFor, gamesAgainst) === 6) {
          if (won) tieBreakWins += 1
          else tieBreakLosses += 1
        }
      })
    })

  const matchKeys = new Set(matches.map((match) => getMatchReportId(match.pollId, match.slot.id)))
  const playerFeedback = feedbackSummaries.filter((summary) => (
    summary.playerId === playerId
    && summary.ratingCount > 0
    && matchKeys.has(getMatchReportId(summary.pollId, summary.slotId))
  ))
  const feedbackCount = playerFeedback.reduce((total, summary) => total + summary.ratingCount, 0)
  const scoreUnitsTotal = playerFeedback.reduce(
    (total, summary) => total + summary.scoreUnitsTotal,
    0,
  )
  const setWins = reportedPerformances.reduce((total, performance) => total + performance.setWins, 0)
  const setLosses = reportedPerformances.reduce((total, performance) => total + performance.setLosses, 0)
  const setsPlayed = setWins + setLosses
  const gamesFor = reportedPerformances.reduce((total, performance) => total + performance.gamesFor, 0)
  const gamesAgainst = reportedPerformances.reduce(
    (total, performance) => total + performance.gamesAgainst,
    0,
  )

  return {
    appearances: matches.length,
    totalMinutes: matches.reduce((total, match) => total + match.slot.durationMinutes, 0),
    reportedMatches: reportedPerformances.length,
    positiveMatches: reportedPerformances.filter(
      (performance) => performance.setWins > performance.setLosses,
    ).length,
    setsPlayed,
    setWins,
    setLosses,
    setWinRate: setsPlayed > 0 ? Math.round((setWins / setsPlayed) * 1_000) / 10 : 0,
    gamesFor,
    gamesAgainst,
    gameDifference: gamesFor - gamesAgainst,
    longestSetWinStreak,
    biggestSetWin,
    biggestSetLoss,
    tieBreakWins,
    tieBreakLosses,
    favoriteWeekday: mostFrequentValue(clocks.map((clock) => clock.weekday)),
    favoriteStartMinutes: mostFrequentValue(clocks.map((clock) => clock.startMinutes)),
    ...(feedbackCount > 0 ? {
      feedbackLevel: getMatchFeedbackLevelFromAverage(scoreUnitsTotal, feedbackCount),
    } : {}),
    feedbackCount,
    feedbackMatches: playerFeedback.length,
    teammates: relationshipRows(teammates),
    opponents: relationshipRows(opponents),
    performances,
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

/** Use the match's season, never today's date or the later settlement date. */
export function getFantasyCourtStandings(round: FantasyRound): FantasyCourtStanding[] {
  if (round.status !== 'scored' || getFantasySeasonForRound(round).courtScoring !== 'placement-v2') return []
  const scoresByPlayer = new Map((round.playerScores ?? []).map((score) => [score.userId, score]))
  // An incomplete/corrupt score snapshot must not award invented placement points.
  if (round.participants.length !== MAX_STARTERS
    || new Set(round.participants.map((player) => player.userId)).size !== MAX_STARTERS
    || round.participants.some((player) => !Number.isFinite(scoresByPlayer.get(player.userId)?.fantasyScore))) return []
  const players = round.participants.map((player) => ({
    ...player,
    fantasyScore: scoresByPlayer.get(player.userId)!.fantasyScore,
  }))
  return players.map((player) => {
    // Competition ranking: two first places occupy positions 1 and 2, next is third.
    const rank = 1 + players.filter((other) => other.fantasyScore > player.fantasyScore).length
    return {
      ...player,
      rank,
      tied: players.filter((other) => other.fantasyScore === player.fantasyScore).length > 1,
      leaguePoints: fantasyStandingLeaguePoints(rank),
    }
  }).sort((left, right) => left.rank - right.rank || left.userId.localeCompare(right.userId))
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

      if (getFantasySeasonForRound(round).courtScoring === 'placement-v2') {
        getFantasyCourtStandings(round).forEach((standing) => {
          addContribution({
            managerId: standing.userId,
            managerName: standing.displayName,
            // Preserve the existing general-ranking tiebreak: wins of fantasy formations.
            wins: 0,
            contribution: {
              roundId: round.id,
              pollTitle: round.pollTitle,
              playedAt: round.locksAt,
              source: 'court-placement',
              leaguePoints: standing.leaguePoints,
              rawFantasyPoints: standing.fantasyScore,
              rank: standing.rank,
              tied: standing.tied,
            },
          })
        })
        return
      }

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
      venue: slotVenueName(slot),
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
  source?: Signup['source'],
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
        ...(source ? { source } : {}),
      },
    ]),
  }
}

/** Claim a free starter place without deleting/recreating the member's signup. */
export function promoteOwnSignup(slot: PadelSlot, userId: string): PadelSlot {
  const signup = slot.signups.find((entry) => entry.userId === userId && !isGuestSignup(entry))
  if (!signup) throw new Error('Non risulti iscritto a questo slot.')
  if (isStarter(slot, userId)) return slot
  if (getStarters(slot).length >= MAX_STARTERS) {
    throw new Error('I quattro posti da titolare sono già occupati. Rimani in riserva.')
  }
  return setSignupRole(slot, signup.id, 'starter')
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
  const currentSlot = poll.slots.find((slot) => slot.id === slotId)
  if (poll.slots.some((slot) => slot.id !== slotId && slot.startsAt === normalizedStartsAt && currentSlot && slotVenueId(slot) === slotVenueId(currentSlot))) {
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
    venueId: validateVenueId(input.venueId),
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
  if (poll.slots.some((slot) => slot.startsAt === normalized.startsAt && slotVenueId(slot) === normalized.venueId)) {
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
  if (new Set(normalizedSlots.map((slot) => `${slot.startsAt}:${slot.venueId}`)).size !== normalizedSlots.length) {
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
        venueId: slot.venueId,
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

// Tournaments are independent of ordinary slots and fantasy seasons.
export const TOURNAMENT_SIGNUP_LEAD_MS = 60 * 60_000

export function tournamentUsesRotatingPairs(tournament: Pick<TournamentInput, 'format'>): boolean {
  return tournament.format === 'americano' || tournament.format === 'mexicano'
}

export function tournamentUsesTimedMatches(tournament: Pick<TournamentInput, 'format' | 'scoringMode'>): boolean {
  return tournament.format === 'round-robin' && tournament.scoringMode === 'timed'
}

export function getTimedTournamentPlan(input: TournamentInput, playerCount = input.capacity) {
  const teams = playerCount / 2
  const rounds = teams % 2 ? teams : teams - 1
  const minutes = input.matchMinutes ?? 15, warmup = input.warmupMinutes ?? 5, changeover = input.changeoverMinutes ?? 2
  return { teams, rounds, requiredCourts: Math.floor(teams / 2), matchesPerPair: teams - 1,
    playingMinutes: (teams - 1) * minutes, totalMinutes: warmup + rounds * minutes + (rounds - 1) * changeover,
    schedule: Array.from({ length: rounds }, (_, i) => ({ round: i + 1,
      startsAt: input.startsAt + (warmup + i * (minutes + changeover)) * 60_000,
      endsAt: input.startsAt + (warmup + i * (minutes + changeover) + minutes) * 60_000 })) }
}

export function getTournamentRoundClock(tournament: Tournament, now: number) {
  const durationSeconds = (tournament.matchMinutes ?? 15) * 60
  const endsAt = typeof tournament.roundStartedAt === 'number'
    ? tournament.roundStartedAt + durationSeconds * 1000 : null
  // The UI tick may be a fraction of a second older than the newly saved start.
  return { endsAt, remainingSeconds: endsAt === null ? durationSeconds : Math.min(durationSeconds, Math.max(0, Math.ceil((endsAt - now) / 1000))),
    state: endsAt === null ? 'waiting' as const : now < endsAt ? 'running' as const : 'expired' as const }
}

export function validateTournamentInput(input: TournamentInput, now: number): TournamentInput {
  const title = input.title.trim()
  if (title.length < 3 || title.length > 80) throw new Error('Il nome del torneo deve avere da 3 a 80 caratteri.')
  if (!Number.isFinite(input.startsAt) || input.startsAt <= now + TOURNAMENT_SIGNUP_LEAD_MS) throw new Error('Scegli un inizio distante più di un’ora.')
  if (!['americano', 'mexicano', 'round-robin', 'knockout'].includes(input.format)) throw new Error('Scegli una formula valida.')
  const rotating = tournamentUsesRotatingPairs(input)
  if (rotating ? input.pairing !== 'rotating' : !['random-fixed', 'chosen-fixed'].includes(input.pairing)) throw new Error('La scelta delle coppie non è compatibile con la formula.')
  tournamentPlayerCountError(input.capacity, input.format)
  if (!Number.isInteger(input.courts) || input.courts < 1 || input.courts > 8) throw new Error('Scegli da 1 a 8 campi.')
  if (!Number.isInteger(input.rounds) || input.rounds < 1 || input.rounds > 31) throw new Error('Scegli da 1 a 31 turni.')
  if (![16, 24, 32].includes(input.pointsPerMatch)) throw new Error('Scegli 16, 24 o 32 punti per incontro.')
  if (!['players', 'admin'].includes(input.scoreAccess)) throw new Error('Scegli chi può inserire i risultati.')
  const scoringMode = input.scoringMode ?? 'standard'
  if (!['standard', 'timed'].includes(scoringMode) || (scoringMode === 'timed' && input.format !== 'round-robin')) throw new Error('Le partite a tempo sono disponibili nel girone all’italiana.')
  const matchMinutes = input.matchMinutes ?? 15, warmupMinutes = input.warmupMinutes ?? 5, changeoverMinutes = input.changeoverMinutes ?? 2
  if (!Number.isInteger(matchMinutes) || matchMinutes < 5 || matchMinutes > 30) throw new Error('La durata della partita deve essere tra 5 e 30 minuti.')
  if (!Number.isInteger(warmupMinutes) || warmupMinutes < 0 || warmupMinutes > 15) throw new Error('Il riscaldamento deve essere tra 0 e 15 minuti.')
  if (!Number.isInteger(changeoverMinutes) || changeoverMinutes < 0 || changeoverMinutes > 5) throw new Error('Il cambio campo deve essere tra 0 e 5 minuti.')
  if (scoringMode === 'timed' && input.courts < Math.floor(input.capacity / 4)) throw new Error(`Servono almeno ${Math.floor(input.capacity / 4)} campi: le partite del turno a tempo iniziano insieme.`)
  return { title, startsAt: input.startsAt, venueId: validateVenueId(input.venueId), format: input.format,
    pairing: input.pairing, capacity: input.capacity, courts: input.courts, rounds: input.rounds,
    pointsPerMatch: input.pointsPerMatch, scoreAccess: input.scoreAccess, scoringMode, matchMinutes, warmupMinutes, changeoverMinutes }
}

function tournamentPlayerCountError(count: number, format: TournamentInput['format']): void {
  if (!Number.isInteger(count) || count > 32 || count < 4) throw new Error('Servono da 4 a 32 iscritti.')
  if (format === 'knockout' && ![8, 16, 32].includes(count)) throw new Error('L’eliminazione diretta richiede 8, 16 o 32 iscritti, per includere la finale del terzo posto.')
  if (format === 'round-robin' && (count < 6 || count % 2)) throw new Error('Il girone richiede un numero pari di iscritti, almeno 6 per assegnare il podio.')
  if ((format === 'americano' || format === 'mexicano') && count % 4) throw new Error('La formula richiede un numero di iscritti multiplo di 4, così tutti giocano a ogni turno.')
}

export function canManageTournament(tournament: Pick<Tournament, 'createdBy'>, actorId: string): boolean {
  return Boolean(actorId) && (tournament.createdBy === actorId || isSlotAdmin(actorId))
}

function requireTournamentManager(tournament: Tournament, actorId: string): void {
  if (!canManageTournament(tournament, actorId)) throw new Error('Solo l’organizzatore e l’amministratore possono gestire questo torneo.')
}

export function makeTournament(id: string, input: TournamentInput, actorId: string, now = Date.now()): Tournament {
  if (!actorId.trim()) throw new Error('Accedi per creare un torneo.')
  return { ...validateTournamentInput(input, now), id, published: false, status: 'draft', createdBy: actorId,
    createdAt: now, updatedAt: now, registrations: {}, teams: [], matches: {}, currentRound: 0, totalRounds: 0, seed: 0, roundStartedAt: null }
}

export function editTournament(tournament: Tournament, input: TournamentInput, actorId: string, now = Date.now()): Tournament {
  requireTournamentManager(tournament, actorId)
  if (tournament.status !== 'draft') throw new Error('Le impostazioni sono bloccate dopo la pubblicazione.')
  return { ...tournament, ...validateTournamentInput(input, now), updatedAt: now }
}

export function publishTournament(tournament: Tournament, actorId: string, now = Date.now()): Tournament {
  requireTournamentManager(tournament, actorId)
  if (tournament.status !== 'draft') throw new Error('Il torneo non è una bozza.')
  validateTournamentInput(tournament, now)
  return { ...tournament, status: 'open', published: true, updatedAt: now }
}

export function cancelTournament(tournament: Tournament, actorId: string, now = Date.now()): Tournament {
  requireTournamentManager(tournament, actorId)
  if (tournament.status === 'completed' || tournament.status === 'cancelled') throw new Error('Il torneo è già concluso.')
  return { ...tournament, status: 'cancelled', updatedAt: now }
}

export function tournamentRegistrationsOpen(tournament: Tournament, now: number): boolean {
  return tournament.published && tournament.status === 'open' && now < tournament.startsAt - TOURNAMENT_SIGNUP_LEAD_MS
}

export function registerForTournament(tournament: Tournament, user: Pick<SessionUser, 'id' | 'displayName'>, partnerId: string | null, now = Date.now()): Tournament {
  if (!tournamentRegistrationsOpen(tournament, now)) throw new Error('Le iscrizioni chiudono un’ora prima dell’inizio.')
  const existing = tournament.registrations[user.id]
  if (!existing && Object.keys(tournament.registrations).length >= tournament.capacity) throw new Error('Il torneo è completo.')
  if (partnerId && (tournament.pairing !== 'chosen-fixed' || partnerId === user.id || !tournament.registrations[partnerId])) throw new Error('Scegli un altro giocatore già iscritto.')
  const registration: TournamentRegistration = { userId: user.id, displayName: user.displayName, joinedAt: existing?.joinedAt ?? now, partnerId }
  return { ...tournament, updatedAt: now, registrations: { ...tournament.registrations, [user.id]: registration } }
}

export function leaveTournament(tournament: Tournament, userId: string, now = Date.now()): Tournament {
  if (!tournamentRegistrationsOpen(tournament, now)) throw new Error('Le iscrizioni sono chiuse: contatta l’organizzatore.')
  const registrations = { ...tournament.registrations }
  delete registrations[userId]
  // Other players' choices are not modified on their behalf. A non-reciprocal choice is visibly unconfirmed.
  return { ...tournament, registrations, updatedAt: now }
}

export function saveTournamentGuest(tournament: Tournament, guestId: string, displayName: string, partnerId: string | null, actorId: string, now = Date.now()): Tournament {
  requireTournamentManager(tournament, actorId)
  if (!guestId.startsWith('guest:') || (tournament.registrations[guestId] && !tournament.registrations[guestId].isGuest)) throw new Error('Ospite non valido.')
  const name = displayName.trim()
  if (!name || name.length > 80) throw new Error('Il nome dell’ospite deve avere da 1 a 80 caratteri.')
  const next = registerForTournament(tournament, { id: guestId, displayName: name }, partnerId, now)
  return { ...next, registrations: { ...next.registrations, [guestId]: { ...next.registrations[guestId], isGuest: true } } }
}

export function removeTournamentGuest(tournament: Tournament, guestId: string, actorId: string, now = Date.now()): Tournament {
  requireTournamentManager(tournament, actorId)
  if (!tournament.registrations[guestId]?.isGuest) throw new Error('Puoi rimuovere solo un ospite esterno.')
  return leaveTournament(tournament, guestId, now)
}

function tournamentShuffle<T>(items: T[], seed: number): T[] {
  const shuffled = [...items]
  let state = seed >>> 0
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const j = Math.floor((state / 4294967296) * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function tournamentTeam(a: string, b: string): TournamentTeam {
  return { id: JSON.stringify([a, b].sort()), playerIds: [a, b] }
}

function tournamentMatch(tournament: Tournament, round: number, index: number, teamA: TournamentTeam, teamB: TournamentTeam, stage: TournamentMatch['stage'] = 'regular'): TournamentMatch {
  return { id: `r${round}-m${index + 1}`, round, court: index % tournament.courts + 1,
    wave: Math.floor(index / tournament.courts) + 1, teamA, teamB, stage }
}

function circlePairs<T>(items: T[], roundIndex: number): Array<[T | null, T | null]> {
  const circle: Array<T | null> = [...items]
  if (circle.length % 2) circle.push(null)
  for (let i = 0; i < roundIndex % (circle.length - 1); i += 1) circle.splice(1, 0, circle.pop()!)
  return Array.from({ length: circle.length / 2 }, (_, i) => [circle[i], circle[circle.length - 1 - i]])
}

function rotatingTournamentRound(tournament: Tournament, orderedIds: string[], round: number): TournamentMatch[] {
  const teams = tournament.format === 'americano'
    ? circlePairs(orderedIds, round - 1).map(([a, b]) => tournamentTeam(a!, b!))
    : orderedIds.flatMap((_, i) => i % 4 === 0 ? [tournamentTeam(orderedIds[i], orderedIds[i + 3]), tournamentTeam(orderedIds[i + 1], orderedIds[i + 2])] : [])
  return teams.flatMap((team, i) => i % 2 === 0 ? [tournamentMatch(tournament, round, i / 2, team, teams[i + 1])] : [])
}

export function startTournament(tournament: Tournament, actorId: string, seed: number, now = Date.now()): Tournament {
  requireTournamentManager(tournament, actorId)
  if (tournament.status !== 'open' || !tournament.published) throw new Error('Pubblica il torneo prima di preparare il tabellone.')
  if (now < tournament.startsAt - TOURNAMENT_SIGNUP_LEAD_MS) throw new Error('Aspetta la chiusura delle iscrizioni per il sorteggio.')
  const ids = Object.keys(tournament.registrations).sort()
  tournamentPlayerCountError(ids.length, tournament.format)
  if (ids.length > tournament.capacity) throw new Error('Gli iscritti superano la capienza del torneo.')
  if (tournamentUsesTimedMatches(tournament) && tournament.courts < Math.floor(ids.length / 4)) throw new Error('Non ci sono abbastanza campi per avviare tutte le partite insieme.')
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('Sorteggio non valido.')
  const shuffled = tournamentShuffle(ids, seed)
  let teams: TournamentTeam[] = []
  let matches: TournamentMatch[] = []
  let totalRounds = tournament.rounds
  if (tournamentUsesRotatingPairs(tournament)) {
    for (let r = 1; r <= (tournament.format === 'americano' ? totalRounds : 1); r += 1) matches.push(...rotatingTournamentRound(tournament, shuffled, r))
  } else {
    if (tournament.pairing === 'chosen-fixed') {
      const paired = new Set<string>()
      ids.forEach((id) => {
        if (paired.has(id)) return
        const partner = tournament.registrations[id].partnerId
        if (!partner || partner === id || tournament.registrations[partner]?.partnerId !== id || paired.has(partner)) throw new Error('Tutti devono avere un compagno confermato reciprocamente prima del sorteggio.')
        teams.push(tournamentTeam(id, partner)); paired.add(id); paired.add(partner)
      })
      teams = tournamentShuffle(teams, seed)
    } else teams = shuffled.flatMap((id, i) => i % 2 === 0 ? [tournamentTeam(id, shuffled[i + 1])] : [])
    if (tournament.format === 'round-robin') {
      totalRounds = teams.length % 2 ? teams.length : teams.length - 1
      for (let r = 1; r <= totalRounds; r += 1) {
        circlePairs(teams, r - 1).filter((pair) => pair[0] && pair[1]).forEach(([a, b], i) => matches.push(tournamentMatch(tournament, r, i, a!, b!)))
      }
    } else {
      totalRounds = Math.log2(teams.length)
      matches = teams.flatMap((team, i) => i % 2 === 0 ? [tournamentMatch(tournament, 1, i / 2, team, teams[i + 1])] : [])
    }
  }
  return { ...tournament, status: 'running', seed, teams, totalRounds, currentRound: 1,
    matches: Object.fromEntries(matches.map((match) => [match.id, match])), updatedAt: now, roundStartedAt: null }
}

export function startTournamentRound(tournament: Tournament, actorId: string, now = Date.now()): Tournament {
  requireTournamentManager(tournament, actorId)
  if (!tournamentUsesTimedMatches(tournament) || tournament.status !== 'running') throw new Error('Il timer è disponibile solo per un girone a tempo in corso.')
  if (now < tournament.startsAt) throw new Error('Aspetta l’orario d’inizio del torneo.')
  if (tournament.roundStartedAt != null) throw new Error('Il timer di questo turno è già stato avviato.')
  return { ...tournament, roundStartedAt: now, updatedAt: now }
}

export function tournamentScoreIsValid(tournament: Pick<Tournament, 'format' | 'pointsPerMatch' | 'scoringMode'>, a: number, b: number): boolean {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return false
  if (tournamentUsesTimedMatches(tournament)) return a <= 99 && b <= 99
  if (tournamentUsesRotatingPairs(tournament)) return a + b === tournament.pointsPerMatch
  const high = Math.max(a, b), low = Math.min(a, b)
  return (high === 6 && low <= 4) || (high === 7 && (low === 5 || low === 6))
}

export function makeTournamentScore(tournament: Tournament, matchId: string, a: number, b: number, actorId: string, previous: TournamentScore | undefined, expectedRevision: number, now = Date.now()): TournamentScore {
  const match = tournament.matches[matchId]
  if (!match || tournament.status !== 'running' || match.round !== tournament.currentRound) throw new Error('Puoi correggere soltanto i risultati del turno corrente, prima di avanzare.')
  if (now < tournament.startsAt) throw new Error('I risultati si inseriscono dall’orario d’inizio del torneo.')
  if (tournamentUsesTimedMatches(tournament) && (tournament.roundStartedAt == null || now < tournament.roundStartedAt)) throw new Error('L’organizzatore deve prima avviare il timer del turno.')
  if (!canManageTournament(tournament, actorId) && (tournament.scoreAccess !== 'players' || ![...match.teamA.playerIds, ...match.teamB.playerIds].includes(actorId))) throw new Error('Puoi inserire solo i risultati delle tue partite.')
  if ((previous?.revision ?? 0) !== expectedRevision) throw new Error('Qualcuno ha aggiornato questo risultato. Riapri la partita per vedere l’ultima versione.')
  if (!tournamentScoreIsValid(tournament, a, b)) throw new Error(tournamentUsesTimedMatches(tournament) ? 'Inserisci i game completati: numeri interi da 0 a 99, anche in pareggio.' : tournamentUsesRotatingPairs(tournament) ? `I punti delle due coppie devono sommare ${tournament.pointsPerMatch}.` : 'Risultato valido: 6–0 fino a 6–4, 7–5 oppure 7–6 (anche a squadre invertite).')
  return { matchId, scoreA: a, scoreB: b, updatedBy: actorId, updatedAt: now, revision: expectedRevision + 1 }
}

export function getTournamentStandings(tournament: Tournament, scores: TournamentScore[]): TournamentStanding[] {
  const individual = tournamentUsesRotatingPairs(tournament)
  const rows: TournamentStanding[] = (individual ? Object.keys(tournament.registrations).map((id) => ({ id, playerIds: [id] })) : tournament.teams)
    .map((team) => ({ ...team, played: 0, wins: 0, draws: 0, tablePoints: 0, pointsFor: 0, pointsAgainst: 0, rank: 0, tied: false }))
  const byId = new Map(rows.map((row) => [row.id, row]))
  const placements = new Map<string, number>()
  for (const match of Object.values(tournament.matches)) {
    const score = scores.find((s) => s.matchId === match.id)
    if (!score || !tournamentScoreIsValid(tournament, score.scoreA, score.scoreB)) continue
    for (const [team, own, other] of [[match.teamA, score.scoreA, score.scoreB], [match.teamB, score.scoreB, score.scoreA]] as const) {
      for (const id of individual ? team.playerIds : [team.id]) {
        const row = byId.get(id)
        if (row) {
          row.played += 1; row.pointsFor += own; row.pointsAgainst += other
          if (own > other) { row.wins += 1; row.tablePoints += 3 }
          if (own === other) { row.draws += 1; row.tablePoints += 1 }
        }
      }
    }
    if (tournament.format === 'knockout') {
      const winner = score.scoreA > score.scoreB ? match.teamA.id : match.teamB.id
      const loser = score.scoreA > score.scoreB ? match.teamB.id : match.teamA.id
      if (match.stage === 'final') { placements.set(winner, 1); placements.set(loser, 2) }
      else if (match.stage === 'bronze') { placements.set(winner, 3); placements.set(loser, 4) }
      else placements.set(loser, 2 ** (tournament.totalRounds - match.round) + 1)
    }
  }
  const compare = (a: TournamentStanding, b: TournamentStanding) => (
    (tournamentUsesTimedMatches(tournament) ? b.tablePoints - a.tablePoints : individual ? b.pointsFor - a.pointsFor : b.wins - a.wins)
    || (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)
    || (individual ? b.wins - a.wins : b.pointsFor - a.pointsFor)
  )
  if (tournament.format === 'knockout' && tournament.status === 'completed') {
    return rows.map((row) => ({ ...row, rank: placements.get(row.id) ?? 0,
      tied: [...placements.values()].filter((rank) => rank === placements.get(row.id)).length > 1 }))
      .sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))
  }
  rows.sort((a, b) => compare(a, b) || a.id.localeCompare(b.id))
  return rows.map((row) => ({ ...row, rank: 1 + rows.filter((other) => compare(other, row) < 0).length,
    tied: rows.filter((other) => compare(other, row) === 0).length > 1 }))
}

export function advanceTournament(tournament: Tournament, scores: TournamentScore[], actorId: string, now = Date.now()): Tournament {
  requireTournamentManager(tournament, actorId)
  if (tournament.status !== 'running') throw new Error('Il torneo non è in corso.')
  if (now < tournament.startsAt) throw new Error('Aspetta l’orario d’inizio del torneo.')
  if (tournamentUsesTimedMatches(tournament) && getTournamentRoundClock(tournament, now).state !== 'expired') throw new Error('Aspetta la fine del timer e del punto in corso prima di confermare il turno.')
  const currentMatches = Object.values(tournament.matches).filter((m) => m.round === tournament.currentRound)
  if (currentMatches.length === 0 || currentMatches.some((match) => {
    const score = scores.find((s) => s.matchId === match.id)
    return !score || !tournamentScoreIsValid(tournament, score.scoreA, score.scoreB)
  })) throw new Error('Completa tutti i risultati del turno prima di continuare.')
  if (tournament.currentRound === tournament.totalRounds) return { ...tournament, status: 'completed', updatedAt: now }
  const nextRound = tournament.currentRound + 1
  let generated: TournamentMatch[] = []
  if (tournament.format === 'mexicano') {
    // Stable seeded tie order only affects matchups, never podium/rank.
    const shuffled = tournamentShuffle(Object.keys(tournament.registrations).sort(), tournament.seed)
    const standings = getTournamentStandings(tournament, scores)
    const ordered = [...standings].sort((a, b) => a.rank - b.rank || shuffled.indexOf(a.id) - shuffled.indexOf(b.id)).map((row) => row.id)
    generated = rotatingTournamentRound(tournament, ordered, nextRound)
  } else if (tournament.format === 'knockout') {
    const winners: TournamentTeam[] = [], losers: TournamentTeam[] = []
    currentMatches.forEach((match) => {
      const score = scores.find((s) => s.matchId === match.id)!
      winners.push(score.scoreA > score.scoreB ? match.teamA : match.teamB)
      losers.push(score.scoreA > score.scoreB ? match.teamB : match.teamA)
    })
    generated = winners.flatMap((team, i) => i % 2 === 0 ? [tournamentMatch(tournament, nextRound, i / 2, team, winners[i + 1], winners.length === 2 ? 'final' : 'regular')] : [])
    if (winners.length === 2) generated.push(tournamentMatch(tournament, nextRound, 1, losers[0], losers[1], 'bronze'))
  }
  return { ...tournament, currentRound: nextRound, matches: { ...tournament.matches, ...Object.fromEntries(generated.map((match) => [match.id, match])) }, updatedAt: now, roundStartedAt: null }
}
