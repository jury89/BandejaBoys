export type PollStatus = 'open' | 'closed'

export interface NotificationPreferences {
  mondayMotivation: boolean
  newSlots: boolean
  slotReady: boolean
  starterSubstitution: boolean
  bookingReminder7d: boolean
  reminder24h: boolean
  reminder2h: boolean
  matchFeedback: boolean
  /** Legacy preferences retained only while older saved profiles are normalized. */
  matchMvp?: boolean
  matchRating?: boolean
  fantasy: boolean
}

export interface MemberProfile {
  id: string
  displayName: string
  email: string
  createdAt: number
  avatarDataUrl?: string
  notificationPreferences?: NotificationPreferences
}

export type SessionUser = MemberProfile

export interface SubstitutionNote {
  userId: string
  displayName: string
  at: number
}

export type SignupRole = 'starter' | 'reserve'

export interface Signup {
  id: string
  userId: string
  displayName: string
  joinedAt: number
  role?: SignupRole
  isGuest?: boolean
  addedBy?: string
  addedByName?: string
  substitutedFor?: SubstitutionNote
}

export type AdminSlotRosterAction =
  | {
    kind: 'add'
    member: Pick<MemberProfile, 'id' | 'displayName'>
    role: SignupRole
  }
  | {
    kind: 'remove'
    signupId: string
  }
  | {
    kind: 'set-role'
    signupId: string
    role: SignupRole
  }

export interface PadelSlot {
  id: string
  startsAt: string
  durationMinutes: number
  createdAt?: number
  createdBy?: string
  createdByName?: string
  venue: string
  bookedAt?: number
  bookedBy?: string
  bookedByName?: string
  signups: Signup[]
}

export interface PadelPoll {
  id: string
  title: string
  targetWeekStart: string
  createdBy: string
  createdByName: string
  createdAt: number
  updatedAt: number
  status: PollStatus
  slots: PadelSlot[]
}

export interface SlotWeekEntry {
  poll: PadelPoll
  slot: PadelSlot
}

export interface SlotWeekGroup {
  id: string
  weekStart: string
  entries: SlotWeekEntry[]
}

export interface PlayerMatch {
  pollId: string
  pollTitle: string
  slot: PadelSlot
  report?: MatchReport
  receivedFeedback?: {
    level: MatchFeedbackLevel
    ratingCount: number
  }
}

export interface PlayerMatchLists {
  upcoming: PlayerMatch[]
  past: PlayerMatch[]
}

export type MatchFeedbackLevel = 1 | 2 | 3 | 4 | 5

export interface MatchFeedbackSummary {
  id: string
  pollId: string
  slotId: string
  playerId: string
  scoreUnitsTotal: number
  ratingCount: number
  lastResponseId: string
  updatedAt: number
}

export interface GroupMatchPlayerFeedback {
  userId: string
  level: MatchFeedbackLevel
  ratingCount: number
}

export interface GroupMatch extends PlayerMatch {
  playerFeedback: GroupMatchPlayerFeedback[]
}

export interface SlotInput {
  startsAt: string
  durationMinutes: number
}

export interface CreatePollInput {
  slots: SlotInput[]
}

export type SlotPhase = 'collecting' | 'ready' | 'booked'

export type MatchFeedbackResponseStatus = 'dismissed' | 'submitted'

export interface MatchFeedbackCandidate {
  userId: string
  displayName: string
}

export interface MatchFeedbackPrompt {
  id: string
  pollId: string
  pollTitle: string
  slotId: string
  sessionStartsAt: string
  sessionEndedAt: number
  dueAt: number
  reviewerId: string
  candidates: MatchFeedbackCandidate[]
}

export interface MatchFeedbackRating {
  playerId: string
  playerName: string
  level: MatchFeedbackLevel
  scoreUnits: number
}

export interface MatchFeedbackResponse {
  id: string
  pollId: string
  slotId: string
  reviewerId: string
  status: MatchFeedbackResponseStatus
  ratings?: MatchFeedbackRating[]
  closedAt: number
}

export interface MatchReportPlayer {
  userId: string
  displayName: string
}

export interface MatchPairing {
  teamA: [MatchReportPlayer, MatchReportPlayer]
  teamB: [MatchReportPlayer, MatchReportPlayer]
}

export interface MatchSetInput {
  teamAUserIds: [string, string]
  scoreA: number
  scoreB: number
}

export interface MatchSetResult extends MatchPairing {
  id: string
  scoreA: number
  scoreB: number
}

export interface MatchTeamSetScore {
  setId: string
  setNumber: number
  scoreA: number
  scoreB: number
}

export interface MatchTeamResultGroup extends MatchPairing {
  key: string
  sets: MatchTeamSetScore[]
}

export interface MatchReport {
  id: string
  pollId: string
  pollTitle: string
  slotId: string
  sessionStartsAt: string
  participantIds: string[]
  participants: MatchReportPlayer[]
  sets: MatchSetResult[]
  createdBy: string
  createdByName: string
  createdAt: number
  updatedBy: string
  updatedByName: string
  updatedAt: number
}

export type FantasyRoundStatus = 'pending' | 'open' | 'scored' | 'void'

export interface FantasyRoundPlayer {
  userId: string
  displayName: string
}

export interface FantasyPlayerScore extends FantasyRoundPlayer {
  scoringModel?: 'ratings-v1' | 'mvp-v2' | 'feedback-v3'
  baseRating: number
  ratingCount: number
  usedDefaultRating: boolean
  feedbackLevel?: MatchFeedbackLevel
  mvpVotes?: number
  mvpBonus?: number
  setWins: number
  setLosses: number
  gameDifference: number
  resultBonus: number
  differenceBonus: number
  fantasyScore: number
  isMvp: boolean
  isTopPerformer?: boolean
}

export interface FantasyRoundStanding {
  managerId: string
  managerName: string
  playerIds: [string, string]
  captainId: string
  totalScore: number
  captainRating: number
  baseRatingTotal: number
  rank: number
  leaguePoints: number
}

export interface FantasyRound {
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
  status: FantasyRoundStatus
  createdAt: number
  updatedAt: number
  settledAt?: number
  voidReason?: string
  playerScores?: FantasyPlayerScore[]
  standings?: FantasyRoundStanding[]
}

export interface FantasyEntry {
  id: string
  roundId: string
  pollId: string
  slotId: string
  managerId: string
  managerName: string
  playerIds: [string, string]
  captainId: string
  rosterKey: string
  locksAt: number
  createdAt: number
  updatedAt: number
}

export interface FantasySelectionInput {
  playerIds: [string, string]
  captainId: string
}

export interface FantasyLeaderboardRow {
  managerId: string
  managerName: string
  leaguePoints: number
  wins: number
  rawFantasyPoints: number
  roundsPlayed: number
  contributions: FantasyLeaderboardContribution[]
  rank: number
}

export interface FantasyLeaderboardContribution {
  roundId: string
  pollTitle: string
  playedAt: number
  source: 'formation' | 'starter' | 'mvp' | 'top-performer'
  leaguePoints: number
  rawFantasyPoints: number
  rank?: number
}
