import { slotVenueName, venueInfoHref, type SlotVenue } from '../lib/venues'

export function VenueLabel({ slot }: { slot: SlotVenue }) {
  const href = venueInfoHref(slot)
  return href ? <a className="venue-link" href={href} title="Informazioni, costi e iscrizione">{slotVenueName(slot)} <span aria-hidden="true">↗</span></a> : <>{slotVenueName(slot)}</>
}
