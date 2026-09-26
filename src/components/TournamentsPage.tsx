import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, CalendarDays, Check, Copy, Plus, Trophy, UsersRound } from 'lucide-react'
import type { MemberProfile, SessionUser } from '../types'
import { canEditTournament, canManageTournament, getTimedTournamentPlan, getTournamentRoundClock, getTournamentStandings, padelDateTimeToTimestamp, toDateTimeInput, tournamentRegistrationsOpen, tournamentSettingsEditable, tournamentUsesRotatingPairs, tournamentUsesTimedMatches, validateTournamentInput } from '../lib/domain'
import { repository } from '../lib/repository'
import { SLOT_ADMIN_USER_ID } from '../lib/admin'
import { openTournamentSimulation, resetTournamentSimulation, type TournamentSimulationSession } from '../lib/tournamentSimulation'
import { TournamentRuntimeContext, useTournamentNow, useTournamentRuntime } from './tournamentRuntime'
import { TournamentSimulationTools } from './TournamentSimulationTools'
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
  if (t.status === 'running' && (!tournamentUsesTimedMatches(t) || t.roundStartedAt != null || t.currentRound > 1)) return 'In corso'
  return statusLabel[t.status]
}
function locationId(): string {
  try { return window.location.hash.startsWith('#tornei/') ? decodeURIComponent(window.location.hash.slice(8)) : '' } catch { return '' }
}
function tournamentName(t: Tournament, members: MemberProfile[], id: string): string {
  return members.find(m => m.id === id)?.displayName ?? t.registrations[id]?.displayName ?? 'Giocatore'
}

function TournamentPlan({ input, count = input.capacity }: { input: TournamentInput; count?: number }) {
  // Capacity is typed freely: do not build a schedule for incomplete/invalid input.
  if (!Number.isInteger(count) || count < 6 || count > 32 || count % 2 !== 0) return <p className="form-error" role="alert">Per calcolare il programma inserisci un numero pari di partecipanti, da 6 a 32.</p>
  const plan = getTimedTournamentPlan(input, count)
  return <div className="tournament-plan" aria-live="polite">
    <p><strong>{count} giocatori · {plan.teams} coppie · {input.courts} {input.courts === 1 ? 'campo' : 'campi'}</strong></p>
    {plan.feasible ? <><p>{plan.rounds} turni da <strong>{plan.matchMinutes} minuti</strong> · {plan.matchCount} incontri totali.</p>
      <p>Ogni coppia gioca {plan.matchesPerPair} partite ({plan.playingMinutes} minuti in campo) e riposa {plan.restRounds} {plan.restRounds === 1 ? 'turno' : 'turni'}.</p>
      <p>Programma: <strong>{plan.totalMinutes} minuti</strong>{plan.adaptive ? ` sui ${plan.availableMinutes} disponibili · ${plan.bufferMinutes} minuti di margine` : ''}, inclusi riscaldamento e cambi.</p></> : <p className="form-error" role="alert">Il tempo non basta: servono almeno {plan.minimumMinutes} minuti per partite da 5 minuti. Aumenta la durata o i campi, oppure riduci la capienza senza escludere chi è già iscritto.</p>}
    {input.courts < plan.requiredCourts && <p role="alert" className="form-error">Servono almeno {plan.requiredCourts} campi per questo programma a durata fissa.</p>}
  </div>
}

function TournamentTimingFields({ input, update }: { input: TournamentInput; update: <K extends keyof TournamentInput>(key: K, value: TournamentInput[K]) => void }) {
  return <><div className="tournament-form__grid">
    {input.totalMinutes != null ? <label>Durata totale disponibile (minuti)<input type="number" min={15} max={720} required value={input.totalMinutes} onChange={e => update('totalMinutes', Number(e.target.value))} /></label> : <label>Minuti per partita<input type="number" min={5} max={30} required value={input.matchMinutes ?? 15} onChange={e => update('matchMinutes', Number(e.target.value))} /></label>}
    <label>Minuti di riscaldamento<input type="number" min={0} max={15} required value={input.warmupMinutes ?? 5} onChange={e => update('warmupMinutes', Number(e.target.value))} /></label>
    <label>Minuti tra i turni<input type="number" min={0} max={5} required value={input.changeoverMinutes ?? 2} onChange={e => update('changeoverMinutes', Number(e.target.value))} /></label>
  </div><TournamentPlan input={input} /><p>Stima a capienza piena. Al sorteggio durata e calendario si adattano agli iscritti effettivi; le coppie restano fisse e incontrano tutte le altre. Minimo 6 giocatori, in numero pari. Gli ospiti contano come tutti gli altri.</p></>
}

