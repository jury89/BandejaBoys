import { useEffect, useRef, useState } from 'react'
import { getTournamentRoundClock } from '../lib/domain'
import type { Tournament } from '../lib/tournamentTypes'

export function TournamentRoundTimer({ tournament, now, manager, busy, onStart, simulation = false }: {
  tournament: Tournament; now: number; manager: boolean; busy: boolean; onStart: () => void; simulation?: boolean
}) {
  const clock = getTournamentRoundClock(tournament, now)
  const audio = useRef<AudioContext | null>(null), sounded = useRef<string | null>(null)
  const [sound, setSound] = useState(false), [soundError, setSoundError] = useState('')
  const alarmKey = `${tournament.id}:${tournament.currentRound}:${clock.endsAt}`
  useEffect(() => () => { void audio.current?.close().catch(() => {}); audio.current = null }, [])
  useEffect(() => {
    if (!sound || clock.state !== 'expired' || sounded.current === alarmKey || !audio.current) return
    sounded.current = alarmKey
    const context = audio.current
    if (context.state !== 'running') return
    for (let i = 0; i < 3; i++) {
      const tone = context.createOscillator(), volume = context.createGain(), start = context.currentTime + i * 0.4
      tone.frequency.value = 880; volume.gain.setValueAtTime(0.15, start)
      volume.gain.exponentialRampToValueAtTime(0.001, start + 0.25)
      tone.connect(volume); volume.connect(context.destination); tone.start(start); tone.stop(start + 0.25)
    }
  }, [alarmKey, clock.state, sound])
  async function toggleSound() {
    if (sound) { setSound(false); return }
    try {
      if (!audio.current) audio.current = new AudioContext()
      await audio.current.resume(); setSound(true); setSoundError('')
    } catch { setSoundError('Suono non disponibile su questo dispositivo. Usa anche il timer del telefono.') }
  }
  const time = `${Math.floor(clock.remainingSeconds / 60).toString().padStart(2, '0')}:${(clock.remainingSeconds % 60).toString().padStart(2, '0')}`
  return <section className={`tournament-panel tournament-clock ${clock.state === 'expired' ? 'is-expired' : ''}`} aria-label="Timer del turno">
    <div><h2>Turno {tournament.currentRound} di {tournament.totalRounds}</h2>
      <p role="status">{clock.state === 'waiting' ? 'Tutti pronti? L’organizzatore avvia le partite insieme.' : clock.state === 'running' ? 'Turno in corso su tutti i campi.' : 'Tempo scaduto: terminate il punto in corso e registrate i game completati.'}</p>
    </div>
    <strong className="tournament-clock__time" role="timer" aria-label="Tempo rimanente">{time}</strong>
    <div className="tournament-actions">
      {manager && clock.state === 'waiting' && <button className="button button--primary" disabled={busy || now < tournament.startsAt} onClick={onStart}>Avvia timer del turno</button>}
      <button className="button" onClick={() => void toggleSound()} aria-pressed={sound}>{sound ? 'Disattiva avviso sonoro' : 'Attiva avviso sonoro'}</button>
    </div>
    <p className="tournament-note">{simulation ? 'Questo timer è soltanto di prova e rimane su questo dispositivo, anche dopo un ricaricamento.' : 'Il timer è condiviso e continua dopo un ricaricamento.'} Per il suono tieni la pagina aperta e il dispositivo attivo; in background usa anche un timer del telefono. Il turno successivo parte solo dopo la conferma dei risultati e un nuovo avvio.</p>
    {soundError && <p role="alert">{soundError}</p>}
  </section>
}
