import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
  type Transaction,
  type Unsubscribe,
} from 'firebase/firestore'
import type {
  CreatePollInput,
  MatchRatingPrompt,
  MatchRatingRecord,
  MatchRatingResponse,
  MatchRatingSubmission,
  MemberProfile,
  PadelPoll,
  PadelSlot,
  PollStatus,
  SessionUser,
  SignupRole,
  SlotInput,
} from '../types'
import {
  makeActivityEvent,
  slotViewDocumentId,
  type ActivityEventInput,
  type LocalActivityEvent,
  type LocalSlotView,
} from './activity'
import {
  addSlotToPoll,
  addSignup,
  getStarters,
  makeId,
  makePoll,
  removeSignup,
  removeSlotFromPoll,
  rescheduleSlot,
  setSlotBooking,
  substituteStarter,
  updateSlot,
} from './domain'
import { getLocalProfiles, USERS_EVENT } from './auth'
import { firestore, hasRemoteBackend } from './firebase'

export interface PadelRepository {
  subscribePolls(listener: (polls: PadelPoll[]) => void, onError: (error: Error) => void): Unsubscribe
  subscribeMembers(listener: (members: MemberProfile[]) => void, onError: (error: Error) => void): Unsubscribe
  subscribeMatchRatingResponses(
    reviewerId: string,
    listener: (responses: MatchRatingResponse[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe
  subscribeReceivedMatchRatings(
    revieweeId: string,
    listener: (ratings: MatchRatingRecord[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe
  createPoll(input: CreatePollInput, creator: SessionUser): Promise<void>
  addSlot(pollId: string, input: SlotInput, creator: SessionUser): Promise<PadelPoll>
  joinSlot(pollId: string, slotId: string, member: SessionUser, role: SignupRole): Promise<PadelPoll>
  leaveSlot(pollId: string, slotId: string, member: SessionUser): Promise<PadelPoll>
  deleteSlot(pollId: string, slotId: string, actor: SessionUser): Promise<PadelPoll>
  rescheduleSlot(
    pollId: string,
    slotId: string,
    startsAt: string,
    actor: SessionUser,
  ): Promise<PadelPoll>
  substitute(
    pollId: string,
    slotId: string,
    actor: SessionUser,
    replacement: MemberProfile,
  ): Promise<PadelPoll>
  setBooking(
    pollId: string,
    slotId: string,
    booking: { bookedBy: SessionUser } | null,
    actor: SessionUser,
  ): Promise<PadelPoll>
  setPollStatus(pollId: string, status: PollStatus, actor: SessionUser): Promise<PadelPoll>
  deletePoll(pollId: string, actor: SessionUser): Promise<void>
  recordSlotView(poll: PadelPoll, slot: PadelSlot, viewer: SessionUser): Promise<void>
  dismissMatchRatingPrompt(prompt: MatchRatingPrompt): Promise<MatchRatingResponse>
  submitMatchRatings(
    prompt: MatchRatingPrompt,
    reviewer: SessionUser,
    submissions: MatchRatingSubmission[],
  ): Promise<MatchRatingResponse>
}

type ActivityFactory = (before: PadelPoll, after: PadelPoll) => ActivityEventInput | null

function slotById(poll: PadelPoll, slotId: string): PadelSlot | undefined {
  return poll.slots.find((slot) => slot.id === slotId)
}

function signupRole(slot: PadelSlot, userId: string): SignupRole {
  return getStarters(slot).some((signup) => signup.userId === userId) ? 'starter' : 'reserve'
}

function pollCreationEvents(poll: PadelPoll, creator: SessionUser): ActivityEventInput[] {
  return [
    makeActivityEvent('poll_created', creator, poll, undefined, { slotCount: poll.slots.length }),
    ...poll.slots.map((slot) => makeActivityEvent(
      'slot_created',
      creator,
      poll,
      slot,
      { durationMinutes: slot.durationMinutes },
    )),
  ]
}

function setRemoteActivity(
  db: NonNullable<typeof firestore>,
  transaction: Transaction,
  activity: ActivityEventInput,
) {
  transaction.set(doc(collection(db, 'activityEvents')), {
    ...activity,
    occurredAt: serverTimestamp(),
  })
}

function makeRatingResponse(
  prompt: MatchRatingPrompt,
  status: MatchRatingResponse['status'],
  closedAt = Date.now(),
): MatchRatingResponse {
  return {
    id: prompt.id,
    pollId: prompt.pollId,
    slotId: prompt.slotId,
    reviewerId: prompt.reviewerId,
    status,
    closedAt,
  }
}

function makeRatingRecords(
  prompt: MatchRatingPrompt,
  reviewer: SessionUser,
  submissions: MatchRatingSubmission[],
  createdAt = Date.now(),
): MatchRatingRecord[] {
  const expectedTeammates = new Set(prompt.teammates.map((teammate) => teammate.userId))
  const submittedTeammates = new Set(submissions.map((submission) => submission.userId))
  const isComplete = submissions.length === 3
    && expectedTeammates.size === 3
    && submittedTeammates.size === 3
    && [...submittedTeammates].every((userId) => expectedTeammates.has(userId))
  const scoresAreValid = submissions.every((submission) => (
    Number.isInteger(submission.score) && submission.score >= 1 && submission.score <= 10
  ))
  if (!isComplete || !scoresAreValid || prompt.reviewerId !== reviewer.id) {
    throw new Error('Assegna un voto da 1 a 10 a tutti e tre i compagni.')
  }

  return submissions.map((submission) => ({
    id: `${prompt.id}__${submission.userId}`,
    responseId: prompt.id,
    pollId: prompt.pollId,
    pollTitle: prompt.pollTitle,
    slotId: prompt.slotId,
    sessionStartsAt: prompt.sessionStartsAt,
    sessionEndedAt: prompt.sessionEndedAt,
    reviewerId: reviewer.id,
    reviewerName: reviewer.displayName,
    revieweeId: submission.userId,
    revieweeName: submission.displayName,
    score: submission.score,
    createdAt,
  }))
}

function remoteRepository(): PadelRepository {
  if (!firestore) throw new Error('Firebase non è configurato.')
  const db = firestore

  const mutatePoll = async (
    pollId: string,
    mutate: (poll: PadelPoll) => PadelPoll,
    activityFactory: ActivityFactory,
  ) => {
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
      const activity = activityFactory(poll, updated)
      if (activity) setRemoteActivity(db, transaction, activity)
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
    subscribeMatchRatingResponses(reviewerId, listener, onError) {
      return onSnapshot(
        query(collection(db, 'matchRatingResponses'), where('reviewerId', '==', reviewerId)),
        (snapshot) => listener(snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }) as MatchRatingResponse)),
        onError,
      )
    },
    subscribeReceivedMatchRatings(revieweeId, listener, onError) {
      return onSnapshot(
        query(collection(db, 'matchRatings'), where('revieweeId', '==', revieweeId)),
        (snapshot) => listener(snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }) as MatchRatingRecord)),
        onError,
      )
    },
    async createPoll(input, creator) {
      const data = makePoll(input, creator)
      const reference = doc(collection(db, 'polls'))
      const poll = { id: reference.id, ...data }
      const batch = writeBatch(db)
      batch.set(reference, data)
      pollCreationEvents(poll, creator).forEach((activity) => {
        batch.set(doc(collection(db, 'activityEvents')), {
          ...activity,
          occurredAt: serverTimestamp(),
        })
      })
      await batch.commit()
    },
    async addSlot(pollId, input, creator) {
      return mutatePoll(
        pollId,
        (poll) => addSlotToPoll(poll, input, creator),
        (before, after) => {
          const previousIds = new Set(before.slots.map((slot) => slot.id))
          const added = after.slots.find((slot) => !previousIds.has(slot.id))
          return added
            ? makeActivityEvent('slot_created', creator, after, added, {
              durationMinutes: added.durationMinutes,
            })
            : null
        },
      )
    },
    async joinSlot(pollId, slotId, member, role) {
      return mutatePoll(
        pollId,
        (poll) => updateSlot(poll, slotId, (slot) => addSignup(slot, member, Date.now(), role)),
        (before, after) => {
          const previous = slotById(before, slotId)
          const updated = slotById(after, slotId)
          const wasJoined = previous?.signups.some((signup) => signup.userId === member.id)
          return updated && !wasJoined
            ? makeActivityEvent('signup_joined', member, after, updated, { role })
            : null
        },
      )
    },
    async leaveSlot(pollId, slotId, member) {
      return mutatePoll(
        pollId,
        (poll) => updateSlot(poll, slotId, (slot) => removeSignup(slot, member.id)),
        (before) => {
          const previous = slotById(before, slotId)
          const signup = previous?.signups.find((item) => item.userId === member.id)
          return previous && signup
            ? makeActivityEvent('signup_left', member, before, previous, {
              role: signupRole(previous, member.id),
              joinedAt: signup.joinedAt,
            })
            : null
        },
      )
    },
    async deleteSlot(pollId, slotId, actor) {
      return mutatePoll(
        pollId,
        (poll) => removeSlotFromPoll(poll, slotId),
        (before) => {
          const removed = slotById(before, slotId)
          return removed
            ? makeActivityEvent('slot_deleted', actor, before, removed, {
              signupCount: removed.signups.length,
              wasBooked: Boolean(removed.bookedAt),
            })
            : null
        },
      )
    },
    async rescheduleSlot(pollId, slotId, startsAt, actor) {
      return mutatePoll(
        pollId,
        (poll) => rescheduleSlot(poll, slotId, startsAt),
        (before, after) => {
          const previous = slotById(before, slotId)
          const updated = slotById(after, slotId)
          return previous && updated && previous.startsAt !== updated.startsAt
            ? makeActivityEvent('slot_rescheduled', actor, after, updated, {
              previousStartsAt: previous.startsAt,
            })
            : null
        },
      )
    },
    async substitute(pollId, slotId, actor, replacement) {
      return mutatePoll(
        pollId,
        (poll) => updateSlot(poll, slotId, (slot) => substituteStarter(slot, actor.id, replacement)),
        (_before, after) => {
          const updated = slotById(after, slotId)
          return updated
            ? makeActivityEvent('starter_substituted', actor, after, updated, {
              outgoingUserId: actor.id,
              outgoingName: actor.displayName,
              replacementUserId: replacement.id,
              replacementName: replacement.displayName,
            })
            : null
        },
      )
    },
    async setBooking(pollId, slotId, booking, actor) {
      return mutatePoll(
        pollId,
        (poll) => updateSlot(poll, slotId, (slot) => setSlotBooking(slot, booking?.bookedBy ?? null)),
        (before, after) => {
          const previous = slotById(before, slotId)
          const updated = slotById(after, slotId)
          if (!previous || !updated || Boolean(previous.bookedAt) === Boolean(updated.bookedAt)) return null
          return makeActivityEvent(
            booking ? 'slot_booked' : 'slot_unbooked',
            actor,
            after,
            updated,
            { venue: updated.venue || previous.venue || '' },
          )
        },
      )
    },
    async setPollStatus(pollId, status, actor) {
      return mutatePoll(
        pollId,
        (poll) => ({ ...poll, status, updatedAt: Date.now() }),
        (before, after) => before.status === after.status
          ? null
          : makeActivityEvent(status === 'closed' ? 'poll_archived' : 'poll_reopened', actor, after),
      )
    },
    async deletePoll(pollId, actor) {
      const reference = doc(db, 'polls', pollId)
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(reference)
        if (!snapshot.exists()) throw new Error('Sondaggio non trovato.')
        const poll = { id: snapshot.id, ...snapshot.data() } as PadelPoll
        transaction.delete(reference)
        setRemoteActivity(db, transaction, makeActivityEvent('poll_deleted', actor, poll, undefined, {
          slotCount: poll.slots.length,
        }))
      })
    },
    async recordSlotView(poll, slot, viewer) {
      const reference = doc(db, 'slotViews', slotViewDocumentId(poll.id, slot.id, viewer.id))
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(reference)
        if (snapshot.exists()) {
          const current = snapshot.data() as { viewCount?: number }
          transaction.update(reference, {
            pollTitle: poll.title,
            slotStartsAt: slot.startsAt,
            viewerName: viewer.displayName,
            lastViewedAt: serverTimestamp(),
            viewCount: (current.viewCount ?? 0) + 1,
          })
          return
        }
        transaction.set(reference, {
          pollId: poll.id,
          pollTitle: poll.title,
          slotId: slot.id,
          slotStartsAt: slot.startsAt,
          viewerId: viewer.id,
          viewerName: viewer.displayName,
          firstViewedAt: serverTimestamp(),
          lastViewedAt: serverTimestamp(),
          viewCount: 1,
        })
      })
    },
    async dismissMatchRatingPrompt(prompt) {
      const reference = doc(db, 'matchRatingResponses', prompt.id)
      return runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(reference)
        if (snapshot.exists()) return { id: snapshot.id, ...snapshot.data() } as MatchRatingResponse
        const response = makeRatingResponse(prompt, 'dismissed')
        transaction.set(reference, response)
        return response
      })
    },
    async submitMatchRatings(prompt, reviewer, submissions) {
      const records = makeRatingRecords(prompt, reviewer, submissions)
      const responseReference = doc(db, 'matchRatingResponses', prompt.id)
      return runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(responseReference)
        if (snapshot.exists()) throw new Error('Questa scheda è già stata chiusa.')
        const response = makeRatingResponse(prompt, 'submitted', records[0].createdAt)
        records.forEach((record) => {
          transaction.set(doc(db, 'matchRatings', record.id), record)
        })
        transaction.set(responseReference, response)
        return response
      })
    },
  }
}

