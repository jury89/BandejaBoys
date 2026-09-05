import {
  collection,
  doc,
  getDocs,
  increment,
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
  AdminSlotRosterAction,
  CreatePollInput,
  FantasyEntry,
  FantasyRound,
  FantasySelectionInput,
  MatchFeedbackLevel,
  MatchFeedbackPrompt,
  MatchFeedbackResponse,
  MatchFeedbackSummary,
  MatchReport,
  MatchSetInput,
  MemberProfile,
  PadelPoll,
  PadelSlot,
  PlayerMatch,
  PollStatus,
  SessionUser,
  SignupRole,
  SlotInput,
} from '../types'
import {
  makeActivityEvent,
  slotViewDocumentId,
  type ActivityDetail,
  type ActivityEventInput,
  type LocalActivityEvent,
  type LocalSlotView,
} from './activity'
import {
  addGuestSignup,
  addSlotToPoll,
  addSignup,
  applyAdminSlotRosterAction,
  aggregateMatchFeedbackSummaries,
  getFantasyRoundId,
  getMatchFeedbackDefinition,
  getMatchFeedbackSummaryId,
  getStarters,
  isGuestSignup,
  makeFantasyEntry,
  makeMatchReport,
  makeId,
  makePoll,
  removeGuestSignup,
  removeSignup,
  removeSlotFromPoll,
  reconcileFantasyRoundRosterMutation,
  reconcileFantasyRounds,
  rescheduleSlot,
  setSlotBooking,
  substituteStarter,
  updateSlot,
} from './domain'
import { isSlotAdmin } from './admin'
import { getLocalProfiles, USERS_EVENT } from './auth'
import { firestore, hasRemoteBackend } from './firebase'
import {
  fixedSeatMatchingMembers,
  fixedSeatMemberIdsForSlot,
  fixedSeatSlotBucketIds,
} from './fixedSeat'
import { mondayOfWeek, pollWeekTitle, slotWeekTitle, weekStartForDateTime } from './format'
import type { NotificationDelivery } from './notificationHistory'

