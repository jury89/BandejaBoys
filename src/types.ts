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