function TournamentEditor({ tournament, user, onClose, onSaved }: { tournament?: Tournament; user: SessionUser; onClose: () => void; onSaved: (id: string) => void }) {
  const { repository, now: getNow, simulation } = useTournamentRuntime()
  const [input, setInput] = useState<TournamentInput>(() => tournament ?? { title: '', startsAt: Math.ceil(getNow() / 1_800_000) * 1_800_000 + 7 * 86_400_000, venueId: 'oasi-boschetto', format: 'americano', pairing: 'rotating', capacity: 8, courts: 1, rounds: 7, pointsPerMatch: 24, scoreAccess: 'players' })
  const [date, setDate] = useState(toDateTimeInput(new Date(input.startsAt)))
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const rotating = tournamentUsesRotatingPairs(input)
  const timed = tournamentUsesTimedMatches(input)
  const metadataOnly = Boolean(tournament && !tournamentSettingsEditable(tournament, user.id, getNow()))
  const enrolled = tournament ? Object.keys(tournament.registrations).length : 0
  const rulesLocked = enrolled > 0
  const update = <K extends keyof TournamentInput>(key: K, value: TournamentInput[K]) => setInput(current => ({ ...current, [key]: value }))
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      const value = { ...input, startsAt: metadataOnly || date === toDateTimeInput(new Date(input.startsAt)) ? input.startsAt : padelDateTimeToTimestamp(date) }
      if (tournament) { await repository.editTournament(tournament.id, value, user); onSaved(tournament.id) }
      else onSaved(await repository.createTournament(validateTournamentInput(value, getNow()), user))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Salvataggio non riuscito. Riprova.') }
    finally { setBusy(false) }
  }
  return <Modal title={tournament ? 'Modifica torneo' : 'Nuovo torneo'} eyebrow={simulation ? 'Simulazione privata · dati fittizi' : 'Organizza il tuo torneo'} onClose={onClose} size="wide">
    <form className="tournament-form" onSubmit={submit}>
      {tournament && user.id !== tournament.createdBy && <p className="tournament-note">Stai modificando il torneo di un altro membro come amministratore. Il creatore e gli iscritti rimarranno invariati.</p>}
      {metadataOnly && <p className="tournament-note">Per proteggere lo storico puoi correggere soltanto nome e circolo. Calendario, coppie e risultati restano invariati.</p>}
      <label>Nome del torneo<input required minLength={3} maxLength={80} value={input.title} onChange={e => update('title', e.target.value)} placeholder="Il torneo dei fagiani" /></label>
      <label>Circolo<select value={input.venueId} onChange={e => update('venueId', e.target.value as TournamentInput['venueId'])}>{VENUES.map(v => <option value={v.id} key={v.id}>{v.name}</option>)}</select></label>
      {!metadataOnly && <><SlotDateTimeField value={date} onChange={setDate} />
      <p>Orario italiano. Le iscrizioni chiudono automaticamente un’ora prima. Cambiando la data cambia anche la scadenza: se sposti l’inizio a più di un’ora da ora, le iscrizioni si riaprono.</p>
      {rulesLocked && <p className="tournament-note">Ci sono già {enrolled} iscritti: formula e tipo di coppie restano invariati.{rotating ? ' Anche i punti totali per incontro restano invariati.' : ''}{input.format === 'round-robin' ? ' Puoi ancora cambiare la durata delle partite prima del sorteggio, senza perdere iscritti o compagni scelti.' : ''}</p>}
      <fieldset className="tournament-formats" disabled={rulesLocked}><legend>Formula</legend>{TOURNAMENT_FORMATS.map(format => <label key={format.id} className={input.format === format.id ? 'is-selected' : ''}>
        <input type="radio" name="format" value={format.id} checked={input.format === format.id} onChange={() => setInput(current => ({ ...current, format: format.id, pairing: format.id === 'americano' || format.id === 'mexicano' ? 'rotating' : 'random-fixed', capacity: 8, scoringMode: 'standard', totalMinutes: null, matchMinutes: 15 }))} />
        <span><strong>{format.name}</strong><small>{format.description}</small></span>
      </label>)}</fieldset>
      {!rotating && <label>Coppie fisse<select disabled={rulesLocked} value={input.pairing} onChange={e => update('pairing', e.target.value as TournamentInput['pairing'])}><option value="random-fixed">Sorteggiate dal computer</option><option value="chosen-fixed">Scelte dai giocatori, con conferma reciproca</option></select></label>}
      {input.format === 'round-robin' && <label>Durata delle partite<select value={input.scoringMode ?? 'standard'} onChange={e => setInput(current => ({ ...current, scoringMode: e.target.value as TournamentInput['scoringMode'], totalMinutes: e.target.value === 'timed' ? 90 : null, matchMinutes: 15 }))}><option value="standard">Un set a 6 game</option><option value="timed">Partite a tempo</option></select></label>}
      <div className="tournament-form__grid">
        <label>Massimo partecipanti<input type="number" inputMode="numeric" required min={Math.max(enrolled, rotating ? 4 : input.format === 'knockout' ? 8 : 6)} max={32} step={1} aria-describedby="tournament-capacity-help" value={input.capacity || ''} onChange={e => update('capacity', Number(e.target.value))} /></label>
        <label>Campi disponibili<input type="number" required min={1} max={8} value={input.courts} onChange={e => update('courts', Number(e.target.value))} /></label>
        {rotating && <><label>Turni<input required type="number" min={1} max={31} value={input.rounds} onChange={e => update('rounds', Number(e.target.value))} /></label><label>Punti totali per incontro<select disabled={rulesLocked} value={input.pointsPerMatch} onChange={e => update('pointsPerMatch', Number(e.target.value))}>{[16, 24, 32].map(n => <option key={n}>{n}</option>)}</select></label></>}
      </div>
      <p id="tournament-capacity-help">{input.format === 'knockout' ? 'Scrivi 8, 16 o 32 partecipanti per il tabellone a eliminazione diretta.' : rotating ? 'Scrivi un multiplo di 4, da 4 a 32 partecipanti.' : 'Scrivi un numero pari, da 6 a 32 partecipanti.'}{enrolled > 0 ? ` Ci sono già ${enrolled} iscritti: non puoi scendere sotto questo numero.` : ''}</p>
      <p>Il massimo partecipanti comprende anche gli ospiti. Raggiunto il limite, le iscrizioni si fermano. Si può partire con meno persone se il numero è compatibile con la formula; nessun iscritto viene rimosso abbassando il limite.</p>
      {timed && input.totalMinutes == null && <button type="button" className="button" disabled={!Number.isInteger(input.capacity) || input.capacity < 6 || input.capacity > 32 || input.capacity % 2 !== 0} onClick={() => update('totalMinutes', getTimedTournamentPlan(input).totalMinutes)}>Adatta alla durata totale disponibile</button>}
      {timed && <TournamentTimingFields input={input} update={update} />}
      <p>{timed ? `${timedRules} ${timedRanking}` : rotating ? `Ogni coppia guadagna i punti segnati: per esempio ${input.pointsPerMatch / 2 + 2}–${input.pointsPerMatch / 2 - 2}. Tutti giocano in ogni turno, anche in ondate su meno campi.` : 'Ogni partita è un set a 6 game, tie-break sul 6–6 (si registra 7–6). Il calendario viene calcolato dagli iscritti effettivi.'}</p>
      <label>Chi può inserire i risultati<select value={input.scoreAccess} onChange={e => update('scoreAccess', e.target.value as TournamentInput['scoreAccess'])}><option value="players">Organizzatore e giocatori della partita</option><option value="admin">Solo organizzatore</option></select></label>
      </>}
      <p className="tournament-note">{simulation ? 'Salvi soltanto questa prova sul tuo dispositivo: nessun torneo reale viene modificato.' : !tournament || tournament.status === 'draft' ? 'Salvi una bozza privata, da pubblicare dopo averla controllata.' : 'Le modifiche saranno subito visibili nella pagina del torneo. Iscrizioni e compagni scelti vengono conservati.'} Il torneo non prenota i campi e non assegna punti Fanta.</p>
      {error && <p role="alert" className="form-error">{error}</p>}
      <button className="button button--primary" disabled={busy || Boolean(tournament && !canEditTournament(tournament, user.id, getNow()))}>{busy ? 'Salvataggio…' : tournament ? 'Salva modifiche' : 'Salva bozza privata'}</button>
    </form>
  </Modal>
}