export interface PadelRepository {
  subscribePolls(listener: (polls: PadelPoll[]) => void, onError: (error: Error) => void): Unsubscribe
  subscribeMembers(listener: (members: MemberProfile[]) => void, onError: (error: Error) => void): Unsubscribe
  subscribeMatchFeedbackResponses(
    reviewerId: string,
    listener: (responses: MatchFeedbackResponse[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe
  subscribeMatchFeedbackSummaries(
    listener: (summaries: MatchFeedbackSummary[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe
  subscribeMatchReports(
    participantId: string,
    listener: (reports: MatchReport[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe
  subscribeAllMatchReports(
    listener: (reports: MatchReport[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe
  subscribeFantasyRounds(
    listener: (rounds: FantasyRound[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe
  subscribeFantasyEntry(
    roundId: string,
    managerId: string,
    listener: (entry: FantasyEntry | undefined) => void,
    onError: (error: Error) => void,
  ): Unsubscribe
  subscribeFantasyRoundEntries(
    roundId: string,
    listener: (entries: FantasyEntry[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe
  subscribeNotificationDeliveries(
    userId: string,
    listener: (deliveries: NotificationDelivery[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe
  markNotificationDeliveriesRead(deliveryIds: string[]): Promise<void>
  getSlotActivity(pollId: string, slotId: string): Promise<LocalActivityEvent[]>
  createPoll(input: CreatePollInput, creator: SessionUser): Promise<void>
  addSlot(pollId: string, input: SlotInput, creator: SessionUser): Promise<PadelPoll>
  joinSlot(pollId: string, slotId: string, member: SessionUser, role: SignupRole): Promise<PadelPoll>
  leaveSlot(pollId: string, slotId: string, member: SessionUser): Promise<PadelPoll>
  addGuest(
    pollId: string,
    slotId: string,
    actor: SessionUser,
    displayName: string,
    role: SignupRole,
  ): Promise<PadelPoll>
  removeGuest(
    pollId: string,
    slotId: string,
    actor: SessionUser,
    signupId: string,
  ): Promise<PadelPoll>
  adminUpdateSlotRoster(
    pollId: string,
    slotId: string,
    actor: SessionUser,
    action: AdminSlotRosterAction,
  ): Promise<PadelPoll>
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
  dismissMatchFeedbackPrompt(prompt: MatchFeedbackPrompt): Promise<MatchFeedbackResponse>
  submitMatchFeedback(
    prompt: MatchFeedbackPrompt,
    reviewer: SessionUser,
    ratings: Array<{ playerId: string; level: MatchFeedbackLevel }>,
  ): Promise<MatchFeedbackResponse>
  saveMatchReport(
    match: PlayerMatch,
    editor: SessionUser,
    sets: MatchSetInput[],
  ): Promise<MatchReport>
  saveFantasyEntry(
    roundId: string,
    manager: SessionUser,
    input: FantasySelectionInput,
  ): Promise<FantasyEntry>
}

type ActivityFactory = (before: PadelPoll, after: PadelPoll) => ActivityEventInput | null

function slotById(poll: PadelPoll, slotId: string): PadelSlot | undefined {
  return poll.slots.find((slot) => slot.id === slotId)
}

function normalizePollWeek(poll: PadelPoll): PadelPoll {
  const firstSlot = [...(poll.slots ?? [])].sort(
    (left, right) => left.startsAt.localeCompare(right.startsAt),
  )[0]
  const derivedWeekStart = firstSlot ? weekStartForDateTime(firstSlot.startsAt) : null
  const legacyWeekStart = mondayOfWeek(poll.targetWeekStart)
  const targetWeekStart = derivedWeekStart ?? legacyWeekStart ?? ''

  return {
    ...poll,
    title: targetWeekStart ? pollWeekTitle(targetWeekStart) : poll.title || 'Padel',
    targetWeekStart,
    slots: poll.slots ?? [],
  }
}

function storedPollData(poll: Omit<PadelPoll, 'id'>) {
  return {
    createdBy: poll.createdBy,
    createdByName: poll.createdByName,
    createdAt: poll.createdAt,
    updatedAt: poll.updatedAt,
    status: poll.status,
    slots: poll.slots,
  }
}

function storedLocalPollData(poll: PadelPoll) {
  return { id: poll.id, ...storedPollData(poll) }
}

function signupRole(slot: PadelSlot, userId: string): SignupRole {
  return getStarters(slot).some((signup) => signup.userId === userId) ? 'starter' : 'reserve'
}

function adminRosterActivityDetails(
  slot: PadelSlot,
  action: AdminSlotRosterAction,
): Record<string, ActivityDetail> {
  if (action.kind === 'add') {
    return {
      action: 'added',
      targetUserId: action.member.id,
      targetName: action.member.displayName,
      toRole: action.role,
    }
  }

  const signup = slot.signups.find((entry) => entry.id === action.signupId)
  if (!signup) throw new Error('Giocatore non trovato nello slot.')
  const fromRole = signupRole(slot, signup.userId)
  return action.kind === 'remove'
    ? {
      action: 'removed',
      targetUserId: signup.userId,
      targetName: signup.displayName,
      fromRole,
    }
    : {
      action: 'role_changed',
      targetUserId: signup.userId,
      targetName: signup.displayName,
      fromRole,
      toRole: action.role,
    }
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

interface FixedSeatJoin {
  slot: PadelSlot
  member: MemberProfile
}

function applyFixedSeatPreferences(
  poll: PadelPoll,
  members: MemberProfile[],
  slotIds?: ReadonlySet<string>,
): { poll: PadelPoll; joins: FixedSeatJoin[] } {
  const joins: FixedSeatJoin[] = []
  const slots = poll.slots.map((slot) => {
    if (slotIds && !slotIds.has(slot.id)) return slot
    let updated = slot
    fixedSeatMatchingMembers(slot, members).forEach((member, index) => {
      if (updated.signups.some((signup) => signup.userId === member.id)) return
      updated = addSignup(
        updated,
        member,
        (slot.createdAt ?? poll.createdAt) + index,
        'starter',
        'fixed-seat',
      )
      joins.push({ slot: updated, member })
    })
    return updated
  })

  return {
    poll: { ...poll, slots },
    joins,
  }
}

function fixedSeatJoinEvents(
  poll: PadelPoll,
  creator: SessionUser,
  joins: FixedSeatJoin[],
): ActivityEventInput[] {
  return joins.map(({ slot, member }) => makeActivityEvent(
    'fixed_seat_auto_joined',
    creator,
    poll,
    slot,
    {
      targetUserId: member.id,
      targetName: member.displayName,
      role: 'starter',
    },
  ))
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

function makeFeedbackResponse(
  prompt: MatchFeedbackPrompt,
  status: MatchFeedbackResponse['status'],
  ratingInputs: Array<{ playerId: string; level: MatchFeedbackLevel }> = [],
  closedAt = Date.now(),
): MatchFeedbackResponse {
  const inputByPlayer = new Map(ratingInputs.map((rating) => [rating.playerId, rating]))
  if (
    status === 'submitted'
    && (ratingInputs.length !== prompt.candidates.length || inputByPlayer.size !== prompt.candidates.length)
  ) {
    throw new Error('Assegna un giudizio a ogni compagno prima di continuare.')
  }
  const ratings = prompt.candidates.map((candidate) => {
    const input = inputByPlayer.get(candidate.userId)
    if (!input) return null
    const definition = getMatchFeedbackDefinition(input.level)
    return {
      playerId: candidate.userId,
      playerName: candidate.displayName,
      level: definition.level,
      scoreUnits: definition.scoreUnits,
    }
  })
  if (status === 'submitted' && ratings.some((rating) => rating === null)) {
    throw new Error('Uno dei giudizi non appartiene a questa partita.')
  }
  return {
    id: prompt.id,
    pollId: prompt.pollId,
    slotId: prompt.slotId,
    reviewerId: prompt.reviewerId,
    status,
    ...(status === 'submitted' ? { ratings: ratings.filter((rating) => rating !== null) } : {}),
    closedAt,
  }
}

function starterRosterSnapshot(slot: PadelSlot | undefined): string {
  if (!slot) return '[]'
  return JSON.stringify(getStarters(slot).map((signup) => ({
    userId: signup.userId,
    displayName: signup.displayName,
    isGuest: isGuestSignup(signup),
  })))
}

function remoteRepository(): PadelRepository {
  if (!firestore) throw new Error('Firebase non è configurato.')
  const db = firestore

  const readFixedSeatMembers = async (
    transaction: Transaction,
    slots: PadelSlot[],
  ): Promise<MemberProfile[]> => {
    const bucketIds = Array.from(new Set(slots.flatMap(fixedSeatSlotBucketIds)))
    const bucketSnapshots = await Promise.all(
      bucketIds.map((bucketId) => transaction.get(doc(db, 'fixedSeatBuckets', bucketId))),
    )
    const membersByBucket = new Map<string, string[]>()
    bucketSnapshots.forEach((snapshot, index) => {
      if (!snapshot.exists()) return
      const members = snapshot.data().members
      if (!members || typeof members !== 'object') return
      membersByBucket.set(bucketIds[index], Object.entries(members)
        .filter(([, enabled]) => enabled === true)
        .map(([userId]) => userId))
    })
    const relevantIds = Array.from(new Set(
      slots.flatMap((slot) => fixedSeatMemberIdsForSlot(slot, membersByBucket)),
    ))
    const userSnapshots = await Promise.all(
      relevantIds.map((userId) => transaction.get(doc(db, 'users', userId))),
    )
    return userSnapshots.flatMap((snapshot, index) => (
      snapshot.exists()
        ? [{ id: relevantIds[index], ...snapshot.data() } as MemberProfile]
        : []
    ))
  }

  const mutatePoll = async (
    pollId: string,
    mutate: (poll: PadelPoll) => PadelPoll,
    activityFactory: ActivityFactory,
  ) => {
    const reference = doc(db, 'polls', pollId)
    return runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(reference)
      if (!snapshot.exists()) throw new Error('Sondaggio non trovato.')
      const poll = normalizePollWeek({ id: snapshot.id, ...snapshot.data() } as PadelPoll)
      const mutated = mutate(poll)
      const updated = mutated.updatedAt > poll.updatedAt
        ? mutated
        : { ...mutated, updatedAt: poll.updatedAt + 1 }
      const updatedSlotsById = new Map(updated.slots.map((slot) => [slot.id, slot]))
      const changedStarterSlotIds = poll.slots
        .filter((slot) => (
          starterRosterSnapshot(slot) !== starterRosterSnapshot(updatedSlotsById.get(slot.id))
        ))
        .map((slot) => slot.id)
      const roundReferences = changedStarterSlotIds.map((slotId) => (
        doc(db, 'fantasyRounds', getFantasyRoundId(pollId, slotId))
      ))
      const roundSnapshots = await Promise.all(
        roundReferences.map((roundReference) => transaction.get(roundReference)),
      )

      transaction.update(reference, {
        slots: updated.slots,
        status: updated.status,
        updatedAt: updated.updatedAt,
      })
      const activity = activityFactory(poll, updated)
      if (activity) setRemoteActivity(db, transaction, activity)
      roundSnapshots.forEach((roundSnapshot, index) => {
        if (!roundSnapshot.exists()) return
        const existingRound = {
          ...roundSnapshot.data(),
          id: roundSnapshot.id,
        } as FantasyRound
        const synchronizedRound = reconcileFantasyRoundRosterMutation(
          updated,
          changedStarterSlotIds[index],
          existingRound,
          updated.updatedAt,
        )
        if (synchronizedRound !== existingRound) {
          transaction.set(roundReferences[index], synchronizedRound)
        }
      })
      return updated
    })
  }

  return {
    subscribePolls(listener, onError) {
      return onSnapshot(
        query(collection(db, 'polls'), orderBy('createdAt', 'desc')),
        (snapshot) => listener(snapshot.docs.map((item) => (
          normalizePollWeek({ id: item.id, ...item.data() } as PadelPoll)
        ))),
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
    subscribeMatchFeedbackResponses(reviewerId, listener, onError) {
      let currentResponses: MatchFeedbackResponse[] = []
      let legacyMvpResponses: MatchFeedbackResponse[] = []
      let legacyRatingResponses: MatchFeedbackResponse[] = []
      const emit = () => listener([
        ...[...legacyMvpResponses, ...legacyRatingResponses].filter((legacy) => (
          !currentResponses.some((response) => response.id === legacy.id)
        )),
        ...currentResponses,
      ])
      const stopCurrent = onSnapshot(
        query(collection(db, 'matchFeedbackResponses'), where('reviewerId', '==', reviewerId)),
        (snapshot) => {
          currentResponses = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }) as MatchFeedbackResponse)
          emit()
        },
        onError,
      )
      const stopLegacyMvp = onSnapshot(
        query(collection(db, 'matchMvpResponses'), where('voterId', '==', reviewerId)),
        (snapshot) => {
          legacyMvpResponses = snapshot.docs.map((item) => {
            const data = item.data() as {
              pollId: string
              slotId: string
              voterId: string
              status: MatchFeedbackResponse['status']
              closedAt: number
            }
            return {
              id: item.id,
              pollId: data.pollId,
              slotId: data.slotId,
              reviewerId: data.voterId,
              status: data.status,
              closedAt: data.closedAt,
            }
          })
          emit()
        },
        onError,
      )
      const stopLegacyRatings = onSnapshot(
        query(collection(db, 'matchRatingResponses'), where('reviewerId', '==', reviewerId)),
        (snapshot) => {
          legacyRatingResponses = snapshot.docs.map((item) => {
            const data = item.data() as {
              pollId: string
              slotId: string
              reviewerId: string
              status: MatchFeedbackResponse['status']
              closedAt: number
            }
            return {
              id: item.id,
              pollId: data.pollId,
              slotId: data.slotId,
              reviewerId: data.reviewerId,
              status: data.status,
              closedAt: data.closedAt,
            }
          })
          emit()
        },
        onError,
      )
      return () => {
        stopCurrent()
        stopLegacyMvp()
        stopLegacyRatings()
      }
    },
    subscribeMatchFeedbackSummaries(listener, onError) {
      return onSnapshot(
        collection(db, 'matchFeedbackSummaries'),
        (snapshot) => listener(snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }) as MatchFeedbackSummary)),
        onError,
      )
    },
    subscribeMatchReports(participantId, listener, onError) {
      return onSnapshot(
        query(collection(db, 'matchReports'), where('participantIds', 'array-contains', participantId)),
        (snapshot) => listener(snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }) as MatchReport)),
        onError,
      )
    },
    subscribeAllMatchReports(listener, onError) {
      return onSnapshot(
        collection(db, 'matchReports'),
        (snapshot) => listener(snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }) as MatchReport)),
        onError,
      )
    },
    subscribeFantasyRounds(listener, onError) {
      return onSnapshot(
        collection(db, 'fantasyRounds'),
        (snapshot) => listener(snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }) as FantasyRound)),
        onError,
      )
    },
    subscribeFantasyEntry(roundId, managerId, listener, onError) {
      return onSnapshot(
        doc(db, 'fantasyRounds', roundId, 'entries', managerId),
        (snapshot) => listener(snapshot.exists()
          ? { id: snapshot.id, ...snapshot.data() } as FantasyEntry
          : undefined),
        onError,
      )
    },
    subscribeFantasyRoundEntries(roundId, listener, onError) {
      return onSnapshot(
        collection(db, 'fantasyRounds', roundId, 'entries'),
        (snapshot) => listener(snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }) as FantasyEntry)),
        onError,
      )
    },
    subscribeNotificationDeliveries(userId, listener, onError) {
      return onSnapshot(
        query(collection(db, 'notificationDeliveries'), where('userId', '==', userId)),
        (snapshot) => listener(snapshot.docs.map((item) => {
          const data = item.data() as Omit<NotificationDelivery, 'id' | 'sentAt' | 'readAt'> & {
            sentAt?: number | { toMillis: () => number }
            readAt?: number | { toMillis: () => number }
          }
          const sentAt = typeof data.sentAt === 'number'
            ? data.sentAt
            : data.sentAt?.toMillis() ?? 0
          const readAt = typeof data.readAt === 'number'
            ? data.readAt
            : data.readAt?.toMillis()
          return {
            ...data,
            id: item.id,
            sentAt,
            readAt,
          }
        })),
        onError,
      )
    },
    async markNotificationDeliveriesRead(deliveryIds) {
      const uniqueIds = Array.from(new Set(deliveryIds))
      const batchSize = 400
      for (let offset = 0; offset < uniqueIds.length; offset += batchSize) {
        const batch = writeBatch(db)
        uniqueIds.slice(offset, offset + batchSize).forEach((deliveryId) => {
          batch.update(doc(db, 'notificationDeliveries', deliveryId), {
            readAt: serverTimestamp(),
          })
        })
        await batch.commit()
      }
    },
    async getSlotActivity(pollId, slotId) {
      const snapshot = await getDocs(
        query(collection(db, 'activityEvents'), where('slotId', '==', slotId)),
      )
      return snapshot.docs
        .map((item) => {
          const data = item.data() as ActivityEventInput & {
            occurredAt?: number | { toMillis: () => number }
          }
          const occurredAt = typeof data.occurredAt === 'number'
            ? data.occurredAt
            : data.occurredAt?.toMillis() ?? 0
          return {
            ...data,
            id: item.id,
            occurredAt,
          }
        })
        .filter((event) => event.pollId === pollId)
        .sort((left, right) => right.occurredAt - left.occurredAt || right.id.localeCompare(left.id))
    },
    async createPoll(input, creator) {
      const data = makePoll(input, creator)
      const reference = doc(collection(db, 'polls'))
      await runTransaction(db, async (transaction) => {
        const members = await readFixedSeatMembers(transaction, data.slots)
        const applied = applyFixedSeatPreferences({ id: reference.id, ...data }, members)
        transaction.set(reference, storedPollData(applied.poll))
        ;[
          ...pollCreationEvents(applied.poll, creator),
          ...fixedSeatJoinEvents(applied.poll, creator, applied.joins),
        ].forEach((activity) => setRemoteActivity(db, transaction, activity))
      })
    },
    async addSlot(pollId, input, creator) {
      const reference = doc(db, 'polls', pollId)
      return runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(reference)
        if (!snapshot.exists()) throw new Error('Sondaggio non trovato.')
        const before = normalizePollWeek({ id: snapshot.id, ...snapshot.data() } as PadelPoll)
        const withSlot = addSlotToPoll(before, input, creator)
        const previousIds = new Set(before.slots.map((slot) => slot.id))
        const added = withSlot.slots.find((slot) => !previousIds.has(slot.id))
        if (!added) throw new Error('Slot non trovato.')
        const members = await readFixedSeatMembers(transaction, [added])
        const applied = applyFixedSeatPreferences(withSlot, members, new Set([added.id]))
        const appliedSlot = applied.poll.slots.find((slot) => slot.id === added.id) ?? added
        transaction.update(reference, {
          slots: applied.poll.slots,
          status: applied.poll.status,
          updatedAt: applied.poll.updatedAt,
        })
        setRemoteActivity(db, transaction, makeActivityEvent(
          'slot_created',
          creator,
          applied.poll,
          appliedSlot,
          { durationMinutes: appliedSlot.durationMinutes },
        ))
        fixedSeatJoinEvents(applied.poll, creator, applied.joins)
          .forEach((activity) => setRemoteActivity(db, transaction, activity))
        return applied.poll
      })
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
    async addGuest(pollId, slotId, actor, displayName, role) {
      return mutatePoll(
        pollId,
        (poll) => updateSlot(
          poll,
          slotId,
          (slot) => addGuestSignup(slot, displayName, actor, Date.now(), role),
        ),
        (before, after) => {
          const previous = slotById(before, slotId)
          const updated = slotById(after, slotId)
          const previousIds = new Set(previous?.signups.map((signup) => signup.id))
          const guest = updated?.signups.find((signup) => isGuestSignup(signup) && !previousIds.has(signup.id))
          return updated && guest
            ? makeActivityEvent('guest_added', actor, after, updated, {
              guestName: guest.displayName,
              guestSignupId: guest.id,
              role,
            })
            : null
        },
      )
    },
    async removeGuest(pollId, slotId, actor, signupId) {
      return mutatePoll(
        pollId,
        (poll) => updateSlot(poll, slotId, (slot) => removeGuestSignup(slot, signupId)),
        (before) => {
          const previous = slotById(before, slotId)
          const guest = previous?.signups.find((signup) => signup.id === signupId && isGuestSignup(signup))
          return previous && guest
            ? makeActivityEvent('guest_removed', actor, before, previous, {
              guestName: guest.displayName,
              guestSignupId: guest.id,
              role: signupRole(previous, guest.userId),
              joinedAt: guest.joinedAt,
            })
            : null
        },
      )
    },
    async adminUpdateSlotRoster(pollId, slotId, actor, action) {
      if (!isSlotAdmin(actor.id)) throw new Error('Solo l’amministratore può modificare la formazione.')
      return mutatePoll(
        pollId,
        (poll) => updateSlot(
          poll,
          slotId,
          (slot) => applyAdminSlotRosterAction(slot, action),
        ),
        (before, after) => {
          const previous = slotById(before, slotId)
          const updated = slotById(after, slotId)
          return previous && updated
            ? makeActivityEvent(
              'slot_roster_admin_updated',
              actor,
              after,
              updated,
              adminRosterActivityDetails(previous, action),
            )
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
        const poll = normalizePollWeek({ id: snapshot.id, ...snapshot.data() } as PadelPoll)
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
            pollTitle: slotWeekTitle(slot.startsAt),
            slotStartsAt: slot.startsAt,
            viewerName: viewer.displayName,
            lastViewedAt: serverTimestamp(),
            viewCount: (current.viewCount ?? 0) + 1,
          })
          return
        }
        transaction.set(reference, {
          pollId: poll.id,
          pollTitle: slotWeekTitle(slot.startsAt),
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
    async dismissMatchFeedbackPrompt(prompt) {
      const reference = doc(db, 'matchFeedbackResponses', prompt.id)
      return runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(reference)
        if (snapshot.exists()) return { id: snapshot.id, ...snapshot.data() } as MatchFeedbackResponse
        const response = makeFeedbackResponse(prompt, 'dismissed')
        transaction.set(reference, response)
        return response
      })
    },
    async submitMatchFeedback(prompt, reviewer, ratings) {
      if (prompt.reviewerId !== reviewer.id) {
        throw new Error('Questa scheda appartiene a un altro giocatore.')
      }
      const response = makeFeedbackResponse(prompt, 'submitted', ratings)
      const responseReference = doc(db, 'matchFeedbackResponses', prompt.id)
      const batch = writeBatch(db)
      response.ratings?.forEach((rating) => {
        const summaryId = getMatchFeedbackSummaryId(prompt.pollId, prompt.slotId, rating.playerId)
        batch.set(doc(db, 'matchFeedbackSummaries', summaryId), {
          id: summaryId,
          pollId: prompt.pollId,
          slotId: prompt.slotId,
          playerId: rating.playerId,
          scoreUnitsTotal: increment(rating.scoreUnits),
          ratingCount: increment(1),
          lastResponseId: response.id,
          updatedAt: response.closedAt,
        }, { merge: true })
      })
      batch.set(responseReference, response)
      await batch.commit()
      return response
    },
    async saveMatchReport(match, editor, sets) {
      const reference = doc(db, 'matchReports', `${match.pollId}__${match.slot.id}`)
      return runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(reference)
        const existing = snapshot.exists()
          ? { id: snapshot.id, ...snapshot.data() } as MatchReport
          : undefined
        const report = makeMatchReport(match, editor, sets, existing)
        transaction.set(reference, report)
        return report
      })
    },
    async saveFantasyEntry(roundId, manager, input) {
      const roundReference = doc(db, 'fantasyRounds', roundId)
      const entryReference = doc(db, 'fantasyRounds', roundId, 'entries', manager.id)
      return runTransaction(db, async (transaction) => {
        const [roundSnapshot, entrySnapshot] = await Promise.all([
          transaction.get(roundReference),
          transaction.get(entryReference),
        ])
        if (!roundSnapshot.exists()) throw new Error('Round FantaBandeja non trovato.')
        const round = { id: roundSnapshot.id, ...roundSnapshot.data() } as FantasyRound
        const existing = entrySnapshot.exists()
          ? { id: entrySnapshot.id, ...entrySnapshot.data() } as FantasyEntry
          : undefined
        const entry = makeFantasyEntry(round, manager, input, existing)
        transaction.set(entryReference, entry)
        return entry
      })
    },
  }
}

const LOCAL_POLLS_KEY = 'bandeja-boys:polls'
const POLLS_EVENT = 'bandeja-boys:polls-changed'
const LOCAL_MATCH_FEEDBACK_KEY = 'bandeja-boys:match-feedback'
const MATCH_FEEDBACK_EVENT = 'bandeja-boys:match-feedback-changed'
const LEGACY_LOCAL_MATCH_MVP_KEY = 'bandeja-boys:match-mvp'
const LEGACY_LOCAL_MATCH_RATINGS_KEY = 'bandeja-boys:match-ratings'
const LOCAL_MATCH_REPORTS_KEY = 'bandeja-boys:match-reports'
const MATCH_REPORTS_EVENT = 'bandeja-boys:match-reports-changed'
const LOCAL_FANTASY_KEY = 'bandeja-boys:fantasy'
const FANTASY_EVENT = 'bandeja-boys:fantasy-changed'
const LOCAL_ACTIVITY_KEY = 'bandeja-boys:activity'

interface LocalMatchFeedbackStore {
  responses: MatchFeedbackResponse[]
}

interface LocalActivityStore {
  events: LocalActivityEvent[]
  views: LocalSlotView[]
}

interface LocalFantasyStore {
  rounds: FantasyRound[]
  entries: FantasyEntry[]
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
  const targetWeekStart = mondayOfWeek(next.toISOString().slice(0, 10)) ?? next.toISOString().slice(0, 10)
  const signups = demoMembers.slice(0, 5).map((member, index) => ({
    id: `demo-signup-${index}`,
    userId: member.id,
    displayName: member.displayName,
    joinedAt: now - (5 - index) * 60_000,
  }))
  return [
    {
      id: 'demo-poll',
      title: pollWeekTitle(targetWeekStart),
      targetWeekStart,
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
    if (stored) return (JSON.parse(stored) as PadelPoll[]).map(normalizePollWeek)
  } catch {
    // A fresh demo dataset is safer than blocking the UI on malformed local data.
  }
  const polls = seedPolls()
  localStorage.setItem(LOCAL_POLLS_KEY, JSON.stringify(polls))
  return polls
}

function writeLocalPolls(polls: PadelPoll[]) {
  localStorage.setItem(LOCAL_POLLS_KEY, JSON.stringify(polls.map(storedLocalPollData)))
  window.dispatchEvent(new Event(POLLS_EVENT))
}

function readLocalMatchFeedbackStore(): LocalMatchFeedbackStore {
  try {
    const stored = localStorage.getItem(LOCAL_MATCH_FEEDBACK_KEY)
    if (stored) return JSON.parse(stored) as LocalMatchFeedbackStore
  } catch {
    // Malformed demo data must not block the MVP prompt.
  }
  return { responses: [] }
}

function readLegacyLocalClosedResponses(reviewerId?: string): MatchFeedbackResponse[] {
  const readLegacy = (key: string, reviewerField: 'reviewerId' | 'voterId') => {
    try {
      const stored = localStorage.getItem(key)
      if (!stored) return []
      const legacy = JSON.parse(stored) as {
      responses?: Array<{
        id: string
        pollId: string
        slotId: string
        reviewerId?: string
        voterId?: string
        status: MatchFeedbackResponse['status']
        closedAt: number
      }>
      }
      return (legacy.responses ?? []).flatMap((response) => {
        const legacyReviewerId = response[reviewerField]
        if (!legacyReviewerId || (reviewerId && legacyReviewerId !== reviewerId)) return []
        return [{
          id: response.id,
          pollId: response.pollId,
          slotId: response.slotId,
          reviewerId: legacyReviewerId,
          status: response.status,
          closedAt: response.closedAt,
        } satisfies MatchFeedbackResponse]
      })
    } catch {
      return []
    }
  }
  return [
    ...readLegacy(LEGACY_LOCAL_MATCH_MVP_KEY, 'voterId'),
    ...readLegacy(LEGACY_LOCAL_MATCH_RATINGS_KEY, 'reviewerId'),
  ]
}

function writeLocalMatchFeedbackStore(store: LocalMatchFeedbackStore) {
  localStorage.setItem(LOCAL_MATCH_FEEDBACK_KEY, JSON.stringify(store))
  window.dispatchEvent(new Event(MATCH_FEEDBACK_EVENT))
}

function readLocalMatchReports(): MatchReport[] {
  try {
    const stored = localStorage.getItem(LOCAL_MATCH_REPORTS_KEY)
    if (stored) return JSON.parse(stored) as MatchReport[]
  } catch {
    // Malformed demo reports must not block the match history.
  }
  return []
}

function writeLocalMatchReports(reports: MatchReport[]) {
  localStorage.setItem(LOCAL_MATCH_REPORTS_KEY, JSON.stringify(reports))
  window.dispatchEvent(new Event(MATCH_REPORTS_EVENT))
}

function readLocalFantasyStore(): LocalFantasyStore {
  try {
    const stored = localStorage.getItem(LOCAL_FANTASY_KEY)
    if (stored) return JSON.parse(stored) as LocalFantasyStore
  } catch {
    // Malformed demo fantasy data must not block the rest of the app.
  }
  return { rounds: [], entries: [] }
}

function writeLocalFantasyStore(store: LocalFantasyStore, notify = true) {
  localStorage.setItem(LOCAL_FANTASY_KEY, JSON.stringify(store))
  if (notify) window.dispatchEvent(new Event(FANTASY_EVENT))
}

function reconcileLocalFantasyStore(): LocalFantasyStore {
  const current = readLocalFantasyStore()
  const rounds = reconcileFantasyRounds(
    readLocalPolls(),
    current.rounds,
    current.entries,
    aggregateMatchFeedbackSummaries(readLocalMatchFeedbackStore().responses),
    [...readLegacyLocalClosedResponses(), ...readLocalMatchFeedbackStore().responses],
    readLocalMatchReports(),
  )
  const next = { ...current, rounds }
  if (JSON.stringify(next.rounds) !== JSON.stringify(current.rounds)) {
    writeLocalFantasyStore(next, false)
  }
  return next
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
    subscribeMatchFeedbackResponses(reviewerId, listener) {
      const notify = () => {
        const current = readLocalMatchFeedbackStore().responses.filter(
          (response) => response.reviewerId === reviewerId,
        )
        const currentIds = new Set(current.map((response) => response.id))
        listener([
          ...readLegacyLocalClosedResponses(reviewerId).filter((response) => !currentIds.has(response.id)),
          ...current,
        ])
      }
      window.addEventListener(MATCH_FEEDBACK_EVENT, notify)
      notify()
      return () => window.removeEventListener(MATCH_FEEDBACK_EVENT, notify)
    },
    subscribeMatchFeedbackSummaries(listener) {
      const notify = () => listener(
        aggregateMatchFeedbackSummaries(readLocalMatchFeedbackStore().responses),
      )
      window.addEventListener(MATCH_FEEDBACK_EVENT, notify)
      notify()
      return () => window.removeEventListener(MATCH_FEEDBACK_EVENT, notify)
    },
    subscribeMatchReports(participantId, listener) {
      const notify = () => listener(
        readLocalMatchReports().filter((report) => report.participantIds.includes(participantId)),
      )
      window.addEventListener(MATCH_REPORTS_EVENT, notify)
      notify()
      return () => window.removeEventListener(MATCH_REPORTS_EVENT, notify)
    },
    subscribeAllMatchReports(listener) {
      const notify = () => listener(readLocalMatchReports())
      window.addEventListener(MATCH_REPORTS_EVENT, notify)
      notify()
      return () => window.removeEventListener(MATCH_REPORTS_EVENT, notify)
    },
    subscribeFantasyRounds(listener) {
      const notify = () => listener(reconcileLocalFantasyStore().rounds)
      const events = [FANTASY_EVENT, POLLS_EVENT, MATCH_FEEDBACK_EVENT, MATCH_REPORTS_EVENT]
      events.forEach((eventName) => window.addEventListener(eventName, notify))
      notify()
      return () => events.forEach((eventName) => window.removeEventListener(eventName, notify))
    },
    subscribeFantasyEntry(roundId, managerId, listener) {
      const notify = () => listener(
        readLocalFantasyStore().entries.find((entry) => (
          entry.roundId === roundId && entry.managerId === managerId
        )),
      )
      window.addEventListener(FANTASY_EVENT, notify)
      notify()
      return () => window.removeEventListener(FANTASY_EVENT, notify)
    },
    subscribeFantasyRoundEntries(roundId, listener) {
      const notify = () => listener(
        readLocalFantasyStore().entries.filter((entry) => entry.roundId === roundId),
      )
      window.addEventListener(FANTASY_EVENT, notify)
      notify()
      return () => window.removeEventListener(FANTASY_EVENT, notify)
    },
    subscribeNotificationDeliveries(_userId, listener) {
      listener([])
      return () => undefined
    },
    async markNotificationDeliveriesRead() {
      return undefined
    },
    async getSlotActivity(pollId, slotId) {
      return readLocalActivityStore().events
        .filter((event) => event.pollId === pollId && event.slotId === slotId)
        .sort((left, right) => right.occurredAt - left.occurredAt || right.id.localeCompare(left.id))
    },
    async createPoll(input, creator) {
      const data = makePoll(input, creator)
      const poll = { id: `poll-${Date.now()}`, ...data }
      const members = [...demoMembers, ...getLocalProfiles()]
      const applied = applyFixedSeatPreferences(poll, members)
      writeLocalPolls([applied.poll, ...readLocalPolls()])
      writeLocalActivities([
        ...pollCreationEvents(applied.poll, creator),
        ...fixedSeatJoinEvents(applied.poll, creator, applied.joins),
      ], applied.poll.createdAt)
    },
    async addSlot(pollId, input, creator) {
      let joins: FixedSeatJoin[] = []
      const updated = await mutate(
        pollId,
        (poll) => {
          const withSlot = addSlotToPoll(poll, input, creator)
          const previousIds = new Set(poll.slots.map((slot) => slot.id))
          const applied = applyFixedSeatPreferences(
            withSlot,
            [...demoMembers, ...getLocalProfiles()],
            new Set(withSlot.slots
              .filter((slot) => !previousIds.has(slot.id))
              .map((slot) => slot.id)),
          )
          joins = applied.joins
          return applied.poll
        },
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
      writeLocalActivities(fixedSeatJoinEvents(updated, creator, joins))
      return updated
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
    async addGuest(pollId, slotId, actor, displayName, role) {
      return mutate(
        pollId,
        (poll) => updateSlot(
          poll,
          slotId,
          (slot) => addGuestSignup(slot, displayName, actor, Date.now(), role),
        ),
        (before, after) => {
          const previous = slotById(before, slotId)
          const updated = slotById(after, slotId)
          const previousIds = new Set(previous?.signups.map((signup) => signup.id))
          const guest = updated?.signups.find((signup) => isGuestSignup(signup) && !previousIds.has(signup.id))
          return updated && guest
            ? makeActivityEvent('guest_added', actor, after, updated, {
              guestName: guest.displayName,
              guestSignupId: guest.id,
              role,
            })
            : null
        },
      )
    },
    async removeGuest(pollId, slotId, actor, signupId) {
      return mutate(
        pollId,
        (poll) => updateSlot(poll, slotId, (slot) => removeGuestSignup(slot, signupId)),
        (before) => {
          const previous = slotById(before, slotId)
          const guest = previous?.signups.find((signup) => signup.id === signupId && isGuestSignup(signup))
          return previous && guest
            ? makeActivityEvent('guest_removed', actor, before, previous, {
              guestName: guest.displayName,
              guestSignupId: guest.id,
              role: signupRole(previous, guest.userId),
              joinedAt: guest.joinedAt,
            })
            : null
        },
      )
    },
    async adminUpdateSlotRoster(pollId, slotId, actor, action) {
      if (!isSlotAdmin(actor.id)) throw new Error('Solo l’amministratore può modificare la formazione.')
      return mutate(
        pollId,
        (poll) => updateSlot(
          poll,
          slotId,
          (slot) => applyAdminSlotRosterAction(slot, action),
        ),
        (before, after) => {
          const previous = slotById(before, slotId)
          const updated = slotById(after, slotId)
          return previous && updated
            ? makeActivityEvent(
              'slot_roster_admin_updated',
              actor,
              after,
              updated,
              adminRosterActivityDetails(previous, action),
            )
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
          pollTitle: slotWeekTitle(slot.startsAt),
          slotStartsAt: slot.startsAt,
          viewerName: viewer.displayName,
          lastViewedAt: now,
          viewCount: store.views[index].viewCount + 1,
        }
      } else {
        store.views.push({
          id,
          pollId: poll.id,
          pollTitle: slotWeekTitle(slot.startsAt),
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
    async dismissMatchFeedbackPrompt(prompt) {
      const store = readLocalMatchFeedbackStore()
      const existing = store.responses.find((response) => response.id === prompt.id)
      if (existing) return existing
      const response = makeFeedbackResponse(prompt, 'dismissed')
      writeLocalMatchFeedbackStore({ responses: [...store.responses, response] })
      return response
    },
    async submitMatchFeedback(prompt, reviewer, ratings) {
      const store = readLocalMatchFeedbackStore()
      if (store.responses.some((response) => response.id === prompt.id)) {
        throw new Error('Questa scheda è già stata chiusa.')
      }
      if (prompt.reviewerId !== reviewer.id) {
        throw new Error('Questa scheda appartiene a un altro giocatore.')
      }
      const response = makeFeedbackResponse(prompt, 'submitted', ratings)
      writeLocalMatchFeedbackStore({ responses: [...store.responses, response] })
      return response
    },
    async saveMatchReport(match, editor, sets) {
      const reports = readLocalMatchReports()
      const existingIndex = reports.findIndex(
        (report) => report.pollId === match.pollId && report.slotId === match.slot.id,
      )
      const report = makeMatchReport(
        match,
        editor,
        sets,
        existingIndex >= 0 ? reports[existingIndex] : undefined,
      )
      if (existingIndex >= 0) reports[existingIndex] = report
      else reports.push(report)
      writeLocalMatchReports(reports)
      return report
    },
    async saveFantasyEntry(roundId, manager, input) {
      const store = reconcileLocalFantasyStore()
      const round = store.rounds.find((item) => item.id === roundId)
      if (!round) throw new Error('Round FantaBandeja non trovato.')
      const existingIndex = store.entries.findIndex((entry) => (
        entry.roundId === roundId && entry.managerId === manager.id
      ))
      const entry = makeFantasyEntry(
        round,
        manager,
        input,
        existingIndex >= 0 ? store.entries[existingIndex] : undefined,
      )
      if (existingIndex >= 0) store.entries[existingIndex] = entry
      else store.entries.push(entry)
      writeLocalFantasyStore(store)
      return entry
    },
  }
}

export const repository: PadelRepository = hasRemoteBackend ? remoteRepository() : localRepository()
