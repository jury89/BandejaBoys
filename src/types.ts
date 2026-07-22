export type PollStatus = 'open' | 'closed'

export interface MemberProfile {
  id: string
  displayName: string
  email: string
  createdAt: number
  avatarDataUrl?: string
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
  substitutedFor?: SubstitutionNote
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

export interface PlayerMatch {
  pollId: string
  pollTitle: string
  slot: PadelSlot
}

export interface PlayerMatchLists {
  upcoming: PlayerMatch[]
  past: PlayerMatch[]
}

export interface SlotInput {
  startsAt: string
  durationMinutes: number
}

export interface CreatePollInput {
  title: string
  targetWeekStart: string
  slots: SlotInput[]
}

export type SlotPhase = 'collecting' | 'ready' | 'booked'

export type MatchRatingResponseStatus = 'dismissed' | 'submitted'

export interface MatchRatingTeammate {
  userId: string
  displayName: string
}

export interface MatchRatingPrompt {
  id: string
  pollId: string
  pollTitle: string
  slotId: string
  sessionStartsAt: string
  sessionEndedAt: number
  dueAt: number
  reviewerId: string
  teammates: MatchRatingTeammate[]
}

export interface MatchRatingResponse {
  id: string
  pollId: string
  slotId: string
  reviewerId: string
  status: MatchRatingResponseStatus
  closedAt: number
}

export interface MatchRatingSubmission extends MatchRatingTeammate {
  score: number
}

export interface MatchRatingRecord {
  id: string
  responseId: string
  pollId: string
  pollTitle: string
  slotId: string
  sessionStartsAt: string
  sessionEndedAt: number
  reviewerId: string
  reviewerName: string
  revieweeId: string
  revieweeName: string
  score: number
  createdAt: number
}
