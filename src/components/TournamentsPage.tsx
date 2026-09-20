import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, CalendarDays, Check, Copy, Plus, Trophy, UsersRound } from 'lucide-react'
import type { MemberProfile, SessionUser } from '../types'
import { canManageTournament, getTimedTournamentPlan, getTournamentRoundClock, getTournamentStandings, padelDateTimeToTimestamp, toDateTimeInput, tournamentRegistrationsOpen, tournamentUsesRotatingPairs, tournamentUsesTimedMatches, validateTournamentInput } from '../lib/domain'
import { repository } from '../lib/repository'
import { TOURNAMENT_FORMATS, type Tournament, type TournamentInput, type TournamentMatch, type TournamentScore } from '../lib/tournamentTypes'
import { VENUES } from '../lib/venues'
import { Modal } from './Modal'
import { ProfileAvatar } from './ProfileAvatar'
import { SlotDateTimeField } from './SlotDateTimeField'
import { TournamentRoundTimer } from './TournamentRoundTimer'
import './tournaments.css'

const dateLabel = (time: number) => new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(time)
const timeLabel = (time: number) => new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }).format(time)
const timedRules = 'Punto secco sul 40–40. Alla scadenza terminate il punto in corso: contano solo i game completati, il game incompleto non si conta. Pareggio ammesso, nessun tie-break.'
const timedRanking = '3 punti per vittoria, 1 per pareggio, 0 per sconfitta. Poi differenza game e game vinti; a parità completa il piazzamento è condiviso.'
const statusLabel = { draft: 'Bozza privata', open: 'Iscrizioni aperte', running: 'Tabellone pronto', completed: 'Concluso', cancelled: 'Annullato' }
function tournamentStatus(t: Tournament, now: number): string {
  if (t.status === 'open' && !tournamentRegistrationsOpen(t, now)) return 'Iscrizioni chiuse'
  if (t.status === 'running' && now >= t.startsAt) return 'In corso'
  return statusLabel[t.status]
}
function locationId(): string {
  try { return window.location.hash.startsWith('#tornei/') ? decodeURIComponent(window.location.hash.slice(8)) : '' } catch { return '' }
}
function tournamentName(t: Tournament, members: MemberProfile[], id: string): string {
  return members.find(m => m.id === id)?.displayName ?? t.registrations[id]?.displayName ?? 'Giocatore'
}

