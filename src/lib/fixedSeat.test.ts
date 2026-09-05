import type { MemberProfile, PadelSlot } from '../types'
import {
  fixedSeatMaxOtherOverlap,
  fixedSeatMemberIdsForSlot,
  fixedSeatPreferenceBucketIds,
  fixedSeatPreferenceMatchesSlot,
  fixedSeatSlotBucketIds,
  normalizeFixedSeatPreference,
} from './fixedSeat'

const tuesdayEvening = { weekday: 2 as const, startMinutes: 18 * 60, endMinutes: 20 * 60 }

function slot(startsAt: string, durationMinutes = 90): PadelSlot {
  return { id: 'slot', startsAt, durationMinutes, venue: '', signups: [] }
}

describe('posto fisso', () => {
  it('suddivide la preferenza in blocchi da mezz’ora', () => {
    expect(fixedSeatPreferenceBucketIds(tuesdayEvening)).toEqual([
      '2-1080', '2-1110', '2-1140', '2-1170',
    ])
  })

  it('considera soltanto slot interamente contenuti nella fascia a Roma', () => {
    expect(fixedSeatPreferenceMatchesSlot(tuesdayEvening, slot('2026-09-08T16:30:00.000Z'))).toBe(true)
    expect(fixedSeatPreferenceMatchesSlot(tuesdayEvening, slot('2026-09-08T15:30:00.000Z'))).toBe(false)
    expect(fixedSeatPreferenceMatchesSlot(tuesdayEvening, slot('2026-09-08T17:00:00.000Z', 120))).toBe(false)
    expect(fixedSeatPreferenceMatchesSlot(tuesdayEvening, slot('2026-09-09T16:30:00.000Z'))).toBe(false)
  })

  it('ricava i blocchi dello slot e rifiuta quelli che attraversano la mezzanotte', () => {
    expect(fixedSeatSlotBucketIds(slot('2026-09-08T16:30:00.000Z'))).toEqual([
      '2-1110', '2-1140', '2-1170',
    ])
    expect(fixedSeatSlotBucketIds(slot('2026-09-08T21:30:00.000Z'))).toEqual([])
  })

  it('interseca i blocchi per evitare falsi abbinamenti da fasce parziali', () => {
    const members = new Map<string, string[]>([
      ['2-1110', ['jury', 'ale']],
      ['2-1140', ['jury', 'ale', 'luigi']],
      ['2-1170', ['jury', 'luigi']],
    ])
    expect(fixedSeatMemberIdsForSlot(slot('2026-09-08T16:30:00.000Z'), members)).toEqual(['jury'])
  })

  it('conta il massimo numero di altri giocatori sovrapposti escludendo chi modifica', () => {
    const member = (id: string, preference = tuesdayEvening): MemberProfile => ({
      id,
      displayName: id,
      email: `${id}@example.test`,
      createdAt: 1,
      fixedSeatPreference: preference,
    })
    expect(fixedSeatMaxOtherOverlap([
      member('jury'), member('ale'), member('luigi'), member('brescio'),
    ], tuesdayEvening, 'jury')).toBe(3)
  })

  it('normalizza solo preferenze valide di almeno un’ora', () => {
    expect(normalizeFixedSeatPreference(tuesdayEvening)).toEqual(tuesdayEvening)
    expect(normalizeFixedSeatPreference({ ...tuesdayEvening, endMinutes: 18 * 60 + 30 })).toBeUndefined()
    expect(normalizeFixedSeatPreference({ ...tuesdayEvening, startMinutes: 18 * 60 + 15 })).toBeUndefined()
  })
})