const LOCAL_POLLS_KEY = 'bandeja-boys:polls'
const POLLS_EVENT = 'bandeja-boys:polls-changed'
const LOCAL_MATCH_RATINGS_KEY = 'bandeja-boys:match-ratings'
const MATCH_RATINGS_EVENT = 'bandeja-boys:match-ratings-changed'
const LOCAL_ACTIVITY_KEY = 'bandeja-boys:activity'

interface LocalMatchRatingStore {
  responses: MatchRatingResponse[]
  ratings: MatchRatingRecord[]
}

interface LocalActivityStore {
  events: LocalActivityEvent[]
  views: LocalSlotView[]
}

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

function readLocalMatchRatingStore(): LocalMatchRatingStore {
  try {
    const stored = localStorage.getItem(LOCAL_MATCH_RATINGS_KEY)
    if (stored) return JSON.parse(stored) as LocalMatchRatingStore
  } catch {
    // Malformed demo data must not block the rating prompt.
  }
  return { responses: [], ratings: [] }
}

function writeLocalMatchRatingStore(store: LocalMatchRatingStore) {
  localStorage.setItem(LOCAL_MATCH_RATINGS_KEY, JSON.stringify(store))
  window.dispatchEvent(new Event(MATCH_RATINGS_EVENT))
}