function TournamentEditor({ tournament, user, onClose, onSaved }: { tournament?: Tournament; user: SessionUser; onClose: () => void; onSaved: (id: string) => void }) {
  const [input, setInput] = useState<TournamentInput>(() => tournament ?? { title: '', startsAt: Math.ceil(Date.now() / 1_800_000) * 1_800_000 + 7 * 86_400_000, venueId: 'oasi-boschetto', format: 'americano', pairing: 'rotating', capacity: 8, courts: 1, rounds: 7, pointsPerMatch: 24, scoreAccess: 'players' })
  const [date, setDate] = useState(toDateTimeInput(new Date(input.startsAt)))
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const rotating = tournamentUsesRotatingPairs(input)
  const timed = tournamentUsesTimedMatches(input), plan = timed ? getTimedTournamentPlan(input) : null
  const update = <K extends keyof TournamentInput>(key: K, value: TournamentInput[K]) => setInput(current => ({ ...current, [key]: value }))
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      const value = validateTournamentInput({ ...input, startsAt: padelDateTimeToTimestamp(date) }, Date.now())
      if (tournament) { await repository.editTournament(tournament.id, value, user); onSaved(tournament.id) }
      else onSaved(await repository.createTournament(value, user))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Salvataggio non riuscito. Riprova.') }
    finally { setBusy(false) }
  }
  return <Modal title={tournament ? 'Modifica bozza' : 'Nuovo torneo'} eyebrow="Organizza il tuo torneo" onClose={onClose} size="wide">
    <form className="tournament-form" onSubmit={submit}>
      <button type="button" className="button" onClick={() => setInput(current => ({ ...current, format: 'round-robin', pairing: 'random-fixed', capacity: 10, courts: 2, scoringMode: 'timed', matchMinutes: 15, warmupMinutes: 5, changeoverMinutes: 2 }))}>Imposta 10 giocatori · 2 campi · 90 minuti</button>
      <label>Nome del torneo<input required minLength={3} maxLength={80} value={input.title} onChange={e => update('title', e.target.value)} placeholder="Il torneo dei fagiani" /></label>
      <SlotDateTimeField value={date} onChange={setDate} />
      <p>Orario italiano. Le iscrizioni chiudono automaticamente un’ora prima.</p>
      <label>Circolo<select value={input.venueId} onChange={e => update('venueId', e.target.value as TournamentInput['venueId'])}>{VENUES.map(v => <option value={v.id} key={v.id}>{v.name}</option>)}</select></label>
      <fieldset className="tournament-formats"><legend>Formula</legend>{TOURNAMENT_FORMATS.map(format => <label key={format.id} className={input.format === format.id ? 'is-selected' : ''}>
        <input type="radio" name="format" value={format.id} checked={input.format === format.id} onChange={() => setInput(current => ({ ...current, format: format.id, pairing: format.id === 'americano' || format.id === 'mexicano' ? 'rotating' : 'random-fixed', capacity: 8, scoringMode: 'standard' }))} />
        <span><strong>{format.name}</strong><small>{format.description}</small></span>
      </label>)}</fieldset>
      {!rotating && <label>Coppie fisse<select value={input.pairing} onChange={e => update('pairing', e.target.value as TournamentInput['pairing'])}><option value="random-fixed">Sorteggiate dal computer</option><option value="chosen-fixed">Scelte dai giocatori, con conferma reciproca</option></select></label>}
      {input.format === 'round-robin' && <label>Durata delle partite<select value={input.scoringMode ?? 'standard'} onChange={e => update('scoringMode', e.target.value as TournamentInput['scoringMode'])}><option value="standard">Un set a 6 game</option><option value="timed">Partite a tempo</option></select></label>}
      <div className="tournament-form__grid">
        <label>Massimo giocatori<select value={input.capacity} onChange={e => update('capacity', Number(e.target.value))}>{(input.format === 'knockout' ? [8, 16, 32] : rotating ? [4, 8, 12, 16, 20, 24, 28, 32] : [6, 8, 10, 12, 14, 16, 20, 24, 28, 32]).map(n => <option key={n}>{n}</option>)}</select></label>
        <label>Campi disponibili<input type="number" required min={1} max={8} value={input.courts} onChange={e => update('courts', Number(e.target.value))} /></label>
        {rotating && <><label>Turni<input required type="number" min={1} max={31} value={input.rounds} onChange={e => update('rounds', Number(e.target.value))} /></label><label>Punti totali per incontro<select value={input.pointsPerMatch} onChange={e => update('pointsPerMatch', Number(e.target.value))}>{[16, 24, 32].map(n => <option key={n}>{n}</option>)}</select></label></>}
      </div>
      {timed && <><div className="tournament-form__grid">
        <label>Minuti per partita<input type="number" min={5} max={30} required value={input.matchMinutes ?? 15} onChange={e => update('matchMinutes', Number(e.target.value))} /></label>
        <label>Minuti di riscaldamento<input type="number" min={0} max={15} required value={input.warmupMinutes ?? 5} onChange={e => update('warmupMinutes', Number(e.target.value))} /></label>
        <label>Minuti tra i turni<input type="number" min={0} max={5} required value={input.changeoverMinutes ?? 2} onChange={e => update('changeoverMinutes', Number(e.target.value))} /></label>
      </div><p className="tournament-plan">Con {input.capacity} iscritti: {plan!.teams} coppie, {plan!.rounds} turni, {plan!.matchesPerPair} partite e {plan!.playingMinutes} minuti in campo a testa. Durata indicativa: <strong>{plan!.totalMinutes} minuti</strong>, inclusi riscaldamento e cambi. {plan!.teams % 2 ? 'Ogni coppia riposa un turno.' : 'Nessun turno di riposo.'}</p>
      {input.courts < plan!.requiredCourts && <p role="alert" className="form-error">Servono almeno {plan!.requiredCourts} campi per giocare il turno contemporaneamente.</p>}</>}
      <p>{timed ? `${timedRules} ${timedRanking}` : rotating ? `Ogni coppia guadagna i punti segnati: per esempio ${input.pointsPerMatch / 2 + 2}–${input.pointsPerMatch / 2 - 2}. Tutti giocano in ogni turno, anche in ondate su meno campi.` : 'Ogni partita è un set a 6 game, tie-break sul 6–6 (si registra 7–6). Il calendario viene calcolato dagli iscritti effettivi.'}</p>
      <label>Chi può inserire i risultati<select value={input.scoreAccess} onChange={e => update('scoreAccess', e.target.value as TournamentInput['scoreAccess'])}><option value="players">Organizzatore e giocatori della partita</option><option value="admin">Solo organizzatore</option></select></label>
      <p className="tournament-note">Salvi una bozza visibile solo a te e all’amministratore. La pubblicherai dopo averla controllata. L’amministratore può sempre aiutarti nella gestione e nei risultati. Il torneo non prenota i campi e non assegna punti Fanta.</p>
      {error && <p role="alert" className="form-error">{error}</p>}
      <button className="button button--primary" disabled={busy}>{busy ? 'Salvataggio…' : 'Salva bozza privata'}</button>
    </form>
  </Modal>
}