function TournamentScoreEditor({ tournament, match, score, members, user, onClose }: { tournament: Tournament; match: TournamentMatch; score?: TournamentScore; members: MemberProfile[]; user: SessionUser; onClose: () => void }) {
  const { repository, simulation } = useTournamentRuntime()
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
  return <Modal title="Risultato della partita" eyebrow={simulation ? 'Simulazione privata · dati fittizi' : undefined} onClose={onClose}><form className="tournament-form" onSubmit={save}>
    <p>Turno {match.round} · Campo {match.court}{!timed && ` · Ondata ${match.wave}`}</p>
    <label>{pairName(match.teamA.playerIds)}<input type="number" inputMode="numeric" min={0} max={timed ? 99 : 32} required value={a} onChange={e => setA(e.target.value)} /></label>
    <label>{pairName(match.teamB.playerIds)}<input type="number" inputMode="numeric" min={0} max={timed ? 99 : 32} required value={b} onChange={e => setB(e.target.value)} /></label>
    <p>{timed ? 'Inserisci solo i game completati, anche 3–2, 4–4 o 0–0. Non serve arrivare a 6. I risultati restano provvisori fino alla conferma del turno.' : tournamentUsesRotatingPairs(tournament) ? `La somma deve essere ${tournament.pointsPerMatch}. È ammesso il pareggio.` : 'Un set: da 6–0 a 6–4, oppure 7–5 o 7–6.'} Puoi correggerlo finché l’organizzatore non avanza al turno successivo.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button button--primary" disabled={busy}>{busy ? 'Salvataggio…' : 'Salva risultato'}</button>
  </form></Modal>
}

function TournamentGuestEditor({ tournament, guestId, user, members, registrationsOpen, onClose }: {
  tournament: Tournament; guestId: string | null; user: SessionUser; members: MemberProfile[]; registrationsOpen: boolean; onClose: () => void
}) {
  const { repository, simulation } = useTournamentRuntime()
  const guest = guestId ? tournament.registrations[guestId] : null
  const [name, setName] = useState(guest?.displayName ?? ''), [partner, setPartner] = useState(guest?.partnerId ?? '')
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [removing, setRemoving] = useState(false)
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      if (guestId && !registrationsOpen) await repository.renameTournamentGuest(tournament.id, guestId, name, user)
      else await repository.saveTournamentGuest(tournament.id, guestId, name, partner || null, user)
      onClose()
    }
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
  return <Modal title={guest && !registrationsOpen ? 'Modifica nome ospite' : guest ? 'Gestisci ospite' : 'Aggiungi partecipante esterno'} eyebrow={simulation ? 'Simulazione privata · dati fittizi' : undefined} onClose={onClose}><form className="tournament-form" onSubmit={save}>
    <label>Nome dell’ospite<input required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
    {registrationsOpen && tournament.pairing === 'chosen-fixed' && <label>Compagno dell’ospite<select value={tournament.registrations[partner] ? partner : ''} onChange={e => setPartner(e.target.value)}><option value="">Da scegliere</option>{Object.values(tournament.registrations).filter(r => r.userId !== guestId).map(r => <option key={r.userId} value={r.userId}>{tournamentName(tournament, members, r.userId)}{r.isGuest ? ' (ospite)' : ''}</option>)}</select></label>}
    {registrationsOpen ? <><p>L’ospite occupa un posto nel torneo, senza creare un account. Nelle coppie scelte indichi tu il suo compagno: il membro deve ricambiare la scelta; per due ospiti gestisci entrambe le scelte.</p><p>Inserimento, scelta del compagno e rimozione chiudono un’ora prima dell’inizio. Il nome resta modificabile anche dopo.</p></> : <p>Puoi correggere il nome in qualsiasi momento. Iscrizione, compagno, tabellone e risultati restano invariati.</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    <button className="button button--primary" disabled={busy}>{busy ? 'Attendi…' : guest && !registrationsOpen ? 'Salva nome' : 'Salva ospite'}</button>
    {guest && registrationsOpen && (removing ? <div><p>Rimuovere {guest.displayName} dal torneo? La coppia eventualmente confermata dovrà essere ricomposta.</p><button type="button" className="button" disabled={busy} onClick={() => void remove()}>Conferma rimozione ospite</button></div> : <button type="button" className="button button--ghost" disabled={busy} onClick={() => setRemoving(true)}>Rimuovi ospite</button>)}
  </form></Modal>
}

