import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  type Unsubscribe,
} from 'firebase/firestore'
import type {
  CreatePollInput,
  MemberProfile,
  PadelPoll,
  PadelSlot,
  PollStatus,
  SessionUser,
} from '../types'
import {
  addSignup,
  makePoll,
  removeSignup,
  rescheduleSlot,
  substituteStarter,
  updateSlot,
} from './domain'
import { getLocalProfiles, USERS_EVENT } from './auth'
import { firestore, hasRemoteBackend } from './firebase'

export interface PadelRepository {
  subscribePolls(listener: (polls: PadelPoll[]) => void, onError: (error: Error) => void): Unsubscribe
  subscribeMembers(listener: (members: MemberProfile[]) => void, onError: (error: Error) => void): Unsubscribe
  createPoll(input: CreatePollInput, creator: SessionUser): Promise<void>
  joinSlot(pollId: string, slotId: string, member: SessionUser): Promise<PadelPoll>
  leaveSlot(pollId: string, slotId: string, userId: string): Promise<PadelPoll>
  rescheduleSlot(pollId: string, slotId: string, startsAt: string): Promise<PadelPoll>
  substitute(
    pollId: string,
    slotId: string,
    outgoingUserId: string,
    replacement: MemberProfile,
  ): Promise<PadelPoll>
  setBooking(
    pollId: string,
    slotId: string,
    booking: { venue: string; bookedBy: SessionUser } | null,
  ): Promise<PadelPoll>
  setPollStatus(pollId: string, status: PollStatus): Promise<PadelPoll>
  deletePoll(pollId: string): Promise<void>
}

function remoteRepository(): PadelRepository {
  if (!firestore) throw new Error('Firebase non è configurato.')
  const db = firestore

  const mutatePoll = async (pollId: string, mutate: (poll: PadelPoll) => PadelPoll) => {
    const reference = doc(db, 'polls', pollId)
    return runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(reference)
      if (!snapshot.exists()) throw new Error('Sondaggio non trovato.')
      const poll = { id: snapshot.id, ...snapshot.data() } as PadelPoll
      const updated = mutate(poll)
      transaction.update(reference, {
        slots: updated.slots,
        status: updated.status,
        updatedAt: updated.updatedAt,
      })
      return updated
    })
  }

  return {
    subscribePolls(listener, onError) {
      return onSnapshot(
        query(collection(db, 'polls'), orderBy('createdAt', 'desc')),
        (snapshot) => listener(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PadelPoll)),
        onError,
      )
    },
    subscribeMembers(listener, onError) {
      return onSnapshot(
        query(collection(db, 'users'), orderBy('displayName')),
        (snapshot) =>
          listener(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as MemberProfile)),
        onError,
      )
    },
    async createPoll(input, creator) {
      await addDoc(collection(db, 'polls'), makePoll(input, creator))
    },
    async joinSlot(pollId, slotId, member) {
      return mutatePoll(pollId, (poll) => updateSlot(poll, slotId, (slot) => addSignup(slot, member)))
    },
    async leaveSlot(pollId, slotId, userId) {
      return mutatePoll(pollId, (poll) => updateSlot(poll, slotId, (slot) => removeSignup(slot, userId)))
    },
    async rescheduleSlot(pollId, slotId, startsAt) {
      return mutatePoll(pollId, (poll) => rescheduleSlot(poll, slotId, startsAt))
    },
    async substitute(pollId, slotId, outgoingUserId, replacement) {
      return mutatePoll(pollId, (poll) =>
        updateSlot(poll, slotId, (slot) => substituteStarter(slot, outgoingUserId, replacement)),
      )
    },
    async setBooking(pollId, slotId, booking) {
      return mutatePoll(pollId, (poll) =>
        updateSlot(poll, slotId, (slot): PadelSlot =>
          booking
            ? {
                ...slot,
                venue: booking.venue.trim(),
                bookedAt: Date.now(),
                bookedBy: booking.bookedBy.id,
                bookedByName: booking.bookedBy.displayName,
              }
            : {
                id: slot.id,
                startsAt: slot.startsAt,
                durationMinutes: slot.durationMinutes,
                venue: '',
                signups: slot.signups,
              },
        ),
      )
    },
    async setPollStatus(pollId, status) {
      return mutatePoll(pollId, (poll) => ({ ...poll, status, updatedAt: Date.now() }))
    },
    async deletePoll(pollId) {
      await deleteDoc(doc(db, 'polls', pollId))
    },
  }
}

const LOCAL_POLLS_KEY = 'bandeja-boys:polls'
const POLLS_EVENT = 'bandeja-boys:polls-changed'

const demoMembers: MemberProfile[] = [
  { id: 'demo-luca', displayName: 'Luca', email: 'luca@example.test', createdAt: 1 },
  { id: 'demo-ale', displayName: 'Ale', email: 'ale@example.test', createdAt: 2 },
  { id: 'demo-fede', displayName: 'Fede', email: 'fede@example.test', createdAt: 3 },
  { id: 'demo-teo', displayName: 'Teo', email: 'teo@example.test', createdAt: 4 },
  { id: 'demo-nico', displayName: 'Nico', email: 'nico@example.test', createdAt: 5 },
]

