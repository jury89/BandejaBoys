import { useState } from 'react'
import { getTournamentRoundClock, tournamentUsesTimedMatches } from '../lib/domain'
import type { Tournament } from '../lib/tournamentTypes'
import type { TournamentSimulationSession } from '../lib/tournamentSimulation'
import { Modal } from './Modal'

export function TournamentSimulationTools({ session, tournament: t, now, busy, onAction }: {
  session: TournamentSimulationSession; tournament: Tournament; now: number; busy: boolean; onAction: (action: () => Promise<void>) => Promise<void>
}) {
  const [resetting, setResetting] = useState(false)
  const clock = getTournamentRoundClock(t, now)
  const timed = tournamentUsesTimedMatches(t)
  const action = (fn: () => void | Promise<void>) => void onAction(async () => { await fn() })
  const guide = t.status === 'completed' ? 'Hai raggiunto il podio. Puoi ricominciare tutte le volte che vuoi.' : t.status === 'open' ? now < t.startsAt - 3_600_000 ? 'Controlla le impostazioni, poi salta alla chiusura iscrizioni e sorteggia il tabellone.' : 'Premi “Sorteggia e prepara tabellone” più sotto per vedere gli abbinamenti.' : t.status === 'running' ? timed && clock.state === 'waiting' ? 'Avvia il timer più sotto: puoi partire anche prima dell’orario previsto, come nel torneo reale.' : `Inserisci i risultati${timed ? ', salta l’attesa del timer' : ''} e conferma il turno. Nell’ultimo turno comparirà il podio.` : 'La prova è annullata. Ricomincia per riprovare.'
  return <section className="tournament-panel tournament-simulation" aria-label="Strumenti della simulazione">
    <h2>Simulazione privata</h2>
    <p><strong>Solo tu. Solo dati fittizi.</strong> Questa prova resta nel browser di questo dispositivo, separata dai tornei reali. Nessuna notifica, punto Fanta o risultato condiviso.</p>
    <p>Ora di prova: <time dateTime={new Date(now).toISOString()}>{new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'short', timeStyle: 'short' }).format(now)}</time></p>
    <p>{guide}</p>
    <div className="tournament-actions">
      {t.status === 'open' && now < t.startsAt - 3_600_000 && <button className="button" disabled={busy} onClick={() => action(() => session.jump('cutoff'))}>Salta alla chiusura iscrizioni</button>}
      {t.status === 'open' && now < t.startsAt && <button className="button" disabled={busy} onClick={() => action(() => session.jump('start'))}>Salta all’inizio del torneo</button>}
      {t.status === 'running' && (!timed || clock.state !== 'waiting') && <button className="button" disabled={busy} onClick={() => action(() => session.fillScores())}>Compila risultati di prova</button>}
      {timed && t.status === 'running' && clock.state === 'running' && <button className="button" disabled={busy} onClick={() => action(() => session.jump('end-round'))}>Fai scadere il timer</button>}
      <button className="button button--ghost" disabled={busy} onClick={() => setResetting(true)}>Ricomincia la simulazione</button>
    </div>
    {resetting && <Modal title="Ricominciare la prova?" onClose={() => setResetting(false)}><div className="tournament-form"><p>Verranno sostituiti soltanto i partecipanti fittizi, il tabellone e i risultati di questa simulazione, mantenendo le impostazioni attuali. Nessun dato reale viene modificato.</p><button className="button button--primary" disabled={busy} onClick={() => { setResetting(false); action(() => session.reset(t)) }}>Conferma nuova simulazione</button></div></Modal>}
  </section>
}
