import { CalendarDays, Download, ExternalLink } from 'lucide-react'
import type { PadelPoll, PadelSlot } from '../types'
import {
  buildGoogleCalendarUrl,
  buildOutlookCalendarUrl,
  downloadSlotCalendar,
} from '../lib/calendar'
import { slotDateParts } from '../lib/format'
import { Modal } from './Modal'

interface CalendarExportModalProps {
  poll: PadelPoll
  slot: PadelSlot
  onClose: () => void
  onDone: (message: string) => void
}

export function CalendarExportModal({ poll, slot, onClose, onDone }: CalendarExportModalProps) {
  const date = slotDateParts(slot.startsAt)

  const chooseApple = () => {
    downloadSlotCalendar(poll, slot)
    onDone('Evento pronto per Apple Calendar.')
    onClose()
  }

  const chooseWebCalendar = (url: string, provider: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
    onDone(`${provider} aperto con i dati della partita.`)
    onClose()
  }

  return (
    <Modal title="Dove vuoi salvarlo?" eyebrow={`${date.full} · ${date.time}`} onClose={onClose}>
      <div className="calendar-picker">
        <p className="modal__lead">
          Scegli il servizio: data, ora, durata e Oasi Boschetto sono già compilati.
        </p>

        <div className="calendar-picker__options" role="group" aria-label="Servizi calendario">
          <button
            className="calendar-provider calendar-provider--apple"
            type="button"
            onClick={chooseApple}
          >
            <span className="calendar-provider__mark" aria-hidden="true"><CalendarDays size={21} /></span>
            <span className="calendar-provider__copy">
              <strong>Apple Calendar</strong>
              <small>Su iPhone usa il calendario predefinito.</small>
            </span>
            <Download className="calendar-provider__action" size={18} aria-hidden="true" />
          </button>

          <button
            className="calendar-provider calendar-provider--google"
            type="button"
            onClick={() => chooseWebCalendar(buildGoogleCalendarUrl(poll, slot), 'Google Calendar')}
          >
            <span className="calendar-provider__mark calendar-provider__letter" aria-hidden="true">G</span>
            <span className="calendar-provider__copy">
              <strong>Google Calendar</strong>
              <small>Si apre l’evento e puoi scegliere il calendario.</small>
            </span>
            <ExternalLink className="calendar-provider__action" size={18} aria-hidden="true" />
          </button>

          <button
            className="calendar-provider calendar-provider--outlook"
            type="button"
            onClick={() => chooseWebCalendar(buildOutlookCalendarUrl(poll, slot), 'Outlook')}
          >
            <span className="calendar-provider__mark calendar-provider__letter" aria-hidden="true">O</span>
            <span className="calendar-provider__copy">
              <strong>Outlook</strong>
              <small>Si apre l’editor web di Microsoft.</small>
            </span>
            <ExternalLink className="calendar-provider__action" size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </Modal>
  )
}