function TournamentScoreEditor({ tournament, match, score, members, user, onClose }: { tournament: Tournament; match: TournamentMatch; score?: TournamentScore; members: MemberProfile[]; user: SessionUser; onClose: () => void }) {
  const [a, setA] = useState(score ? String(score.scoreA) : ''), [b, setB] = useState(score ? String(score.scoreB) : '')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [revision] = useState(score?.revision ?? 0)
  const timed = tournamentUsesTimedMatches(tournament)
  const pairName = (ids: string[]) => ids.map(id => tournamentName(tournament, members, id)).join(' + ')
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      if (a === '' || b === '') throw new Error('Inserisci entrambi i punteggi.')
      await repository.saveTournamentScore(tournament.id, match.id, Number(a), Number(b), revision, user); onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Risultato non salvato. Riprova.') }
    finally { setBusy(false) }
  }
  return <Modal title="Risultato della partita" onClose={onClose}><form className="tournament-form" onSubmit={save}>
    <p>Turno {match.round} · Campo {match.court}{!timed && ` · Ondata ${match.wave}`}</p>
    <label>{pairName(match.teamA.playerIds)}<input type="number" inputMode="numeric" min={0} max={timed ? 99 : 32} required value={a} onChange={e => setA(e.target.value)} /></label>
    <label>{pairName(match.teamB.playerIds)}<input type="number" inputMode="numeric" min={0} max={timed ? 99 : 32} required value={b} onChange={e => setB(e.target.value)} /></label>
    <p>{timed ? 'Inserisci solo i game completati, anche 3–2, 4–4 o 0–0. Non serve arrivare a 6. I risultati restano provvisori fino alla conferma del turno.' : tournamentUsesRotatingPairs(tournament) ? `La somma deve essere ${tournament.pointsPerMatch}. È ammesso il pareggio.` : 'Un set: da 6–0 a 6–4, oppure 7–5 o 7–6.'} Puoi correggerlo finché l’organizzatore non avanza al turno successivo.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button button--primary" disabled={busy}>{busy ? 'Salvataggio…' : 'Salva risultato'}</button>
  </form></Modal>
}

