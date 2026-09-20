import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, CalendarDays, Check, Copy, Plus, Trophy, UsersRound } from 'lucide-react'
import type { MemberProfile, SessionUser } from '../types'
import { isSlotAdmin } from '../lib/admin'
import { getTournamentStandings, padelDateTimeToTimestamp, toDateTimeInput, tournamentRegistrationsOpen, tournamentUsesRotatingPairs, validateTournamentInput } from '../lib/domain'
import { repository } from '../lib/repository'
import { TOURNAMENT_FORMATS, type Tournament, type TournamentInput, type TournamentMatch, type TournamentScore } from '../lib/tournamentTypes'
import { VENUES } from '../lib/venues'
import { Modal } from './Modal'
import { ProfileAvatar } from './ProfileAvatar'
import { SlotDateTimeField } from './SlotDateTimeField'
import './tournaments.css'

const dateLabel = (time: number) => new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(time)
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
  return <Modal title={tournament ? 'Modifica bozza' : 'Nuovo torneo'} eyebrow="Solo amministratore" onClose={onClose} size="wide">
    <form className="tournament-form" onSubmit={submit}>
      <label>Nome del torneo<input required minLength={3} maxLength={80} value={input.title} onChange={e => update('title', e.target.value)} placeholder="Il torneo dei fagiani" /></label>
      <SlotDateTimeField value={date} onChange={setDate} />
      <p>Orario italiano. Le iscrizioni chiudono automaticamente un’ora prima.</p>
      <label>Circolo<select value={input.venueId} onChange={e => update('venueId', e.target.value as TournamentInput['venueId'])}>{VENUES.map(v => <option value={v.id} key={v.id}>{v.name}</option>)}</select></label>
      <fieldset className="tournament-formats"><legend>Formula</legend>{TOURNAMENT_FORMATS.map(format => <label key={format.id} className={input.format === format.id ? 'is-selected' : ''}>
        <input type="radio" name="format" value={format.id} checked={input.format === format.id} onChange={() => setInput(current => ({ ...current, format: format.id, pairing: format.id === 'americano' || format.id === 'mexicano' ? 'rotating' : 'random-fixed', capacity: 8 }))} />
        <span><strong>{format.name}</strong><small>{format.description}</small></span>
      </label>)}</fieldset>
      {!rotating && <label>Coppie fisse<select value={input.pairing} onChange={e => update('pairing', e.target.value as TournamentInput['pairing'])}><option value="random-fixed">Sorteggiate dal computer</option><option value="chosen-fixed">Scelte dai giocatori, con conferma reciproca</option></select></label>}
      <div className="tournament-form__grid">
        <label>Massimo giocatori<select value={input.capacity} onChange={e => update('capacity', Number(e.target.value))}>{(input.format === 'knockout' ? [8, 16, 32] : rotating ? [4, 8, 12, 16, 20, 24, 28, 32] : [6, 8, 10, 12, 14, 16, 20, 24, 28, 32]).map(n => <option key={n}>{n}</option>)}</select></label>
        <label>Campi disponibili<input type="number" required min={1} max={8} value={input.courts} onChange={e => update('courts', Number(e.target.value))} /></label>
        {rotating && <><label>Turni<input required type="number" min={1} max={31} value={input.rounds} onChange={e => update('rounds', Number(e.target.value))} /></label><label>Punti totali per incontro<select value={input.pointsPerMatch} onChange={e => update('pointsPerMatch', Number(e.target.value))}>{[16, 24, 32].map(n => <option key={n}>{n}</option>)}</select></label></>}
      </div>
      <p>{rotating ? `Ogni coppia guadagna i punti segnati: per esempio ${input.pointsPerMatch / 2 + 2}–${input.pointsPerMatch / 2 - 2}. Tutti giocano in ogni turno, anche in ondate su meno campi.` : 'Ogni partita è un set a 6 game, tie-break sul 6–6 (si registra 7–6). Il calendario viene calcolato dagli iscritti effettivi.'}</p>
      <label>Chi può inserire i risultati<select value={input.scoreAccess} onChange={e => update('scoreAccess', e.target.value as TournamentInput['scoreAccess'])}><option value="players">Amministratore e giocatori della partita</option><option value="admin">Solo amministratore</option></select></label>
      <p className="tournament-note">Salvi una bozza visibile solo a te. La pubblicherai dopo averla controllata. Il torneo non prenota i campi e non assegna punti Fanta.</p>
      {error && <p role="alert" className="form-error">{error}</p>}
      <button className="button button--primary" disabled={busy}>{busy ? 'Salvataggio…' : 'Salva bozza privata'}</button>
    </form>
  </Modal>
}