function TournamentDetail({ id, user, members, onBack, rehearsal }: { id: string; user: SessionUser; members: MemberProfile[]; onBack: () => void; rehearsal?: TournamentSimulationSession }) {
  const { repository, simulation } = useTournamentRuntime()
  const now = useTournamentNow()
  const [record, setRecord] = useState<{ value: Tournament | null } | null>(null)
  const [scores, setScores] = useState<TournamentScore[]>([])
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0)
  const [editor, setEditor] = useState(false), [matchId, setMatchId] = useState('')
  const [guestEditor, setGuestEditor] = useState<{ id: string | null } | null>(null)
  const [confirmation, setConfirmation] = useState<'publish' | 'start' | 'advance' | 'end-round' | 'cancel' | null>(null)
  const [selectedView, setSelectedView] = useState<'play' | 'standings' | 'details' | null>(null)
  const playArea = useRef<HTMLDivElement>(null)
  const [message, setMessage] = useState(''), [preview, setPreview] = useState(false)
  const manager = Boolean(record?.value && canManageTournament(record.value, user.id))
  useEffect(() => repository.subscribeTournament(id, user.id, value => { setRecord({ value }); setError('') }, err => setError(err.message)), [repository, id, user.id, attempt])
  const canReadScores = record?.value && (record.value.published || manager)
  useEffect(() => {
    if (!canReadScores) return
    return repository.subscribeTournamentScores(id, setScores, err => setError(err.message))
  }, [repository, id, canReadScores, attempt])
  async function perform(action: () => Promise<void>, success: string) {
    setBusy(true); setError(''); setMessage('')
    try {
      await action(); setMessage(success); setConfirmation(null)
      if (confirmation === 'advance' || confirmation === 'start') {
        setSelectedView(null)
        window.requestAnimationFrame(() => { playArea.current?.focus({ preventScroll: true }); playArea.current?.scrollIntoView?.({ block: 'start' }) })
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Operazione non riuscita. Riprova.') }
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
  const validCount = registrations.length >= 6 && registrations.length % 2 === 0
  const plannedCount = validCount ? registrations.length : t.capacity
  const plan = timed ? getTimedTournamentPlan(t, plannedCount) : null
  const hasDraw = t.currentRound > 0
  const view = selectedView ?? (t.status === 'completed' ? 'standings' : 'play')
  const currentMatches = matches.filter(m => m.round === t.currentRound)
  const received = currentMatches.filter(m => scores.some(s => s.matchId === m.id)).length
  const missing = currentMatches.length - received
  const canStopAfterScores = timed && clock.state === 'running' && missing === 0
  const canAdvance = currentMatches.length > 0 && received === currentMatches.length && (!timed || clock.state === 'expired' || clock.state === 'ended')
  const renderMatches = (round: number) => <>
    {t.format === 'round-robin' && t.teams.filter(team => !matches.some(m => m.round === round && (m.teamA.id === team.id || m.teamB.id === team.id))).map(team => <p className="tournament-rest" key={team.id}>Riposa: {pairName(team.playerIds)}</p>)}
    <div className="tournament-matches">{matches.filter(m => m.round === round).map(match => {
      const score = scores.find(s => s.matchId === match.id)
      const allowed = t.status === 'running' && round === t.currentRound && (!timed || (t.roundStartedAt != null && now >= t.roundStartedAt)) && (manager || (t.scoreAccess === 'players' && [...match.teamA.playerIds, ...match.teamB.playerIds].includes(user.id)))
      return <article key={match.id} className="tournament-match"><header>{match.stage === 'final' ? 'Finale · ' : match.stage === 'bronze' ? 'Finale 3° posto · ' : ''}Campo {match.court}{!timed && ` · Ondata ${match.wave}`}<span>{score ? 'Risultato inserito' : 'Da compilare'}</span></header><div><span>{pairName(match.teamA.playerIds)}</span><strong>{score?.scoreA ?? '–'}</strong></div><div><span>{pairName(match.teamB.playerIds)}</span><strong>{score?.scoreB ?? '–'}</strong></div>{allowed && <button className="button" disabled={busy} onClick={() => setMatchId(match.id)}>{score ? 'Modifica risultato' : 'Inserisci risultato'}<span className="sr-only">: {pairName(match.teamA.playerIds)} contro {pairName(match.teamB.playerIds)}</span></button>}{!score && !allowed && <small>{timed && round === t.currentRound && clock.state === 'waiting' ? 'In attesa dell’avvio del turno' : 'In attesa del risultato'}</small>}</article>
    })}</div>
  </>
  return <main className="dashboard tournament-page">
    <button className="button button--ghost" onClick={onBack}><ArrowLeft size={18} /> Tutti i tornei</button>
    {simulation && <p className="tournament-simulation-banner">Simulazione privata · Solo dati fittizi su questo dispositivo.</p>}
    <section className={`tournament-hero${hasDraw ? ' tournament-hero--compact' : ''}`}><div><span className="tournament-status">{tournamentStatus(t, now)}</span><h1>{t.title}</h1><p><CalendarDays size={18} /> {dateLabel(t.startsAt)}</p><p>{VENUES.find(v => v.id === t.venueId)?.name} · {t.courts} {t.courts === 1 ? 'campo' : 'campi'}</p></div><Trophy size={44} aria-hidden="true" /></section>
    {hasDraw && <nav className="tournament-view-nav" aria-label="Sezioni del torneo">{([['play', t.status === 'running' ? 'Turno in corso' : 'Partite'], ['standings', 'Classifica'], ['details', 'Dettagli']] as const).map(([value, label]) => <button key={value} className="button" aria-pressed={view === value} onClick={() => setSelectedView(value)}>{label}</button>)}</nav>}
    {error && <p className="form-error tournament-panel" role="alert">{error} <button onClick={() => setAttempt(a => a + 1)}>Ricarica dati</button></p>}
    {message && <p className="tournament-message" role="status">{message}</p>}
    <div ref={playArea} tabIndex={-1} className="tournament-play-area" hidden={!hasDraw || view !== 'play'}>
      {t.status === 'running' && <section className="tournament-live" aria-label="Turno corrente">
        {timed ? <TournamentRoundTimer tournament={t} now={now} manager={manager} busy={busy} simulation={simulation} onStart={() => void perform(() => repository.actOnTournament(t.id, 'start-round', user), simulation ? 'Timer di prova avviato.' : 'Timer avviato per tutti.')} onEnd={() => setConfirmation('end-round')} /> : <h2>Turno {t.currentRound} di {t.totalRounds}</h2>}
        <div className="tournament-live__scores"><div className="tournament-section-heading"><h3>Risultati del turno</h3><span>{received}/{currentMatches.length} inseriti</span></div>
          {!timed && <p className="tournament-note">Le ondate si giocano in sequenza; i campi della stessa ondata possono giocare insieme.</p>}
          {renderMatches(t.currentRound)}
        </div>
        <div className="tournament-live__next"><p>{timed && clock.state === 'waiting' ? 'Avvia il timer quando tutti sono pronti.' : missing > 0 ? missing === 1 ? 'Manca 1 risultato per confermare il turno.' : `Mancano ${missing} risultati per confermare il turno.` : timed && clock.state === 'running' ? 'Risultati inseriti. Attendi il timer o concludi il turno in anticipo.' : 'Tutti i risultati sono inseriti: controllali prima di proseguire.'}</p>
          {manager ? <button className="button button--primary" disabled={busy || (!canAdvance && !canStopAfterScores)} onClick={() => setConfirmation(canStopAfterScores ? 'end-round' : 'advance')}>{canStopAfterScores ? 'Concludi turno in anticipo' : nextLabel}</button> : <p className="tournament-note">L’organizzatore conferma i risultati e avvia il prossimo turno.</p>}
        </div>
      </section>}
      {rehearsal && <details className="tournament-panel tournament-secondary"><summary>Strumenti di prova</summary><TournamentSimulationTools session={rehearsal} tournament={t} now={now} busy={busy} onAction={action => perform(action, 'Prova aggiornata. Il torneo reale non è stato modificato.')} /></details>}
      {matches.length > 0 && <details className="tournament-panel tournament-secondary" open={t.status !== 'running'}><summary>{t.status === 'running' ? 'Altri turni e risultati' : 'Risultati del torneo'}</summary>
        {Array.from(new Set(matches.filter(m => t.status !== 'running' || m.round !== t.currentRound).map(m => m.round))).map(round => <details className="tournament-round" key={round}><summary>Turno {round}{t.status === 'completed' || round < t.currentRound ? ' · confermato' : ' · in programma'}</summary>{renderMatches(round)}</details>)}
      </details>}
    </div>
    <div className="tournament-detail-sections" hidden={hasDraw && view !== 'details'}>
    {!hasDraw && rehearsal && <TournamentSimulationTools session={rehearsal} tournament={t} now={now} busy={busy} onAction={action => perform(action, 'Prova aggiornata. Il torneo reale non è stato modificato.')} />}
    <section className="tournament-panel"><h2>{format.name}{timed ? ' a tempo' : ''}</h2><p>{format.description}</p><p>{timed ? timedRanking : format.scoring}</p><p>{timed ? timedRules : tournamentUsesRotatingPairs(t) ? `${t.rounds} turni · ${t.pointsPerMatch} punti totali a partita.` : `Coppie ${t.pairing === 'random-fixed' ? 'sorteggiate' : 'scelte dai giocatori'}. Un set a 6, tie-break sul 6–6.`}</p><p>Risultati: {t.scoreAccess === 'admin' ? 'solo organizzatore' : 'organizzatore e giocatori di ciascuna partita'}, con assistenza dell’amministratore. I risultati si possono correggere prima di confermare il turno.</p></section>
    {plan && <section className="tournament-panel"><h2>{t.currentRound > 0 ? 'Il programma del torneo' : 'Il programma previsto'}</h2>
      <TournamentPlan input={t} count={plannedCount} />
      <p>{t.warmupMinutes ?? 5} minuti di riscaldamento e {t.changeoverMinutes ?? 2} minuti tra i turni, inclusi nel totale. {t.currentRound > 0 ? 'Calendario definitivo, basato sugli iscritti al sorteggio.' : validCount ? 'Stima aggiornata sugli iscritti attuali: diventa definitiva al sorteggio.' : 'Stima a capienza piena: servono almeno 6 iscritti e un numero pari per preparare il tabellone.'}</p>
      {t.status === 'open' && !validCount && <p className="tournament-note">Iscritti attuali: {registrations.length}. {registrations.length % 2 ? 'Il numero è dispari: manca un compagno per completare le coppie.' : 'Non è ancora raggiunto il minimo di 6.'} Nessuno verrà escluso automaticamente.</p>}
      {plan.feasible && <details><summary>Orari indicativi dei turni</summary><ol className="tournament-schedule">{plan.schedule.map(r => <li key={r.round}><span>Turno {r.round}</span><strong>{timeLabel(r.startsAt)}–{timeLabel(r.endsAt)}</strong></li>)}</ol><p>Gli orari sono indicativi: l’organizzatore avvia ogni timer quando tutti sono pronti, dopo il riscaldamento o il cambio campo. Eventuali ritardi consumano il margine disponibile: nessun turno parte automaticamente.</p></details>}
    </section>}
    {manager && <section className="tournament-panel tournament-actions" aria-label="Gestione torneo">
      {canEditTournament(t, user.id, now) && <button className="button" disabled={busy} onClick={() => setEditor(true)}>Modifica torneo</button>}
      {t.status === 'draft' && !simulation && <button className="button button--primary" disabled={busy} onClick={() => setConfirmation('publish')}>Pubblica al gruppo</button>}
      {t.published && !simulation && <button className="button" onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#tornei/${encodeURIComponent(t.id)}`).then(() => setMessage('Link copiato. Puoi mandarlo nel gruppo.')).catch(() => setMessage(`Link: ${window.location.origin}/#tornei/${encodeURIComponent(t.id)}`)) }}><Copy size={17} /> Copia link torneo</button>}
      {!simulation && user.id === SLOT_ADMIN_USER_ID && <button className="button" onClick={() => setPreview(true)}>Prova in privato</button>}
      {t.status === 'open' && <button className="button button--primary" disabled={busy || open || (timed && (!validCount || !plan?.feasible))} onClick={() => setConfirmation('start')}>Sorteggia e prepara tabellone</button>}
      {t.status !== 'completed' && t.status !== 'cancelled' && <button className="button button--ghost" disabled={busy} onClick={() => setConfirmation('cancel')}>Annulla torneo</button>}
    </section>}
    {t.status !== 'draft' && <section className="tournament-panel"><div className="tournament-section-heading"><h2>Iscritti</h2><strong>{registrations.length}/{t.capacity}</strong></div>
      <p>Massimo {t.capacity} partecipanti, ospiti inclusi.{open ? registrations.length >= t.capacity ? ' Il torneo è completo.' : ` ${t.capacity - registrations.length} posti ancora disponibili.` : ''}</p>
      <p>{t.status === 'cancelled' ? 'Iscrizioni chiuse: torneo annullato.' : `${open ? 'Iscrizioni e scelta del compagno fino a' : 'Iscrizioni chiuse dal'} ${dateLabel(t.startsAt - 3_600_000)}.`}</p>
      {open && <div className="tournament-actions">{own ? <><span className="tournament-message"><Check size={18} /> Sei iscritto</span><button className="button" disabled={busy} onClick={() => void perform(() => repository.leaveTournament(t.id, user), 'Iscrizione ritirata.')}>Ritira iscrizione</button></> : <button className="button button--primary" disabled={busy || registrations.length >= t.capacity} onClick={() => void perform(() => repository.registerForTournament(t.id, null, user), 'Sei iscritto al torneo.')}>{registrations.length >= t.capacity ? 'Torneo completo' : 'Iscriviti al torneo'}</button>}</div>}
      {manager && open && <button className="button tournament-add-guest" disabled={busy || registrations.length >= t.capacity} onClick={() => setGuestEditor({ id: null })}><Plus size={18} /> Aggiungi ospite esterno</button>}
      {own && t.pairing === 'chosen-fixed' && open && <label className="tournament-partner">Scegli il tuo compagno<select disabled={busy} value={own.partnerId && t.registrations[own.partnerId] ? own.partnerId : ''} onChange={e => void perform(() => repository.registerForTournament(t.id, e.target.value || null, user), 'Scelta del compagno aggiornata. La coppia è confermata quando la scelta è reciproca.')}><option value="">Da scegliere</option>{registrations.filter(r => r.userId !== user.id).map(r => <option key={r.userId} value={r.userId}>{name(r.userId)}</option>)}</select><small>Anche il compagno deve selezionare te. Non viene iscritto nessuno al posto tuo.</small></label>}
      <ul className="tournament-registrations">{registrations.map(r => <li key={r.userId}><ProfileAvatar displayName={name(r.userId)} avatarDataUrl={members.find(m => m.id === r.userId)?.avatarDataUrl} decorative /><span><strong>{name(r.userId)}{r.userId === user.id ? ' (tu)' : ''}{r.isGuest ? ' · Ospite' : ''}</strong>{t.pairing === 'chosen-fixed' && <small>{r.partnerId && t.registrations[r.partnerId]?.partnerId === r.userId ? `Coppia confermata con ${name(r.partnerId)}` : r.partnerId && t.registrations[r.partnerId] ? `In attesa di ${name(r.partnerId)}` : 'Compagno da confermare'}</small>}{r.isGuest && manager && <button className="button button--ghost tournament-guest-edit" onClick={() => setGuestEditor({ id: r.userId })} aria-label={`${open ? 'Gestisci' : 'Modifica nome'} ospite ${name(r.userId)}`}>{open ? 'Gestisci ospite' : 'Modifica nome'}</button>}</span></li>)}</ul>
      {registrations.length === 0 && <p>Ancora nessun iscritto.</p>}
      {t.status === 'open' && !open && <p>L’organizzatore prepara il tabellone con gli iscritti effettivi. Se il numero non è compatibile con la formula, il torneo non parte.</p>}
    </section>}
    </div>
    {t.currentRound > 0 && <section className="tournament-panel" hidden={view !== 'standings'} aria-label="Classifica del torneo"><h2>{t.status === 'completed' ? 'Il podio e la classifica finale' : t.format === 'knockout' ? 'Statistiche del tabellone' : 'Classifica provvisoria'}</h2>{t.status === 'completed' && <div className="tournament-podium">{standings.filter(row => row.rank <= 3).map(row => <div key={row.id}><Trophy size={25} /><strong>{row.rank}°{row.tied ? ' ex aequo' : ''}</strong><span>{pairName(row.playerIds)}</span></div>)}</div>}
      <div className="tournament-table-wrap"><table className="tournament-table"><caption>{timed ? 'Classifica coppie · V–N–P: vinte, pareggiate, perse' : tournamentUsesRotatingPairs(t) ? 'Classifica individuale · punti' : 'Classifica coppie · game'}</caption><thead><tr><th scope="col">{t.format === 'knockout' && t.status !== 'completed' ? 'Coppia' : 'Posizione'}</th>{timed ? <><th scope="col">Punti</th><th scope="col">V–N–P</th><th scope="col">Game fatti/subiti</th></> : <><th scope="col">Giocate</th><th scope="col">Vinte</th><th scope="col">Fatti</th><th scope="col">Subiti</th></>}</tr></thead><tbody>{standings.map(row => <tr key={row.id}><th scope="row">{(t.format !== 'knockout' || t.status === 'completed') && <strong>{row.rank}°{row.tied ? ' =' : ''} </strong>}{pairName(row.playerIds)}</th>{timed ? <><td><strong>{row.tablePoints}</strong></td><td>{row.wins}–{row.draws}–{row.played - row.wins - row.draws}</td><td>{row.pointsFor}/{row.pointsAgainst}</td></> : <><td>{row.played}</td><td>{row.wins}</td><td>{row.pointsFor}</td><td>{row.pointsAgainst}</td></>}</tr>)}</tbody></table></div>
    </section>}
    <p className="tournament-note">{simulation ? 'Simulazione privata: risultati fittizi salvati solo su questo dispositivo. Nessuna pubblicazione, notifica o modifica al database condiviso.' : 'Torneo del gruppo, separato dal Fanta e dalle partite ordinarie. Nessuna prenotazione automatica dei campi.'}</p>
    {preview && <Modal title="Prepara una prova privata" onClose={() => setPreview(false)}><div className="tournament-form"><p>Copio formula, numero massimo di partecipanti, campi e durata. Userai nomi fittizi al posto degli iscritti reali, fino alla capienza prevista. Date, iscrizioni e risultati del torneo originale non cambiano.</p><p>Questa operazione sostituisce soltanto l’eventuale prova salvata su questo dispositivo. La simulazione non sarà visibile agli altri e non si può pubblicare.</p><button className="button button--primary" onClick={() => { try { resetTournamentSimulation(user, t); window.location.assign('#tornei/simulazione') } catch (reason) { setPreview(false); setError(reason instanceof Error ? reason.message : 'Impossibile preparare la prova.') } }}>Prepara simulazione privata</button></div></Modal>}
    {editor && <TournamentEditor tournament={t} user={user} onClose={() => setEditor(false)} onSaved={() => { setEditor(false); setMessage('Torneo modificato. Iscrizioni e risultati conservati.') }} />}
    {guestEditor && <TournamentGuestEditor tournament={t} guestId={guestEditor.id} user={user} members={members} registrationsOpen={open} onClose={() => setGuestEditor(null)} />}
    {matchId && t.matches[matchId] && <TournamentScoreEditor tournament={t} match={t.matches[matchId]} score={scores.find(s => s.matchId === matchId)} members={members} user={user} onClose={() => setMatchId('')} />}
    {confirmation && <Modal title={confirmation === 'publish' ? 'Pubblica il torneo?' : confirmation === 'cancel' ? 'Annulla il torneo?' : confirmation === 'start' ? 'Conferma il sorteggio?' : confirmation === 'end-round' ? 'Concludere il turno in anticipo?' : nextLabel} onClose={() => !busy && setConfirmation(null)}><div className="tournament-form"><p>{confirmation === 'publish' ? 'Gli altri membri potranno aprire il link e iscriversi. Potrai modificare il torneo finché le iscrizioni sono aperte; dal primo iscritto formula e coppie restano protette. Nel girone puoi ancora cambiare la durata delle partite prima del sorteggio. L’amministratore può intervenire anche sui tornei degli altri.' : confirmation === 'cancel' ? 'Le iscrizioni e i risultati resteranno consultabili, ma non si potrà più giocare. Non vengono cancellati dati.' : confirmation === 'start' ? 'Coppie e calendario verranno salvati definitivamente usando gli iscritti attuali. Nessuna iscrizione verrà aggiunta dopo il sorteggio.' : confirmation === 'end-round' ? 'Il timer si fermerà per tutti i campi e non potrà ripartire in questo turno. Assicurati che tutti abbiano finito di giocare. Potrai ancora inserire e correggere i punteggi; il turno successivo non partirà automaticamente.' : 'Conferma solo dopo aver controllato tutti i risultati. I punteggi di questo turno non saranno più modificabili perché determinano classifica e abbinamenti successivi.'}</p>{confirmation === 'start' && timed && validCount && <TournamentPlan input={t} count={registrations.length} />}<button className="button button--primary" disabled={busy} onClick={() => void perform(() => repository.actOnTournament(t.id, confirmation, user), confirmation === 'publish' ? 'Torneo pubblicato. Copia il link e condividilo con il gruppo.' : confirmation === 'end-round' ? 'Turno concluso. Completa e conferma i risultati.' : 'Torneo aggiornato.')}>{busy ? 'Attendi…' : 'Conferma'}</button>{error && <p role="alert" className="form-error">{error}</p>}</div></Modal>}
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
  if (id === 'simulazione') return user.id === SLOT_ADMIN_USER_ID
    ? <PrivateTournamentSimulation key={user.id} user={user} onBack={() => open('')} />
    : <main className="dashboard tournament-page"><h1>Simulazione privata</h1><p>Questa modalità è riservata a Jury.</p><button className="button" onClick={() => open('')}>Torna ai tornei</button></main>
  if (id) return <TournamentDetail key={id} id={id} user={user} members={members} onBack={() => open('')} />
  return <main className="dashboard tournament-page"><button className="button button--ghost" onClick={onBack}><ArrowLeft size={18} /> Torna alla bacheca</button><section className="tournament-hero"><div><h1>I tornei del gruppo</h1><p>Compagni diversi, stessa voglia di giocare.</p></div><Trophy size={42} /></section>
    <div className="tournament-actions"><button className="button button--primary" onClick={() => setCreating(true)}><Plus size={18} /> Crea torneo</button><p>Chi crea il torneo lo gestisce. Le bozze sono visibili solo al creatore e all’amministratore.</p></div>
    {user.id === SLOT_ADMIN_USER_ID && <section className="tournament-panel tournament-simulation-entry"><div><h2>Prova prima di giocare</h2><p>Solo per te: dieci giocatori fittizi, due campi e 90 minuti. Puoi provare tabellone, timer, risultati e podio senza toccare i tornei veri. La prova riprende da dove l’hai lasciata su questo dispositivo.</p></div><button className="button" onClick={() => open('simulazione')}>Simulazione privata</button></section>}
    {error && <p role="alert">{error} <button onClick={() => setAttempt(a => a + 1)}>Riprova</button></p>}
    {!items && !error && <p>Caricamento tornei…</p>}
    {items?.length === 0 && <section className="tournament-panel"><UsersRound /><h2>Il primo torneo aspetta voi</h2><p>Scegli una formula e prepara una bozza, oppure aspetta un torneo pubblicato dal gruppo.</p></section>}
    <div className="tournament-list">{items?.map(t => <button className="tournament-panel" key={t.id} onClick={() => open(t.id)}><span>{tournamentStatus(t, now)}</span><h2>{t.title}</h2><p>{dateLabel(t.startsAt)}</p><p>{VENUES.find(v => v.id === t.venueId)?.name}</p><strong>{TOURNAMENT_FORMATS.find(f => f.id === t.format)?.name} · {Object.keys(t.registrations).length}/{t.capacity} iscritti</strong></button>)}</div>
    {items?.length === 50 && <p>Mostrati i 50 tornei più recenti. I precedenti rimangono accessibili dal loro link.</p>}
    {creating && <TournamentEditor user={user} onClose={() => setCreating(false)} onSaved={nextId => { setCreating(false); open(nextId) }} />}
  </main>
}

function PrivateTournamentSimulation({ user, onBack }: { user: SessionUser; onBack: () => void }) {
  const [state, setState] = useState(() => {
    try { return { session: openTournamentSimulation(user), error: '' } }
    catch (reason) { return { session: null, error: reason instanceof Error ? reason.message : 'Prova non disponibile.' } }
  })
  if (!state.session) return <main className="dashboard tournament-page"><h1>Simulazione privata</h1><p role="alert">{state.error}</p><p>Puoi sostituire soltanto la prova locale e ricominciare. I tornei reali non verranno toccati.</p><button className="button" onClick={() => { try { resetTournamentSimulation(user); setState({ session: openTournamentSimulation(user), error: '' }) } catch { setState({ session: null, error: 'Salvataggio locale non disponibile: abilita lo spazio dati del browser e riprova.' }) } }}>Prepara una nuova prova locale</button><button className="button" onClick={onBack}>Torna ai tornei</button></main>
  return <TournamentRuntimeContext.Provider value={state.session}><TournamentDetail id="simulation-private" user={user} members={[]} onBack={onBack} rehearsal={state.session} /></TournamentRuntimeContext.Provider>
}