function readLocalActivityStore(): LocalActivityStore {
  try {
    const stored = localStorage.getItem(LOCAL_ACTIVITY_KEY)
    if (stored) return JSON.parse(stored) as LocalActivityStore
  } catch {
    // Malformed demo activity must not block the dashboard.
  }
  return { events: [], views: [] }
}

function writeLocalActivity(activity: ActivityEventInput, occurredAt = Date.now()) {
  const store = readLocalActivityStore()
  store.events.push({
    ...activity,
    id: makeId('activity'),
    occurredAt,
  })
  localStorage.setItem(LOCAL_ACTIVITY_KEY, JSON.stringify(store))
}

function writeLocalActivities(activities: ActivityEventInput[], occurredAt = Date.now()) {
  activities.forEach((activity) => writeLocalActivity(activity, occurredAt))
}

function localRepository(): PadelRepository {
  const mutate = async (
    pollId: string,
    updater: (poll: PadelPoll) => PadelPoll,
    activityFactory: ActivityFactory,
  ) => {
    const polls = readLocalPolls()
    const index = polls.findIndex((poll) => poll.id === pollId)
    if (index < 0) throw new Error('Sondaggio non trovato.')
    const before = polls[index]
    const updated = updater(before)
    polls[index] = updated
    writeLocalPolls(polls)
    const activity = activityFactory(before, updated)
    if (activity) writeLocalActivity(activity)
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
    subscribeMatchRatingResponses(reviewerId, listener) {
      const notify = () => listener(
        readLocalMatchRatingStore().responses.filter((response) => response.reviewerId === reviewerId),
      )
      window.addEventListener(MATCH_RATINGS_EVENT, notify)
      notify()
      return () => window.removeEventListener(MATCH_RATINGS_EVENT, notify)
    },
    subscribeReceivedMatchRatings(revieweeId, listener) {
      const notify = () => listener(
        readLocalMatchRatingStore().ratings.filter((rating) => rating.revieweeId === revieweeId),
      )
      window.addEventListener(MATCH_RATINGS_EVENT, notify)
      notify()
      return () => window.removeEventListener(MATCH_RATINGS_EVENT, notify)
    },
    async createPoll(input, creator) {
      const data = makePoll(input, creator)
      const poll = { id: `poll-${Date.now()}`, ...data }
      writeLocalPolls([poll, ...readLocalPolls()])
      writeLocalActivities(pollCreationEvents(poll, creator), poll.createdAt)
    },
    async addSlot(pollId, input, creator) {
      return mutate(
        pollId,
        (poll) => addSlotToPoll(poll, input, creator),
        (before, after) => {
          const previousIds = new Set(before.slots.map((slot) => slot.id))
          const added = after.slots.find((slot) => !previousIds.has(slot.id))
          return added
            ? makeActivityEvent('slot_created', creator, after, added, {
              durationMinutes: added.durationMinutes,
            })
            : null
        },
      )
    },
    async joinSlot(pollId, slotId, member, role) {
      return mutate(
        pollId,
        (poll) => updateSlot(poll, slotId, (slot) => addSignup(slot, member, Date.now(), role)),
        (before, after) => {
          const previous = slotById(before, slotId)
          const updated = slotById(after, slotId)
          const wasJoined = previous?.signups.some((signup) => signup.userId === member.id)
          return updated && !wasJoined
            ? makeActivityEvent('signup_joined', member, after, updated, { role })
            : null
        },
      )
    },
    async leaveSlot(pollId, slotId, member) {
      return mutate(
        pollId,
        (poll) => updateSlot(poll, slotId, (slot) => removeSignup(slot, member.id)),
        (before) => {
          const previous = slotById(before, slotId)
          const signup = previous?.signups.find((item) => item.userId === member.id)
          return previous && signup
            ? makeActivityEvent('signup_left', member, before, previous, {
              role: signupRole(previous, member.id),
              joinedAt: signup.joinedAt,
            })
            : null
        },
      )
    },
    async deleteSlot(pollId, slotId, actor) {
      return mutate(
        pollId,
        (poll) => removeSlotFromPoll(poll, slotId),
        (before) => {
          const removed = slotById(before, slotId)
          return removed
            ? makeActivityEvent('slot_deleted', actor, before, removed, {
              signupCount: removed.signups.length,
              wasBooked: Boolean(removed.bookedAt),
            })
            : null
        },
      )
    },
    async rescheduleSlot(pollId, slotId, startsAt, actor) {
      return mutate(
        pollId,
        (poll) => rescheduleSlot(poll, slotId, startsAt),
        (before, after) => {
          const previous = slotById(before, slotId)
          const updated = slotById(after, slotId)
          return previous && updated && previous.startsAt !== updated.startsAt
            ? makeActivityEvent('slot_rescheduled', actor, after, updated, {
              previousStartsAt: previous.startsAt,
            })
            : null
        },
      )
    },
    async substitute(pollId, slotId, actor, replacement) {
      return mutate(
        pollId,
        (poll) => updateSlot(poll, slotId, (slot) => substituteStarter(slot, actor.id, replacement)),
        (_before, after) => {
          const updated = slotById(after, slotId)
          return updated
            ? makeActivityEvent('starter_substituted', actor, after, updated, {
              outgoingUserId: actor.id,
              outgoingName: actor.displayName,
              replacementUserId: replacement.id,
              replacementName: replacement.displayName,
            })
            : null
        },
      )
    },
    async setBooking(pollId, slotId, booking, actor) {
      return mutate(
        pollId,
        (poll) => updateSlot(poll, slotId, (slot) => setSlotBooking(slot, booking?.bookedBy ?? null)),
        (before, after) => {
          const previous = slotById(before, slotId)
          const updated = slotById(after, slotId)
          if (!previous || !updated || Boolean(previous.bookedAt) === Boolean(updated.bookedAt)) return null
          return makeActivityEvent(
            booking ? 'slot_booked' : 'slot_unbooked',
            actor,
            after,
            updated,
            { venue: updated.venue || previous.venue || '' },
          )
        },
      )
    },
    async setPollStatus(pollId, status, actor) {
      return mutate(
        pollId,
        (poll) => ({ ...poll, status, updatedAt: Date.now() }),
        (before, after) => before.status === after.status
          ? null
          : makeActivityEvent(status === 'closed' ? 'poll_archived' : 'poll_reopened', actor, after),
      )
    },
    async deletePoll(pollId, actor) {
      const polls = readLocalPolls()
      const poll = polls.find((item) => item.id === pollId)
      if (!poll) throw new Error('Sondaggio non trovato.')
      writeLocalPolls(polls.filter((item) => item.id !== pollId))
      writeLocalActivity(makeActivityEvent('poll_deleted', actor, poll, undefined, {
        slotCount: poll.slots.length,
      }))
    },
    async recordSlotView(poll, slot, viewer) {
      const store = readLocalActivityStore()
      const id = slotViewDocumentId(poll.id, slot.id, viewer.id)
      const index = store.views.findIndex((view) => view.id === id)
      const now = Date.now()
      if (index >= 0) {
        store.views[index] = {
          ...store.views[index],
          pollTitle: poll.title,
          slotStartsAt: slot.startsAt,
          viewerName: viewer.displayName,
          lastViewedAt: now,
          viewCount: store.views[index].viewCount + 1,
        }
      } else {
        store.views.push({
          id,
          pollId: poll.id,
          pollTitle: poll.title,
          slotId: slot.id,
          slotStartsAt: slot.startsAt,
          viewerId: viewer.id,
          viewerName: viewer.displayName,
          firstViewedAt: now,
          lastViewedAt: now,
          viewCount: 1,
        })
      }
      localStorage.setItem(LOCAL_ACTIVITY_KEY, JSON.stringify(store))
    },
    async dismissMatchRatingPrompt(prompt) {
      const store = readLocalMatchRatingStore()
      const existing = store.responses.find((response) => response.id === prompt.id)
      if (existing) return existing
      const response = makeRatingResponse(prompt, 'dismissed')
      writeLocalMatchRatingStore({ ...store, responses: [...store.responses, response] })
      return response
    },
    async submitMatchRatings(prompt, reviewer, submissions) {
      const store = readLocalMatchRatingStore()
      if (store.responses.some((response) => response.id === prompt.id)) {
        throw new Error('Questa scheda è già stata chiusa.')
      }
      const records = makeRatingRecords(prompt, reviewer, submissions)
      const response = makeRatingResponse(prompt, 'submitted', records[0].createdAt)
      writeLocalMatchRatingStore({
        responses: [...store.responses, response],
        ratings: [...store.ratings, ...records],
      })
      return response
    },
  }
}

export const repository: PadelRepository = hasRemoteBackend ? remoteRepository() : localRepository()
