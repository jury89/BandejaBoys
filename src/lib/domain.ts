import type {
  CreatePollInput,
  MemberProfile,
  PadelPoll,
  PadelSlot,
  SessionUser,
  Signup,
  SignupRole,
  SlotInput,
  SlotPhase,
} from '../types'

export const MAX_STARTERS = 4
export const MAX_SLOTS = 14
export const DEFAULT_VENUE = 'Oasi Boschetto'

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

export function rescheduleSlot(
  poll: PadelPoll,
  slotId: string,
  startsAt: string,
  updatedAt = Date.now(),
  timeIsTentative?: boolean,
): PadelPoll {
  const normalizedStartsAt = normalizeStartsAt(startsAt)
  if (poll.slots.some((slot) => slot.id !== slotId && slot.startsAt === normalizedStartsAt)) {
    throw new Error('Esiste già uno slot con questa data e questo orario.')
  }

  const updated = updateSlot(
    poll,
    slotId,
    (slot) => ({
      ...slot,
      startsAt: normalizedStartsAt,
      ...(timeIsTentative === undefined ? {} : { timeIsTentative }),
    }),
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
    timeIsTentative: Boolean(input.timeIsTentative),
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
  const title = input.title.trim()
  if (!title) throw new Error('Dai un nome al sondaggio.')
  if (!input.targetWeekStart) throw new Error('Scegli la settimana di gioco.')
  if (input.slots.length === 0) throw new Error('Aggiungi almeno uno slot.')
  if (input.slots.length > MAX_SLOTS) throw new Error(`Puoi inserire al massimo ${MAX_SLOTS} slot.`)

  const normalizedSlots = input.slots.map(normalizeSlotInput)
  if (new Set(normalizedSlots.map((slot) => slot.startsAt)).size !== normalizedSlots.length) {
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
    slots: normalizedSlots
      .map((slot, index) => ({
        id: makeId(`slot${index + 1}`),
        startsAt: slot.startsAt,
        durationMinutes: slot.durationMinutes,
        timeIsTentative: slot.timeIsTentative,
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
