import type {
  FixedSeatPreference,
  FixedSeatWeekday,
  MemberProfile,
  PadelSlot,
} from '../types'

export const FIXED_SEAT_STEP_MINUTES = 30
export const FIXED_SEAT_MIN_DURATION_MINUTES = 60
export const FIXED_SEAT_MAX_PLAYERS = 3

const weekdayByLabel: Record<string, FixedSeatWeekday> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
}

const romePartsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Rome',
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function dateTimeParts(timestamp: number): Record<string, string> {
  return Object.fromEntries(
    romePartsFormatter.formatToParts(new Date(timestamp)).map(({ type, value }) => [type, value]),
  )
}

function isFixedSeatWeekday(value: number): value is FixedSeatWeekday {
  return Number.isInteger(value) && value >= 1 && value <= 7
}

export function fixedSeatPreferenceError(preference: FixedSeatPreference): string | null {
  if (!isFixedSeatWeekday(preference.weekday)) return 'Scegli un giorno valido.'
  if (
    !Number.isInteger(preference.startMinutes)
    || !Number.isInteger(preference.endMinutes)
    || preference.startMinutes < 0
    || preference.endMinutes > 24 * 60
    || preference.startMinutes % FIXED_SEAT_STEP_MINUTES !== 0
    || preference.endMinutes % FIXED_SEAT_STEP_MINUTES !== 0
  ) return 'Scegli una fascia con intervalli di 30 minuti.'
  if (preference.endMinutes - preference.startMinutes < FIXED_SEAT_MIN_DURATION_MINUTES) {
    return 'La fascia deve durare almeno un’ora.'
  }
  return null
}

export function normalizeFixedSeatPreference(
  value?: Partial<FixedSeatPreference> | null,
): FixedSeatPreference | undefined {
  if (!value) return undefined
  const preference = {
    weekday: Number(value.weekday) as FixedSeatWeekday,
    startMinutes: Number(value.startMinutes),
    endMinutes: Number(value.endMinutes),
  }
  return fixedSeatPreferenceError(preference) ? undefined : preference
}

export function fixedSeatBucketId(weekday: FixedSeatWeekday, minute: number): string {
  return `${weekday}-${String(minute).padStart(4, '0')}`
}

export function fixedSeatPreferenceBucketIds(preference: FixedSeatPreference): string[] {
  if (fixedSeatPreferenceError(preference)) return []
  const bucketIds: string[] = []
  for (
    let minute = preference.startMinutes;
    minute < preference.endMinutes;
    minute += FIXED_SEAT_STEP_MINUTES
  ) {
    bucketIds.push(fixedSeatBucketId(preference.weekday, minute))
  }
  return bucketIds
}

export function fixedSeatSlotBucketIds(
  slot: Pick<PadelSlot, 'startsAt' | 'durationMinutes'>,
): string[] {
  const startsAt = Date.parse(slot.startsAt)
  const endsAt = startsAt + slot.durationMinutes * 60_000
  if (
    !Number.isFinite(startsAt)
    || !Number.isFinite(endsAt)
    || slot.durationMinutes < FIXED_SEAT_MIN_DURATION_MINUTES
    || slot.durationMinutes % FIXED_SEAT_STEP_MINUTES !== 0
  ) return []

  const start = dateTimeParts(startsAt)
  const end = dateTimeParts(endsAt)
  const weekday = weekdayByLabel[start.weekday]
  const sameRomeDate = start.year === end.year && start.month === end.month && start.day === end.day
  if (!weekday || !sameRomeDate) return []

  const startMinutes = Number(start.hour) * 60 + Number(start.minute)
  const endMinutes = Number(end.hour) * 60 + Number(end.minute)
  if (
    startMinutes % FIXED_SEAT_STEP_MINUTES !== 0
    || endMinutes <= startMinutes
    || endMinutes % FIXED_SEAT_STEP_MINUTES !== 0
  ) return []

  return fixedSeatPreferenceBucketIds({ weekday, startMinutes, endMinutes })
}

export function fixedSeatPreferenceMatchesSlot(
  preference: FixedSeatPreference,
  slot: Pick<PadelSlot, 'startsAt' | 'durationMinutes'>,
): boolean {
  const preferenceBuckets = new Set(fixedSeatPreferenceBucketIds(preference))
  const slotBuckets = fixedSeatSlotBucketIds(slot)
  return slotBuckets.length > 0 && slotBuckets.every((bucketId) => preferenceBuckets.has(bucketId))
}

export function fixedSeatMaxOtherOverlap(
  members: Pick<MemberProfile, 'id' | 'fixedSeatPreference'>[],
  preference: FixedSeatPreference,
  currentUserId: string,
): number {
  const candidateBuckets = fixedSeatPreferenceBucketIds(preference)
  return candidateBuckets.reduce((maximum, bucketId) => {
    const count = members.filter((member) => {
      if (member.id === currentUserId) return false
      const existing = normalizeFixedSeatPreference(member.fixedSeatPreference)
      return existing ? fixedSeatPreferenceBucketIds(existing).includes(bucketId) : false
    }).length
    return Math.max(maximum, count)
  }, 0)
}

export function fixedSeatMatchingMembers(
  slot: Pick<PadelSlot, 'startsAt' | 'durationMinutes'>,
  members: MemberProfile[],
): MemberProfile[] {
  return members
    .filter((member) => {
      const preference = normalizeFixedSeatPreference(member.fixedSeatPreference)
      return preference ? fixedSeatPreferenceMatchesSlot(preference, slot) : false
    })
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id))
    .slice(0, FIXED_SEAT_MAX_PLAYERS)
}

export function fixedSeatMemberIdsForSlot(
  slot: Pick<PadelSlot, 'startsAt' | 'durationMinutes'>,
  bucketMembers: ReadonlyMap<string, readonly string[]>,
): string[] {
  const bucketIds = fixedSeatSlotBucketIds(slot)
  if (bucketIds.length === 0) return []
  const [first, ...rest] = bucketIds
  return Array.from(new Set(bucketMembers.get(first) ?? []))
    .filter((userId) => rest.every((bucketId) => bucketMembers.get(bucketId)?.includes(userId)))
    .sort()
    .slice(0, FIXED_SEAT_MAX_PLAYERS)
}
