import { useId } from 'react'

interface SlotDateTimeFieldProps {
  value: string
  onChange: (value: string) => void
  label?: string
}

const hourOptions = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'))
const minuteOptions = ['00', '30'] as const

function dateTimeParts(value: string) {
  const [date = '', time = ''] = value.split('T')
  const [rawHour = '18', rawMinute = '00'] = time.split(':')
  const hour = hourOptions.includes(rawHour) ? rawHour : '18'
  const minute = rawMinute === '30' ? '30' : '00'

  return { date, hour, minute }
}

export function SlotDateTimeField({
  value,
  onChange,
  label = 'Data e ora',
}: SlotDateTimeFieldProps) {
  const fieldId = useId()
  const { date, hour, minute } = dateTimeParts(value)
  const update = (nextDate: string, nextHour: string, nextMinute: string) => {
    onChange(`${nextDate}T${nextHour}:${nextMinute}`)
  }

  return (
    <fieldset className="slot-date-time">
      <legend>{label}</legend>
      <div className="slot-date-time__controls">
        <label className="slot-date-time__part slot-date-time__part--date" htmlFor={`${fieldId}-date`}>
          <span>Data</span>
          <input
            id={`${fieldId}-date`}
            type="date"
            value={date}
            onChange={(event) => update(event.target.value, hour, minute)}
            required
          />
        </label>
        <label className="slot-date-time__part" htmlFor={`${fieldId}-hour`}>
          <span>Ora</span>
          <select
            id={`${fieldId}-hour`}
            value={hour}
            onChange={(event) => update(date, event.target.value, minute)}
          >
            {hourOptions.map((option) => <option value={option} key={option}>{option}</option>)}
          </select>
        </label>
        <label className="slot-date-time__part" htmlFor={`${fieldId}-minute`}>
          <span>Minuti</span>
          <select
            id={`${fieldId}-minute`}
            value={minute}
            onChange={(event) => update(date, hour, event.target.value)}
          >
            {minuteOptions.map((option) => <option value={option} key={option}>{option}</option>)}
          </select>
        </label>
      </div>
    </fieldset>
  )
}
