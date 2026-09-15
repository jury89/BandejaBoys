import type { PadelSlot, VenueId } from '../types'

export const DEFAULT_VENUE_ID: VenueId = 'oasi-boschetto'
export const VENUES: ReadonlyArray<{ id: VenueId; name: string; address: string; phone?: string; website?: string }> = [
  { id: 'oasi-boschetto', name: 'Oasi Boschetto', address: 'Mantova', phone: '+390376290058' },
  { id: 'tennis-club-mantova', name: 'Tennis Club Mantova', address: 'Via Learco Guerra, 2 · Mantova', phone: '+390376327915', website: 'https://www.tennisclubmantova.com/' },
  { id: 'sport-city-mantova', name: 'Sport City Mantova', address: 'Via Palmiro Azzi, 5 · Mantova', website: 'https://www.mantovasportcity.it/' },
]

export type SlotVenue = Pick<PadelSlot, 'venueId'> & Partial<Pick<PadelSlot, 'venue'>>

export function isVenueId(value: unknown): value is VenueId {
  return VENUES.some((venue) => venue.id === value)
}

export function validateVenueId(value: unknown): VenueId {
  if (value === undefined) return DEFAULT_VENUE_ID
  if (!isVenueId(value)) throw new Error('Scegli un campo valido.')
  return value
}

export function slotVenueId(slot: SlotVenue): VenueId {
  if (isVenueId(slot.venueId)) return slot.venueId
  return VENUES.find((venue) => venue.name.toLowerCase() === slot.venue?.trim().toLowerCase())?.id ?? DEFAULT_VENUE_ID
}

export function slotVenue(slot: SlotVenue) {
  return VENUES.find((venue) => venue.id === slotVenueId(slot))!
}

export function slotVenueName(slot: SlotVenue): string {
  // Preserve unknown historical booking labels without rewriting old documents.
  return !slot.venueId && slot.venue?.trim() ? slot.venue.trim() : slotVenue(slot).name
}

export function normalizePreferredVenueIds(value: unknown): VenueId[] {
  return Array.isArray(value) ? VENUES.filter((venue) => value.includes(venue.id)).map((venue) => venue.id) : []
}

export function validatePreferredVenueIds(value: unknown): VenueId[] {
  if (!Array.isArray(value) || value.length > VENUES.length || value.some((id) => !isVenueId(id)) || new Set(value).size !== value.length) {
    throw new Error('Scegli campi preferiti validi, senza duplicati.')
  }
  return normalizePreferredVenueIds(value)
}

/** No preferences means every club. Also used by fixed-seat auto-signup. */
export function matchesVenueFilter(slot: SlotVenue, venueIds: readonly VenueId[]): boolean {
  return venueIds.length === 0 || venueIds.includes(slotVenueId(slot))
}

export function venueInfoHref(slot: SlotVenue): string | undefined {
  const id = slotVenueId(slot)
  return id === DEFAULT_VENUE_ID ? undefined : `#campi/${id}`
}
