import type {
  CreatePollInput,
  MemberProfile,
  PadelPoll,
  PadelSlot,
  SessionUser,
  Signup,
  SlotPhase,
} from '../types'

const STARTER_COUNT = 4

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
  return sortSignups(slot.signups).slice(0, STARTER_COUNT)
}

export function getReserves(slot: PadelSlot): Signup[] {
  return sortSignups(slot.signups).slice(STARTER_COUNT)
}

export function getSignupPosition(slot: PadelSlot, userId: string): number {
  return sortSignups(slot.signups).findIndex((signup) => signup.userId === userId)
}

export function isStarter(slot: PadelSlot, userId: string): boolean {
  const position = getSignupPosition(slot, userId)
  return position >= 0 && position < STARTER_COUNT
}

export function getSlotPhase(slot: PadelSlot): SlotPhase {
  if (slot.bookedAt) return 'booked'
  return slot.signups.length >= STARTER_COUNT ? 'ready' : 'collecting'
}

export function addSignup(
  slot: PadelSlot,
  member: Pick<MemberProfile, 'id' | 'displayName'>,
  joinedAt = Date.now(),
): PadelSlot {
  if (slot.signups.some((signup) => signup.userId === member.id)) return slot

  return {
    ...slot,
    signups: sortSignups([
      ...slot.signups,
      {
        id: makeId('signup'),
        userId: member.id,
        displayName: member.displayName,
        joinedAt,
      },
    ]),
  }
}

export function removeSignup(slot: PadelSlot, userId: string): PadelSlot {
  return {
    ...slot,
    signups: slot.signups.filter((signup) => signup.userId !== userId),
  }
}

export function substituteStarter(
  slot: PadelSlot,
  outgoingUserId: string,
  replacement: Pick<MemberProfile, 'id' | 'displayName'>,
  at = Date.now(),
): PadelSlot {
  const ordered = sortSignups(slot.signups)
  const outgoingIndex = ordered.findIndex((signup) => signup.userId === outgoingUserId)
  const replacementIndex = ordered.findIndex((signup) => signup.userId === replacement.id)

  if (outgoingIndex < 0 || outgoingIndex >= STARTER_COUNT) {
    throw new Error('Solo un titolare può passare il proprio posto.')
  }
  if (replacement.id === outgoingUserId) {
    throw new Error('Scegli una persona diversa.')
  }
  if (replacementIndex >= 0 && replacementIndex < STARTER_COUNT) {
    throw new Error('La persona scelta è già tra i titolari.')
  }

  const outgoing = ordered[outgoingIndex]
  const withoutReplacement = ordered.filter((signup) => signup.userId !== replacement.id)
  const adjustedOutgoingIndex = withoutReplacement.findIndex((signup) => signup.id === outgoing.id)
  withoutReplacement[adjustedOutgoingIndex] = {
    ...outgoing,
    userId: replacement.id,
    displayName: replacement.displayName,
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

export function makePoll(
  input: CreatePollInput,
  creator: SessionUser,
  now = Date.now(),
): Omit<PadelPoll, 'id'> {
  const title = input.title.trim()
  if (!title) throw new Error('Dai un nome al sondaggio.')
  if (!input.targetWeekStart) throw new Error('Scegli la settimana di gioco.')
  if (input.slots.length === 0) throw new Error('Aggiungi almeno uno slot.')

  const starts = input.slots.map((slot) => new Date(slot.startsAt))
  if (starts.some((date) => Number.isNaN(date.getTime()))) {
    throw new Error('Controlla data e ora degli slot.')
  }
  if (new Set(starts.map((date) => date.toISOString())).size !== starts.length) {
    throw new Error('Hai inserito due slot uguali.')
  }

  return {
    title,
    targetWeekStart: input.targetWeekStart,
    createdBy: creator.id,
    createdByName: creator.displayName,
    createdAt: now,
    updatedAt: now,
    status: 'open',
    slots: input.slots
      .map((slot, index) => ({
        id: makeId(`slot${index + 1}`),
        startsAt: new Date(slot.startsAt).toISOString(),
        durationMinutes: slot.durationMinutes,
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

