import { BellRing, Check, Clock3, Download, X } from 'lucide-react'
import type { PushNotificationState } from '../lib/notifications'

interface NotificationCallupProps {
  state: PushNotificationState
  busy: boolean
  onEnable: () => void
  onDisable: () => void
  onClose: () => void
}

const steps = [
  { time: 'NUOVO', label: 'Nuovi slot disponibili' },
  { time: '−24H', label: 'Promemoria partita' },
  { time: '−2H', label: 'Ultimo richiamo' },
]

export function NotificationCallup({ state, busy, onEnable, onDisable, onClose }: NotificationCallupProps) {
  const iosInstall = state === 'ios-install'
  const enabled = state === 'enabled'
  const denied = state === 'denied'
  const unsupported = state === 'unsupported'

  return (
    <div className="notification-callup__backdrop" role="presentation">
      <section className="notification-callup" role="dialog" aria-modal="true" aria-labelledby="notification-callup-title">
        <button className="notification-callup__close" type="button" onClick={onClose} aria-label="Chiudi notifiche">
          <X size={18} />
        </button>

        <div className="notification-callup__mark" aria-hidden="true">
          {iosInstall ? <Download size={23} /> : enabled ? <Check size={23} /> : <BellRing size={23} />}
        </div>
        <p className="eyebrow">Convocazioni Bandeja</p>
        <h2 id="notification-callup-title">
          {iosInstall ? 'Prima mettila in Home.' : enabled ? 'Notifiche attive.' : denied ? 'Notifiche bloccate.' : unsupported ? 'Notifiche non disponibili.' : 'Ti avvisiamo noi.'}
        </h2>

        {iosInstall ? (
          <p className="notification-callup__lead">
            Su iPhone tocca <strong>Condividi</strong>, scegli <strong>Aggiungi alla schermata Home</strong> e riapri Bandeja Boys dalla nuova icona. Lì potrai attivare gli avvisi.
          </p>
        ) : denied ? (
          <p className="notification-callup__lead">Il browser ha bloccato il permesso. Riattivalo dalle impostazioni del sito, poi torna qui.</p>
        ) : unsupported ? (
          <p className="notification-callup__lead">Questo browser non supporta Web Push. Puoi continuare a usare normalmente tutti i sondaggi.</p>
        ) : (
          <p className="notification-callup__lead">
            Riceverai un avviso raggruppato per i nuovi slot e, se sei titolare, due promemoria prima della partita.
          </p>
        )}

        {!iosInstall && !denied && !unsupported && (
          <ol className="notification-callup__timeline" aria-label="Quando arrivano le notifiche">
            {steps.map((step) => (
              <li key={step.time}>
                <span>{step.time}</span>
                <strong>{step.label}</strong>
                <Clock3 size={14} aria-hidden="true" />
              </li>
            ))}
          </ol>
        )}

        <footer className="notification-callup__actions">
          {state === 'prompt' && (
            <button className="button button--primary" type="button" onClick={onEnable} disabled={busy}>
              <BellRing size={18} /> {busy ? 'Attivazione…' : 'Attiva notifiche'}
            </button>
          )}
          {enabled && (
            <button className="button button--ghost" type="button" onClick={onDisable} disabled={busy}>
              {busy ? 'Disattivazione…' : 'Disattiva notifiche'}
            </button>
          )}
          <button className="text-button" type="button" onClick={onClose}>
            {iosInstall ? 'Non mostrare più' : enabled || denied || unsupported ? 'Chiudi' : 'Non ora'}
          </button>
        </footer>
      </section>
    </div>
  )
}