function seedPolls(): PadelPoll[] {
  const next = new Date()
  next.setDate(next.getDate() + 8)
  next.setHours(19, 30, 0, 0)
  const second = new Date(next)
  second.setDate(second.getDate() + 2)
  second.setHours(20, 0, 0, 0)
  const now = Date.now()
  const signups = demoMembers.slice(0, 5).map((member, index) => ({
    id: `demo-signup-${index}`,
    userId: member.id,
    displayName: member.displayName,
    joinedAt: now - (5 - index) * 60_000,
  }))
  return [
    {
      id: 'demo-poll',
      title: 'Padel · prossima settimana',
      targetWeekStart: next.toISOString().slice(0, 10),
      createdBy: 'demo-luca',
      createdByName: 'Luca',
      createdAt: now,
      updatedAt: now,
      status: 'open',
      slots: [
        {
          id: 'demo-slot-ready',
          startsAt: next.toISOString(),
          durationMinutes: 90,
          venue: '',
          signups,
        },
        {
          id: 'demo-slot-collecting',
          startsAt: second.toISOString(),
          durationMinutes: 90,
          venue: '',
          signups: signups.slice(0, 2),
        },
      ],
    },
  ]
}

function readLocalPolls(): PadelPoll[] {
  try {
    const stored = localStorage.getItem(LOCAL_POLLS_KEY)
    if (stored) return JSON.parse(stored) as PadelPoll[]
  } catch {
    // A fresh demo dataset is safer than blocking the UI on malformed local data.
  }
  const polls = seedPolls()
  localStorage.setItem(LOCAL_POLLS_KEY, JSON.stringify(polls))
  return polls
}

function writeLocalPolls(polls: PadelPoll[]) {
  localStorage.setItem(LOCAL_POLLS_KEY, JSON.stringify(polls))
  window.dispatchEvent(new Event(POLLS_EVENT))
}

function localRepository(): PadelRepository {
  const mutate = async (pollId: string, updater: (poll: PadelPoll) => PadelPoll) => {
    const polls = readLocalPolls()
    const index = polls.findIndex((poll) => poll.id === pollId)
    if (index < 0) throw new Error('Sondaggio non trovato.')
    const updated = updater(polls[index])
    polls[index] = updated
    writeLocalPolls(polls)
    return updated
  }

  return {
    subscribePolls(listener) {
      const notify = () => listener(readLocalPolls())
      window.addEventListener(POLLS_EVENT, notify)
      notify()
      return () => window.removeEventListener(POLLS_EVENT, notify)
    },
    subscribeMembers(listener) {
      const notify = () => {
        const members = [...demoMembers, ...getLocalProfiles()]
        listener(Array.from(new Map(members.map((member) => [member.id, member])).values()))
      }
      window.addEventListener(USERS_EVENT, notify)
      notify()
      return () => window.removeEventListener(USERS_EVENT, notify)
    },
    async createPoll(input, creator) {
      const poll = makePoll(input, creator)
      writeLocalPolls([{ id: `poll-${Date.now()}`, ...poll }, ...readLocalPolls()])
    },
    async joinSlot(pollId, slotId, member) {
      return mutate(pollId, (poll) => updateSlot(poll, slotId, (slot) => addSignup(slot, member)))
    },
    async leaveSlot(pollId, slotId, userId) {
      return mutate(pollId, (poll) => updateSlot(poll, slotId, (slot) => removeSignup(slot, userId)))
    },
    async rescheduleSlot(pollId, slotId, startsAt) {
      return mutate(pollId, (poll) => rescheduleSlot(poll, slotId, startsAt))
    },
    async substitute(pollId, slotId, outgoingUserId, replacement) {
      return mutate(pollId, (poll) =>
        updateSlot(poll, slotId, (slot) => substituteStarter(slot, outgoingUserId, replacement)),
      )
    },
    async setBooking(pollId, slotId, booking) {
      return mutate(pollId, (poll) =>
        updateSlot(poll, slotId, (slot) =>
          booking
            ? {
                ...slot,
                venue: booking.venue.trim(),
                bookedAt: Date.now(),
                bookedBy: booking.bookedBy.id,
                bookedByName: booking.bookedBy.displayName,
              }
            : {
                id: slot.id,
                startsAt: slot.startsAt,
                durationMinutes: slot.durationMinutes,
                venue: '',
                signups: slot.signups,
              },
        ),
      )
    },
    async setPollStatus(pollId, status) {
      return mutate(pollId, (poll) => ({ ...poll, status, updatedAt: Date.now() }))
    },
    async deletePoll(pollId) {
      writeLocalPolls(readLocalPolls().filter((poll) => poll.id !== pollId))
    },
  }
}

export const repository: PadelRepository = hasRemoteBackend ? remoteRepository() : localRepository()
