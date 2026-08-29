import type { ComponentType } from 'react'
import {
  AlarmClock,
  ArrowLeft,
  BellOff,
  BellRing,
  CalendarPlus,
  CalendarSearch,
  CircleAlert,
  Clock3,
  FlaskConical,
  Smartphone,
  Star,
  Trophy,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react'
import type { NotificationHistoryItem } from '../lib/notificationHistory'
import { PADEL_TIME_ZONE } from '../lib/format'

interface NotificationHistoryPageProps {
  notifications: NotificationHistoryItem[]
  loading: boolean
  error: string | null
  onBack: () => void
}

interface NotificationPresentation {
  label: string
  icon: ComponentType<{ size?: number }>
  tone: string
}

const sentAtFormatter = new Intl.DateTimeFormat('it-IT', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: PADEL_TIME_ZONE,
})

function notificationPresentation(kind: string): NotificationPresentation {
  switch (kind) {
    case 'new-poll':
      return { label: 'Nuovo sondaggio', icon: CalendarPlus, tone: 'slots' }
    case 'new-slots':
      return { label: 'Nuovi slot', icon: CalendarPlus, tone: 'slots' }
    case 'slot-ready':
      return { label: 'Formazione completa', icon: UsersRound, tone: 'ready' }
    case 'starter-substitution':
      return { label: 'Nuova convocazione', icon: UserRoundCheck, tone: 'substitution' }
    case 'booking-reminder-7d':
      return { label: 'Campo da prenotare', icon: CalendarSearch, tone: 'booking' }
    case 'reminder-24h':
      return { label: 'Promemoria 24 ore', icon: AlarmClock, tone: 'reminder' }
    case 'reminder-2h':
      return { label: 'Promemoria 2 ore', icon: Clock3, tone: 'reminder' }
    case 'match-rating':
      return { label: 'Pagelle', icon: Star, tone: 'rating' }
    case 'match-mvp':
      return { label: 'MVP del match', icon: Trophy, tone: 'rating' }
    case 'monday-motivation':
      return { label: 'Sveglia del lunedì', icon: BellRing, tone: 'monday' }
    case 'fantasy-open':
      return { label: 'FantaBandeja', icon: Trophy, tone: 'fantasy' }
    case 'fantasy-roster-changed':
      return { label: 'Formazione fantasy', icon: Trophy, tone: 'fantasy' }
    case 'fantasy-result':
      return { label: 'Risultato fantasy', icon: Trophy, tone: 'fantasy' }
    case 'test':
      return { label: 'Notifica manuale', icon: FlaskConical, tone: 'test' }
    default:
      return { label: 'Avviso Bandeja Boys', icon: CircleAlert, tone: 'generic' }
  }
}

function notificationTimestamp(sentAt: number): string {
  if (sentAt <= 0) return 'Data non disponibile'
  const formatted = sentAtFormatter.format(new Date(sentAt))
  return `${formatted.charAt(0).toUpperCase()}${formatted.slice(1)}`
}

function NotificationItem({ notification }: { notification: NotificationHistoryItem }) {
  const presentation = notificationPresentation(notification.kind)
  const NotificationIcon = presentation.icon
  const title = notification.title?.trim() || 'Notifica Bandeja Boys'
  const body = notification.body?.trim()

  return (
    <li className="notification-history-item">
      <span
        className={`notification-history-item__icon notification-history-item__icon--${presentation.tone}`}
        aria-hidden="true"
      >
        <NotificationIcon size={20} />
      </span>
      <div className="notification-history-item__content">
        <span className="notification-history-item__kind">{presentation.label}</span>
        <h2>{title}</h2>
        <p>{body || 'Il testo di questo avviso non veniva ancora archiviato.'}</p>
        <div className="notification-history-item__meta">
          {notification.sentAt > 0 ? (
            <time dateTime={new Date(notification.sentAt).toISOString()}>
              <Clock3 size={13} /> {notificationTimestamp(notification.sentAt)}
            </time>
          ) : (
            <span><Clock3 size={13} /> Data non disponibile</span>
          )}
          {notification.deliveredDeviceCount > 1 && (
            <span>
              <Smartphone size={13} />
              {notification.deliveredDeviceCount} dispositivi
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

export function NotificationHistoryPage({
  notifications,
  loading,
  error,
  onBack,
}: NotificationHistoryPageProps) {
  return (
    <main className="dashboard notification-history">
      <button className="button button--ghost notification-history__back" type="button" onClick={onBack}>
        <ArrowLeft size={18} /> Torna alla bacheca
      </button>

      <section className="notification-history__hero">
        <div>
          <p className="eyebrow">Il tuo tabellone degli avvisi</p>
          <h1>Le mie notifiche</h1>
          <p>Qui ritrovi i push consegnati ai tuoi dispositivi, dal più recente.</p>
        </div>
        <div
          className="notification-history__score"
          aria-label={`${notifications.length} ${notifications.length === 1 ? 'notifica ricevuta' : 'notifiche ricevute'}`}
        >
          <BellRing size={24} />
          <strong>{notifications.length}</strong>
          <span>Ricevute</span>
        </div>
      </section>

      <section className="notification-history__inbox" aria-labelledby="notification-history-title">
        <header className="notification-history__heading">
          <div>
            <p className="eyebrow">Archivio personale</p>
            <h2 id="notification-history-title">Tutti gli avvisi</h2>
          </div>
          {!loading && !error && <strong>{notifications.length}</strong>}
        </header>

        {loading ? (
          <div className="loading-state"><span /><p>Recuperiamo le tue notifiche…</p></div>
        ) : error ? (
          <div className="notification-history__state notification-history__state--error" role="alert">
            <CircleAlert size={25} />
            <div><strong>Archivio non disponibile</strong><p>{error}</p></div>
          </div>
        ) : notifications.length > 0 ? (
          <ol className="notification-history__list" aria-label="Notifiche push ricevute">
            {notifications.map((notification) => (
              <NotificationItem key={notification.eventId} notification={notification} />
            ))}
          </ol>
        ) : (
          <div className="notification-history__state">
            <BellOff size={25} />
            <div>
              <strong>Nessuna notifica salvata</strong>
              <p>Le prossime notifiche push consegnate compariranno qui.</p>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