function TournamentGuestEditor({ tournament, guestId, user, members, onClose }: {
  tournament: Tournament; guestId: string | null; user: SessionUser; members: MemberProfile[]; onClose: () => void
}) {
  const guest = guestId ? tournament.registrations[guestId] : null
  const [name, setName] = useState(guest?.displayName ?? ''), [partner, setPartner] = useState(guest?.partnerId ?? '')
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [removing, setRemoving] = useState(false)
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { await repository.saveTournamentGuest(tournament.id, guestId, name, partner || null, user); onClose() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Ospite non salvato. Riprova.') }
    finally { setBusy(false) }
  }
  async function remove() {
    if (!guestId) return
    setBusy(true); setError('')
    try { await repository.removeTournamentGuest(tournament.id, guestId, user); onClose() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Ospite non rimosso. Riprova.') }
    finally { setBusy(false) }
  }
  return <Modal title={guest ? 'Gestisci ospite' : 'Aggiungi partecipante esterno'} onClose={onClose}><form className="tournament-form" onSubmit={save}>
    <label>Nome dell’ospite<input required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
    {tournament.pairing === 'chosen-fixed' && <label>Compagno dell’ospite<select value={tournament.registrations[partner] ? partner : ''} onChange={e => setPartner(e.target.value)}><option value="">Da scegliere</option>{Object.values(tournament.registrations).filter(r => r.userId !== guestId).map(r => <option key={r.userId} value={r.userId}>{tournamentName(tournament, members, r.userId)}{r.isGuest ? ' (ospite)' : ''}</option>)}</select></label>}
    <p>L’ospite occupa un posto nel torneo, senza creare un account. Nelle coppie scelte indichi tu il suo compagno: il membro deve ricambiare la scelta; per due ospiti gestisci entrambe le scelte.</p>
    <p>Inserimento, modifiche e rimozione chiudono un’ora prima dell’inizio, come le altre iscrizioni.</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    <button className="button button--primary" disabled={busy}>{busy ? 'Attendi…' : 'Salva ospite'}</button>
    {guest && (removing ? <div><p>Rimuovere {guest.displayName} dal torneo? La coppia eventualmente confermata dovrà essere ricomposta.</p><button type="button" className="button" disabled={busy} onClick={() => void remove()}>Conferma rimozione ospite</button></div> : <button type="button" className="button button--ghost" disabled={busy} onClick={() => setRemoving(true)}>Rimuovi ospite</button>)}
  </form></Modal>
}

function TournamentDetail({ id, user, members, onBack }: { id: string; user: SessionUser; members: MemberProfile[]; onBack: () => void }) {
  const [record, setRecord] = useState<{ value: Tournament | null } | null>(null)
  const [scores, setScores] = useState<TournamentScore[]>([])
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0)
  const [editor, setEditor] = useState(false), [matchId, setMatchId] = useState('')
  const [guestEditor, setGuestEditor] = useState<{ id: string | null } | null>(null)
  const [confirmation, setConfirmation] = useState<'publish' | 'start' | 'advance' | 'cancel' | null>(null)
  const [message, setMessage] = useState(''), [now, setNow] = useState(Date.now)
  const manager = Boolean(record?.value && canManageTournament(record.value, user.id))
  useEffect(() => repository.subscribeTournament(id, user.id, value => { setRecord({ value }); setError('') }, err => setError(err.message)), [id, user.id, attempt])
  const canReadScores = record?.value && (record.value.published || manager)
  useEffect(() => {
    if (!canReadScores) return
    return repository.subscribeTournamentScores(id, setScores, err => setError(err.message))
  }, [id, canReadScores, attempt])
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  async function perform(action: () => Promise<void>, success: string) {
    setBusy(true); setError(''); setMessage('')
    try { await action(); setMessage(success); setConfirmation(null) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Operazione non riuscita. Riprova.') }
    finally { setBusy(false) }
  }
  const t = record?.value
  if (!t) return <main className="dashboard tournament-page"><button className="button button--ghost" onClick={onBack}><ArrowLeft /> Tornei</button><h1>{record ? 'Torneo non trovato' : 'Caricamento torneo…'}</h1>{error && <p role="alert">{error}</p>}<button className="button" onClick={() => setAttempt(a => a + 1)}>Riprova</button></main>
  const format = TOURNAMENT_FORMATS.find(f => f.id === t.format)!
  const open = tournamentRegistrationsOpen(t, now)
  const own = t.registrations[user.id]
  const registrations = Object.values(t.registrations).sort((a, b) => a.joinedAt - b.joinedAt || a.userId.localeCompare(b.userId))
  const name = (uid: string) => tournamentName(t, members, uid)
  const pairName = (ids: string[]) => ids.map(name).join(' + ')
  const standings = getTournamentStandings(t, scores)
  const matches = Object.values(t.matches).sort((a, b) => a.round - b.round || a.wave - b.wave || a.court - b.court)
  const nextLabel = t.currentRound === t.totalRounds ? 'Concludi torneo e assegna il podio' : 'Conferma turno e prosegui'
  const timed = tournamentUsesTimedMatches(t), clock = getTournamentRoundClock(t, now)
  const plan = timed ? getTimedTournamentPlan(t, t.currentRound > 0 ? registrations.length : t.capacity) : null
  return <main className="dashboard tournament-page">
    <button className="button button--ghost" onClick={onBack}><ArrowLeft size={18} /> Tutti i tornei</button>
    <section className="tournament-hero"><div><span className="tournament-status">{tournamentStatus(t, now)}</span><h1>{t.title}</h1><p><CalendarDays size={18} /> {dateLabel(t.startsAt)}</p><p>{VENUES.find(v => v.id === t.venueId)?.name} · {t.courts} {t.courts === 1 ? 'campo' : 'campi'}</p></div><Trophy size={44} aria-hidden="true" /></section>
    <section className="tournament-panel"><h2>{format.name}{timed ? ' a tempo' : ''}</h2><p>{format.description}</p><p>{timed ? timedRanking : format.scoring}</p><p>{timed ? `${t.matchMinutes ?? 15} minuti a partita. ${timedRules}` : tournamentUsesRotatingPairs(t) ? `${t.rounds} turni · ${t.pointsPerMatch} punti totali a partita.` : `Coppie ${t.pairing === 'random-fixed' ? 'sorteggiate' : 'scelte dai giocatori'}. Un set a 6, tie-break sul 6–6.`}</p><p>Risultati: {t.scoreAccess === 'admin' ? 'solo organizzatore' : 'organizzatore e giocatori di ciascuna partita'}, con assistenza dell’amministratore. I risultati si possono correggere prima di confermare il turno.</p></section>
    {plan && <section className="tournament-panel"><h2>Il programma in {plan.totalMinutes} minuti</h2><p>{plan.teams} coppie · {plan.rounds} turni · {plan.matchesPerPair} partite a testa ({plan.playingMinutes} minuti in campo). {plan.teams % 2 ? 'Un turno di riposo per ogni coppia.' : 'Tutti giocano a ogni turno.'}</p><p>{t.warmupMinutes ?? 5} minuti di riscaldamento e {t.changeoverMinutes ?? 2} minuti tra i turni, inclusi nel totale. {t.currentRound === 0 ? 'Stima con capienza piena: il programma verrà adattato agli iscritti effettivi.' : 'Programma basato sugli iscritti effettivi.'}</p><details><summary>Orari indicativi dei turni</summary><ol className="tournament-schedule">{plan.schedule.map(r => <li key={r.round}><span>Turno {r.round}</span><strong>{timeLabel(r.startsAt)}–{timeLabel(r.endsAt)}</strong></li>)}</ol><p>Gli orari sono indicativi: l’organizzatore avvia ogni timer quando tutti sono pronti, dopo il riscaldamento o il cambio campo. Nessun turno parte automaticamente.</p></details></section>}
    {error && <p className="form-error tournament-panel" role="alert">{error} <button onClick={() => setAttempt(a => a + 1)}>Ricarica dati</button></p>}
    {message && <p className="tournament-message" role="status">{message}</p>}
    {manager && <section className="tournament-panel tournament-actions" aria-label="Gestione torneo">
      {t.status === 'draft' && <><button className="button" disabled={busy} onClick={() => setEditor(true)}>Modifica bozza</button><button className="button button--primary" disabled={busy} onClick={() => setConfirmation('publish')}>Pubblica al gruppo</button></>}
      {t.published && <button className="button" onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#tornei/${encodeURIComponent(t.id)}`).then(() => setMessage('Link copiato. Puoi mandarlo nel gruppo.')).catch(() => setMessage(`Link: ${window.location.origin}/#tornei/${encodeURIComponent(t.id)}`)) }}><Copy size={17} /> Copia link torneo</button>}
      {t.status === 'open' && <button className="button button--primary" disabled={busy || open} onClick={() => setConfirmation('start')}>Sorteggia e prepara tabellone</button>}
      {t.status === 'running' && <button className="button button--primary" disabled={busy || (timed && clock.state !== 'expired')} onClick={() => setConfirmation('advance')}>{nextLabel}</button>}
      {t.status !== 'completed' && t.status !== 'cancelled' && <button className="button button--ghost" disabled={busy} onClick={() => setConfirmation('cancel')}>Annulla torneo</button>}
    </section>}
    {timed && t.status === 'running' && <TournamentRoundTimer tournament={t} now={now} manager={manager} busy={busy} onStart={() => void perform(() => repository.actOnTournament(t.id, 'start-round', user), 'Timer avviato per tutti.')} />}
    {t.status !== 'draft' && <section className="tournament-panel"><div className="tournament-section-heading"><h2>Iscritti</h2><strong>{registrations.length}/{t.capacity}</strong></div>
      <p>{t.status === 'cancelled' ? 'Iscrizioni chiuse: torneo annullato.' : `${open ? 'Iscrizioni e scelta del compagno fino a' : 'Iscrizioni chiuse dal'} ${dateLabel(t.startsAt - 3_600_000)}.`}</p>
      {open && <div className="tournament-actions">{own ? <><span className="tournament-message"><Check size={18} /> Sei iscritto</span><button className="button" disabled={busy} onClick={() => void perform(() => repository.leaveTournament(t.id, user), 'Iscrizione ritirata.')}>Ritira iscrizione</button></> : <button className="button button--primary" disabled={busy || registrations.length >= t.capacity} onClick={() => void perform(() => repository.registerForTournament(t.id, null, user), 'Sei iscritto al torneo.')}>{registrations.length >= t.capacity ? 'Torneo completo' : 'Iscriviti al torneo'}</button>}</div>}
      {manager && open && <button className="button tournament-add-guest" disabled={busy || registrations.length >= t.capacity} onClick={() => setGuestEditor({ id: null })}><Plus size={18} /> Aggiungi ospite esterno</button>}
      {own && t.pairing === 'chosen-fixed' && open && <label className="tournament-partner">Scegli il tuo compagno<select disabled={busy} value={own.partnerId && t.registrations[own.partnerId] ? own.partnerId : ''} onChange={e => void perform(() => repository.registerForTournament(t.id, e.target.value || null, user), 'Scelta del compagno aggiornata. La coppia è confermata quando la scelta è reciproca.')}><option value="">Da scegliere</option>{registrations.filter(r => r.userId !== user.id).map(r => <option key={r.userId} value={r.userId}>{name(r.userId)}</option>)}</select><small>Anche il compagno deve selezionare te. Non viene iscritto nessuno al posto tuo.</small></label>}
      <ul className="tournament-registrations">{registrations.map(r => <li key={r.userId}><ProfileAvatar displayName={name(r.userId)} avatarDataUrl={members.find(m => m.id === r.userId)?.avatarDataUrl} decorative /><span><strong>{name(r.userId)}{r.userId === user.id ? ' (tu)' : ''}{r.isGuest ? ' · Ospite' : ''}</strong>{t.pairing === 'chosen-fixed' && <small>{r.partnerId && t.registrations[r.partnerId]?.partnerId === r.userId ? `Coppia confermata con ${name(r.partnerId)}` : r.partnerId && t.registrations[r.partnerId] ? `In attesa di ${name(r.partnerId)}` : 'Compagno da confermare'}</small>}{r.isGuest && manager && open && <button className="button button--ghost tournament-guest-edit" onClick={() => setGuestEditor({ id: r.userId })} aria-label={`Gestisci ospite ${name(r.userId)}`}>Gestisci ospite</button>}</span></li>)}</ul>
      {registrations.length === 0 && <p>Ancora nessun iscritto.</p>}
      {t.status === 'open' && !open && <p>L’organizzatore prepara il tabellone con gli iscritti effettivi. Se il numero non è compatibile con la formula, il torneo non parte.</p>}
    </section>}
    {matches.length > 0 && <section className="tournament-panel"><h2>{t.status === 'completed' ? 'Risultati del torneo' : `Partite · turno ${t.currentRound} di ${t.totalRounds}`}</h2><p>{timed ? 'Tutte le partite del turno iniziano insieme. Segnate i game completati; i risultati sono provvisori finché l’organizzatore conferma il turno.' : 'Le ondate si giocano in sequenza; i campi della stessa ondata possono giocare contemporaneamente.'}</p>
      {Array.from(new Set(matches.map(m => m.round))).map(round => <details className="tournament-round" key={round} open={round === t.currentRound}><summary>Turno {round}{t.status === 'completed' || round < t.currentRound ? ' · confermato' : round > t.currentRound ? ' · in programma' : ' · corrente'}</summary>
        {t.format === 'round-robin' && t.teams.filter(team => !matches.some(m => m.round === round && (m.teamA.id === team.id || m.teamB.id === team.id))).map(team => <p className="tournament-rest" key={team.id}>Riposa: {pairName(team.playerIds)}</p>)}
        <div className="tournament-matches">{matches.filter(m => m.round === round).map(match => {
          const score = scores.find(s => s.matchId === match.id)
          const allowed = t.status === 'running' && round === t.currentRound && now >= t.startsAt && (!timed || (t.roundStartedAt != null && now >= t.roundStartedAt)) && (manager || (t.scoreAccess === 'players' && [...match.teamA.playerIds, ...match.teamB.playerIds].includes(user.id)))
          return <article key={match.id} className="tournament-match"><header>{match.stage === 'final' ? 'Finale · ' : match.stage === 'bronze' ? 'Finale 3° posto · ' : ''}Campo {match.court}{!timed && ` · Ondata ${match.wave}`}</header><div><span>{pairName(match.teamA.playerIds)}</span><strong>{score?.scoreA ?? '–'}</strong></div><div><span>{pairName(match.teamB.playerIds)}</span><strong>{score?.scoreB ?? '–'}</strong></div>{allowed && <button className="button" disabled={busy} onClick={() => setMatchId(match.id)}>{score ? 'Modifica risultato' : 'Inserisci risultato'}<span className="sr-only">: {pairName(match.teamA.playerIds)} contro {pairName(match.teamB.playerIds)}</span></button>}{!score && !allowed && <small>{now < t.startsAt ? 'Risultati disponibili dall’inizio' : timed && clock.state === 'waiting' ? 'In attesa dell’avvio del turno' : 'In attesa del risultato'}</small>}</article>
        })}</div>
      </details>)}
    </section>}
    {t.currentRound > 0 && <section className="tournament-panel"><h2>{t.status === 'completed' ? 'Il podio e la classifica finale' : t.format === 'knockout' ? 'Statistiche del tabellone' : 'Classifica provvisoria'}</h2>{t.status === 'completed' && <div className="tournament-podium">{standings.filter(row => row.rank <= 3).map(row => <div key={row.id}><Trophy size={25} /><strong>{row.rank}°{row.tied ? ' ex aequo' : ''}</strong><span>{pairName(row.playerIds)}</span></div>)}</div>}
      <div className="tournament-table-wrap"><table className="tournament-table"><caption>{timed ? 'Classifica coppie · V–N–P: vinte, pareggiate, perse' : tournamentUsesRotatingPairs(t) ? 'Classifica individuale · punti' : 'Classifica coppie · game'}</caption><thead><tr><th scope="col">{t.format === 'knockout' && t.status !== 'completed' ? 'Coppia' : 'Posizione'}</th>{timed ? <><th scope="col">Punti</th><th scope="col">V–N–P</th><th scope="col">Game fatti/subiti</th></> : <><th scope="col">Giocate</th><th scope="col">Vinte</th><th scope="col">Fatti</th><th scope="col">Subiti</th></>}</tr></thead><tbody>{standings.map(row => <tr key={row.id}><th scope="row">{(t.format !== 'knockout' || t.status === 'completed') && <strong>{row.rank}°{row.tied ? ' =' : ''} </strong>}{pairName(row.playerIds)}</th>{timed ? <><td><strong>{row.tablePoints}</strong></td><td>{row.wins}–{row.draws}–{row.played - row.wins - row.draws}</td><td>{row.pointsFor}/{row.pointsAgainst}</td></> : <><td>{row.played}</td><td>{row.wins}</td><td>{row.pointsFor}</td><td>{row.pointsAgainst}</td></>}</tr>)}</tbody></table></div>
    </section>}
    <p className="tournament-note">Torneo del gruppo, separato dal Fanta e dalle partite ordinarie. Nessuna prenotazione automatica dei campi.</p>
    {editor && <TournamentEditor tournament={t} user={user} onClose={() => setEditor(false)} onSaved={() => setEditor(false)} />}
    {guestEditor && <TournamentGuestEditor tournament={t} guestId={guestEditor.id} user={user} members={members} onClose={() => setGuestEditor(null)} />}
    {matchId && t.matches[matchId] && <TournamentScoreEditor tournament={t} match={t.matches[matchId]} score={scores.find(s => s.matchId === matchId)} members={members} user={user} onClose={() => setMatchId('')} />}
    {confirmation && <Modal title={confirmation === 'publish' ? 'Pubblica il torneo?' : confirmation === 'cancel' ? 'Annulla il torneo?' : confirmation === 'start' ? 'Conferma il sorteggio?' : nextLabel} onClose={() => !busy && setConfirmation(null)}><div className="tournament-form"><p>{confirmation === 'publish' ? 'Gli altri membri potranno aprire il link e iscriversi. Le impostazioni non saranno più modificabili.' : confirmation === 'cancel' ? 'Le iscrizioni e i risultati resteranno consultabili, ma non si potrà più giocare. Non vengono cancellati dati.' : confirmation === 'start' ? 'Coppie e calendario verranno salvati definitivamente usando gli iscritti attuali. Nessuna iscrizione verrà aggiunta dopo il sorteggio.' : 'Conferma solo dopo aver controllato tutti i risultati. I punteggi di questo turno non saranno più modificabili perché determinano classifica e abbinamenti successivi.'}</p><button className="button button--primary" disabled={busy} onClick={() => void perform(() => repository.actOnTournament(t.id, confirmation, user), confirmation === 'publish' ? 'Torneo pubblicato. Copia il link e condividilo con il gruppo.' : 'Torneo aggiornato.')}>{busy ? 'Attendi…' : 'Conferma'}</button>{error && <p role="alert" className="form-error">{error}</p>}</div></Modal>}
  </main>
}

export function TournamentsPage({ user, members, onBack }: { user: SessionUser; members: MemberProfile[]; onBack: () => void }) {
  const [id, setId] = useState(locationId), [items, setItems] = useState<Tournament[] | null>(null)
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  const [creating, setCreating] = useState(false), [error, setError] = useState(''), [attempt, setAttempt] = useState(0)
  useEffect(() => { const changed = () => setId(locationId()); window.addEventListener('hashchange', changed); window.addEventListener('popstate', changed); return () => { window.removeEventListener('hashchange', changed); window.removeEventListener('popstate', changed) } }, [])
  useEffect(() => {
    if (id) return
    return repository.subscribeTournaments(user.id, data => { setItems(data); setError('') }, reason => setError(reason.message))
  }, [id, user.id, attempt])
  const open = (nextId: string) => { setId(nextId); window.location.assign(nextId ? `#tornei/${encodeURIComponent(nextId)}` : '#tornei') }
  if (id) return <TournamentDetail key={id} id={id} user={user} members={members} onBack={() => open('')} />
  return <main className="dashboard tournament-page"><button className="button button--ghost" onClick={onBack}><ArrowLeft size={18} /> Torna alla bacheca</button><section className="tournament-hero"><div><h1>I tornei del gruppo</h1><p>Compagni diversi, stessa voglia di giocare.</p></div><Trophy size={42} /></section>
    <div className="tournament-actions"><button className="button button--primary" onClick={() => setCreating(true)}><Plus size={18} /> Crea torneo</button><p>Chi crea il torneo lo gestisce. Le bozze sono visibili solo al creatore e all’amministratore.</p></div>
    {error && <p role="alert">{error} <button onClick={() => setAttempt(a => a + 1)}>Riprova</button></p>}
    {!items && !error && <p>Caricamento tornei…</p>}
    {items?.length === 0 && <section className="tournament-panel"><UsersRound /><h2>Il primo torneo aspetta voi</h2><p>Scegli una formula e prepara una bozza, oppure aspetta un torneo pubblicato dal gruppo.</p></section>}
    <div className="tournament-list">{items?.map(t => <button className="tournament-panel" key={t.id} onClick={() => open(t.id)}><span>{tournamentStatus(t, now)}</span><h2>{t.title}</h2><p>{dateLabel(t.startsAt)}</p><p>{VENUES.find(v => v.id === t.venueId)?.name}</p><strong>{TOURNAMENT_FORMATS.find(f => f.id === t.format)?.name} · {Object.keys(t.registrations).length}/{t.capacity} iscritti</strong></button>)}</div>
    {items?.length === 50 && <p>Mostrati i 50 tornei più recenti. I precedenti rimangono accessibili dal loro link.</p>}
    {creating && <TournamentEditor user={user} onClose={() => setCreating(false)} onSaved={nextId => { setCreating(false); open(nextId) }} />}
  </main>
}
