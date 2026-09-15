import type { VenueId } from '../types'
import { VENUES } from '../lib/venues'

export function VenuePicker({ value, onChange, label = 'Campo', disabled = false }: {
  value: VenueId
  onChange: (value: VenueId) => void
  label?: string
  disabled?: boolean
}) {
  return <label className="field venue-picker"><span>{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value as VenueId)} disabled={disabled}>
      {VENUES.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
    </select>
  </label>
}

export function VenueChoices({ value, onChange, disabled = false }: {
  value: readonly VenueId[]
  onChange: (value: VenueId[]) => void
  disabled?: boolean
}) {
  return <div className="venue-choices">
    {VENUES.map((venue) => <label key={venue.id} className={value.includes(venue.id) ? 'is-selected' : ''}>
      <input type="checkbox" checked={value.includes(venue.id)} disabled={disabled} onChange={(event) => {
        onChange(event.target.checked ? [...value, venue.id] : value.filter((id) => id !== venue.id))
      }} />
      <span>{venue.name}</span>
    </label>)}
  </div>
}