function TournamentScoreEditor({ tournament, match, score, members, user, onClose }: { tournament: Tournament; match: TournamentMatch; score?: TournamentScore; members: MemberProfile[]; user: SessionUser; onClose: () => void }) {
  const [a, setA] = useState(score ? String(score.scoreA) : ''), [b, setB] = useState(score ? String(score.scoreB) : '')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [revision] = useState(score?.revision ?? 0)
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
    <p>Turno {match.round} · Campo {match.court} · Ondata {match.wave}</p>
    <label>{pairName(match.teamA.playerIds)}<input type="number" inputMode="numeric" min={0} max={32} required value={a} onChange={e => setA(e.target.value)} /></label>
    <label>{pairName(match.teamB.playerIds)}<input type="number" inputMode="numeric" min={0} max={32} required value={b} onChange={e => setB(e.target.value)} /></label>
    <p>{tournamentUsesRotatingPairs(tournament) ? `La somma deve essere ${tournament.pointsPerMatch}. È ammesso il pareggio.` : 'Un set: da 6–0 a 6–4, oppure 7–5 o 7–6.'} Puoi correggerlo finché l’organizzatore non avanza al turno successivo.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button button--primary" disabled={busy}>{busy ? 'Salvataggio…' : 'Salva risultato'}</button>
  </form></Modal>
}

function TournamentDetail({ id, user, members, onBack }: { id: string; user: SessionUser; members: MemberProfile[]; onBack: () => void }) {
  const [record, setRecord] = useState<{ value: Tournament | null } | null>(null)
  const [scores, setScores] = useState<TournamentScore[]>([])
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0)
  const [editor, setEditor] = useState(false), [matchId, setMatchId] = useState('')
  const [confirmation, setConfirmation] = useState<'publish' | 'start' | 'advance' | 'cancel' | null>(null)
  const [message, setMessage] = useState(''), [now, setNow] = useState(Date.now)
  const admin = isSlotAdmin(user.id)
  useEffect(() => repository.subscribeTournament(id, user.id, value => { setRecord({ value }); setError('') }, err => setError(err.message)), [id, user.id, attempt])
  const canReadScores = record?.value && (record.value.published || admin)
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
  return <main className="dashboard tournament-page">
    <button className="button button--ghost" onClick={onBack}><ArrowLeft size={18} /> Tutti i tornei</button>
    <section className="tournament-hero"><div><span className="tournament-status">{tournamentStatus(t, now)}</span><h1>{t.title}</h1><p><CalendarDays size={18} /> {dateLabel(t.startsAt)}</p><p>{VENUES.find(v => v.id === t.venueId)?.name} · {t.courts} {t.courts === 1 ? 'campo' : 'campi'}</p></div><Trophy size={44} aria-hidden="true" /></section>
    <section className="tournament-panel"><h2>{format.name}</h2><p>{format.description}</p><p>{format.scoring}</p><p>{tournamentUsesRotatingPairs(t) ? `${t.rounds} turni · ${t.pointsPerMatch} punti totali a partita.` : `Coppie ${t.pairing === 'random-fixed' ? 'sorteggiate' : 'scelte dai giocatori'}. Un set a 6, tie-break sul 6–6.`}</p><p>Risultati: {t.scoreAccess === 'admin' ? 'solo amministratore' : 'amministratore e giocatori di ciascuna partita'}. I risultati si possono correggere prima di confermare il turno.</p></section>
    {error && <p className="form-error tournament-panel" role="alert">{error} <button onClick={() => setAttempt(a => a + 1)}>Ricarica dati</button></p>}
    {message && <p className="tournament-message" role="status">{message}</p>}
    {admin && <section className="tournament-panel tournament-actions" aria-label="Gestione torneo">
      {t.status === 'draft' && <><button className="button" disabled={busy} onClick={() => setEditor(true)}>Modifica bozza</button><button className="button button--primary" disabled={busy} onClick={() => setConfirmation('publish')}>Pubblica al gruppo</button></>}
      {t.published && <button className="button" onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#tornei/${encodeURIComponent(t.id)}`).then(() => setMessage('Link copiato. Puoi mandarlo nel gruppo.')).catch(() => setMessage(`Link: ${window.location.origin}/#tornei/${encodeURIComponent(t.id)}`)) }}><Copy size={17} /> Copia link torneo</button>}
      {t.status === 'open' && <button className="button button--primary" disabled={busy || open} onClick={() => setConfirmation('start')}>Sorteggia e prepara tabellone</button>}
      {t.status === 'running' && <button className="button button--primary" disabled={busy} onClick={() => setConfirmation('advance')}>{nextLabel}</button>}
      {t.status !== 'completed' && t.status !== 'cancelled' && <button className="button button--ghost" disabled={busy} onClick={() => setConfirmation('cancel')}>Annulla torneo</button>}
    </section>}
    {t.status !== 'draft' && <section className="tournament-panel"><div className="tournament-section-heading"><h2>Iscritti</h2><strong>{registrations.length}/{t.capacity}</strong></div>
      <p>{t.status === 'cancelled' ? 'Iscrizioni chiuse: torneo annullato.' : `${open ? 'Iscrizioni e scelta del compagno fino a' : 'Iscrizioni chiuse dal'} ${dateLabel(t.startsAt - 3_600_000)}.`}</p>
      {open && <div className="tournament-actions">{own ? <><span className="tournament-message"><Check size={18} /> Sei iscritto</span><button className="button" disabled={busy} onClick={() => void perform(() => repository.leaveTournament(t.id, user), 'Iscrizione ritirata.')}>Ritira iscrizione</button></> : <button className="button button--primary" disabled={busy || registrations.length >= t.capacity} onClick={() => void perform(() => repository.registerForTournament(t.id, null, user), 'Sei iscritto al torneo.')}>{registrations.length >= t.capacity ? 'Torneo completo' : 'Iscriviti al torneo'}</button>}</div>}
      {own && t.pairing === 'chosen-fixed' && open && <label className="tournament-partner">Scegli il tuo compagno<select disabled={busy} value={own.partnerId && t.registrations[own.partnerId] ? own.partnerId : ''} onChange={e => void perform(() => repository.registerForTournament(t.id, e.target.value || null, user), 'Scelta del compagno aggiornata. La coppia è confermata quando la scelta è reciproca.')}><option value="">Da scegliere</option>{registrations.filter(r => r.userId !== user.id).map(r => <option key={r.userId} value={r.userId}>{name(r.userId)}</option>)}</select><small>Anche il compagno deve selezionare te. Non viene iscritto nessuno al posto tuo.</small></label>}
      <ul className="tournament-registrations">{registrations.map(r => <li key={r.userId}><ProfileAvatar displayName={name(r.userId)} avatarDataUrl={members.find(m => m.id === r.userId)?.avatarDataUrl} decorative /><span><strong>{name(r.userId)}{r.userId === user.id ? ' (tu)' : ''}</strong>{t.pairing === 'chosen-fixed' && <small>{r.partnerId && t.registrations[r.partnerId]?.partnerId === r.userId ? `Coppia confermata con ${name(r.partnerId)}` : r.partnerId && t.registrations[r.partnerId] ? `In attesa di ${name(r.partnerId)}` : 'Compagno da confermare'}</small>}</span></li>)}</ul>
      {registrations.length === 0 && <p>Ancora nessun iscritto.</p>}
      {t.status === 'open' && !open && <p>L’organizzatore prepara il tabellone con gli iscritti effettivi. Se il numero non è compatibile con la formula, il torneo non parte.</p>}
    </section>}
    {matches.length > 0 && <section className="tournament-panel"><h2>{t.status === 'completed' ? 'Risultati del torneo' : `Partite · turno ${t.currentRound} di ${t.totalRounds}`}</h2><p>Le ondate si giocano in sequenza; i campi della stessa ondata possono giocare contemporaneamente.</p>
      {Array.from(new Set(matches.map(m => m.round))).map(round => <details className="tournament-round" key={round} open={round === t.currentRound}><summary>Turno {round}{t.status === 'completed' || round < t.currentRound ? ' · confermato' : round > t.currentRound ? ' · in programma' : ' · corrente'}</summary>
        <div className="tournament-matches">{matches.filter(m => m.round === round).map(match => {
          const score = scores.find(s => s.matchId === match.id)
          const allowed = t.status === 'running' && round === t.currentRound && now >= t.startsAt && (admin || (t.scoreAccess === 'players' && [...match.teamA.playerIds, ...match.teamB.playerIds].includes(user.id)))
          return <article key={match.id} className="tournament-match"><header>{match.stage === 'final' ? 'Finale · ' : match.stage === 'bronze' ? 'Finale 3° posto · ' : ''}Campo {match.court} · Ondata {match.wave}</header><div><span>{pairName(match.teamA.playerIds)}</span><strong>{score?.scoreA ?? '–'}</strong></div><div><span>{pairName(match.teamB.playerIds)}</span><strong>{score?.scoreB ?? '–'}</strong></div>{allowed && <button className="button" disabled={busy} onClick={() => setMatchId(match.id)}>{score ? 'Modifica risultato' : 'Inserisci risultato'}<span className="sr-only">: {pairName(match.teamA.playerIds)} contro {pairName(match.teamB.playerIds)}</span></button>}{!score && !allowed && <small>{now < t.startsAt ? 'Risultati disponibili dall’inizio' : 'In attesa del risultato'}</small>}</article>
        })}</div>
      </details>)}
    </section>}
    {t.currentRound > 0 && <section className="tournament-panel"><h2>{t.status === 'completed' ? 'Il podio e la classifica finale' : t.format === 'knockout' ? 'Statistiche del tabellone' : 'Classifica provvisoria'}</h2>{t.status === 'completed' && <div className="tournament-podium">{standings.filter(row => row.rank <= 3).map(row => <div key={row.id}><Trophy size={25} /><strong>{row.rank}°{row.tied ? ' ex aequo' : ''}</strong><span>{pairName(row.playerIds)}</span></div>)}</div>}
      <div className="tournament-table-wrap"><table className="tournament-table"><caption>{tournamentUsesRotatingPairs(t) ? 'Classifica individuale · punti' : 'Classifica coppie · game'}</caption><thead><tr><th scope="col">{t.format === 'knockout' && t.status !== 'completed' ? 'Coppia' : 'Posizione'}</th><th scope="col">Giocate</th><th scope="col">Vinte</th><th scope="col">Fatti</th><th scope="col">Subiti</th></tr></thead><tbody>{standings.map(row => <tr key={row.id}><th scope="row">{(t.format !== 'knockout' || t.status === 'completed') && <strong>{row.rank}°{row.tied ? ' =' : ''} </strong>}{pairName(row.playerIds)}</th><td>{row.played}</td><td>{row.wins}</td><td>{row.pointsFor}</td><td>{row.pointsAgainst}</td></tr>)}</tbody></table></div>
    </section>}
    <p className="tournament-note">Torneo del gruppo, separato dal Fanta e dalle partite ordinarie. Nessuna prenotazione automatica dei campi.</p>
    {editor && <TournamentEditor tournament={t} user={user} onClose={() => setEditor(false)} onSaved={() => setEditor(false)} />}
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
    {isSlotAdmin(user.id) && <div className="tournament-actions"><button className="button button--primary" onClick={() => setCreating(true)}><Plus size={18} /> Crea torneo</button><p>Solo tu puoi creare tornei. Le bozze sono private.</p></div>}
    {error && <p role="alert">{error} <button onClick={() => setAttempt(a => a + 1)}>Riprova</button></p>}
    {!items && !error && <p>Caricamento tornei…</p>}
    {items?.length === 0 && <section className="tournament-panel"><UsersRound /><h2>Il primo torneo aspetta voi</h2><p>{isSlotAdmin(user.id) ? 'Scegli una formula e prepara una bozza.' : 'Qui compariranno i tornei pubblicati dall’organizzatore.'}</p></section>}
    <div className="tournament-list">{items?.map(t => <button className="tournament-panel" key={t.id} onClick={() => open(t.id)}><span>{tournamentStatus(t, now)}</span><h2>{t.title}</h2><p>{dateLabel(t.startsAt)}</p><p>{VENUES.find(v => v.id === t.venueId)?.name}</p><strong>{TOURNAMENT_FORMATS.find(f => f.id === t.format)?.name} · {Object.keys(t.registrations).length}/{t.capacity} iscritti</strong></button>)}</div>
    {items?.length === 50 && <p>Mostrati i 50 tornei più recenti. I precedenti rimangono accessibili dal loro link.</p>}
    {creating && <TournamentEditor user={user} onClose={() => setCreating(false)} onSaved={nextId => { setCreating(false); open(nextId) }} />}
  </main>
}
