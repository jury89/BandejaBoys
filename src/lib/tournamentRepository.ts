import { collection, doc, limit, onSnapshot, or, orderBy, query, runTransaction, where, type Firestore, type Unsubscribe } from 'firebase/firestore'
import type { SessionUser } from '../types'
import { isSlotAdmin } from './admin'
import { advanceTournament, cancelTournament, canManageTournament, editTournament, editTournamentOrganization, endTournamentRound, leaveTournament, makeTournament, makeTournamentScore, publishTournament, registerForTournament, removeTournamentGuest, saveTournamentGuest, startTournament, startTournamentRound } from './domain'
import type { Tournament, TournamentInput, TournamentOrganization, TournamentScore } from './tournamentTypes'

type Action = 'publish' | 'cancel' | 'start' | 'start-round' | 'end-round' | 'advance'
export interface TournamentRepository {
  subscribeTournaments(userId: string, listener: (items: Tournament[]) => void, onError: (error: Error) => void): Unsubscribe
  subscribeTournament(id: string, userId: string, listener: (item: Tournament | null) => void, onError: (error: Error) => void): Unsubscribe
  subscribeTournamentScores(id: string, listener: (scores: TournamentScore[]) => void, onError: (error: Error) => void): Unsubscribe
  createTournament(input: TournamentInput, actor: SessionUser): Promise<string>
  editTournament(id: string, input: TournamentInput, actor: SessionUser): Promise<void>
  editTournamentOrganization(id: string, input: TournamentOrganization, actor: SessionUser): Promise<void>
  actOnTournament(id: string, action: Action, actor: SessionUser): Promise<void>
  registerForTournament(id: string, partnerId: string | null, actor: SessionUser): Promise<void>
  leaveTournament(id: string, actor: SessionUser): Promise<void>
  saveTournamentGuest(id: string, guestId: string | null, displayName: string, partnerId: string | null, actor: SessionUser): Promise<void>
  removeTournamentGuest(id: string, guestId: string, actor: SessionUser): Promise<void>
  saveTournamentScore(id: string, matchId: string, a: number, b: number, revision: number, actor: SessionUser): Promise<void>
}

function applyAction(tournament: Tournament, action: Action, actorId: string, seed: number, scores: TournamentScore[], now: number): Tournament {
  if (action === 'publish') return publishTournament(tournament, actorId, now)
  if (action === 'cancel') return cancelTournament(tournament, actorId, now)
  if (action === 'start') return startTournament(tournament, actorId, seed, now)
  if (action === 'start-round') return startTournamentRound(tournament, actorId, now)
  if (action === 'end-round') return endTournamentRound(tournament, actorId, now)
  return advanceTournament(tournament, scores, actorId, now)
}

export function remoteTournamentRepository(db: Firestore): TournamentRepository {
  const tournaments = collection(db, 'tournaments')
  const mutate = async (id: string, fn: (tournament: Tournament) => Tournament) => {
    await runTransaction(db, async (tx) => {
      const ref = doc(tournaments, id), snapshot = await tx.get(ref)
      if (!snapshot.exists()) throw new Error('Torneo non trovato.')
      tx.set(ref, fn({ ...snapshot.data(), id } as Tournament))
    })
  }
  return {
    subscribeTournaments(userId, listener, onError) {
      const source = isSlotAdmin(userId)
        ? query(tournaments, orderBy('startsAt', 'desc'), limit(50))
        : query(tournaments, or(where('published', '==', true), where('createdBy', '==', userId)), orderBy('startsAt', 'desc'), limit(50))
      return onSnapshot(source, snapshot => listener(snapshot.docs.map(item => ({ ...item.data(), id: item.id } as Tournament))), onError)
    },
    subscribeTournament(id, _userId, listener, onError) {
      return onSnapshot(doc(tournaments, id), snapshot => listener(snapshot.exists() ? { ...snapshot.data(), id } as Tournament : null), onError)
    },
    subscribeTournamentScores(id, listener, onError) {
      return onSnapshot(collection(db, 'tournaments', id, 'scores'), snapshot => listener(snapshot.docs.map(item => item.data() as TournamentScore)), onError)
    },
    async createTournament(input, actor) {
      const ref = doc(tournaments)
      const tournament = makeTournament(ref.id, input, actor.id)
      await runTransaction(db, async tx => {
        if ((await tx.get(ref)).exists()) throw new Error('Torneo già esistente.')
        tx.set(ref, tournament)
      })
      return ref.id
    },
    editTournament: (id, input, actor) => mutate(id, t => editTournament(t, input, actor.id)),
    editTournamentOrganization: (id, input, actor) => mutate(id, t => editTournamentOrganization(t, input, actor.id)),
    registerForTournament: (id, partnerId, actor) => mutate(id, t => registerForTournament(t, actor, partnerId)),
    leaveTournament: (id, actor) => mutate(id, t => leaveTournament(t, actor.id)),
    saveTournamentGuest: (id, guestId, name, partnerId, actor) => {
      const uid = guestId ?? `guest:${crypto.randomUUID()}`
      return mutate(id, t => saveTournamentGuest(t, uid, name, partnerId, actor.id))
    },
    removeTournamentGuest: (id, guestId, actor) => mutate(id, t => removeTournamentGuest(t, guestId, actor.id)),
    async actOnTournament(id, action, actor) {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]
      await runTransaction(db, async tx => {
        const ref = doc(tournaments, id), snapshot = await tx.get(ref)
        if (!snapshot.exists()) throw new Error('Torneo non trovato.')
        const tournament = { ...snapshot.data(), id } as Tournament
        // Read each known score inside the same transaction: concurrent edits retry, never create a stale next round.
        const scoreSnapshots = action === 'advance'
          ? await Promise.all(Object.keys(tournament.matches).map(matchId => tx.get(doc(db, 'tournaments', id, 'scores', matchId)))) : []
        const scores = scoreSnapshots.filter(s => s.exists()).map(s => s.data() as TournamentScore)
        tx.set(ref, applyAction(tournament, action, actor.id, seed, scores, Date.now()))
      })
    },
    async saveTournamentScore(id, matchId, a, b, revision, actor) {
      await runTransaction(db, async tx => {
        const parent = doc(tournaments, id), ref = doc(db, 'tournaments', id, 'scores', matchId)
        const [snapshot, previous] = await Promise.all([tx.get(parent), tx.get(ref)])
        if (!snapshot.exists()) throw new Error('Torneo non trovato.')
        const score = makeTournamentScore({ ...snapshot.data(), id } as Tournament, matchId, a, b, actor.id, previous.exists() ? previous.data() as TournamentScore : undefined, revision)
        tx.set(ref, score)
      })
    },
  }
}

export interface LocalTournamentStore { tournaments: Tournament[]; scores: Record<string, TournamentScore[]> }
export function localTournamentRepository(options: { storageKey?: string; now?: () => number } = {}): TournamentRepository {
  const STORE = options.storageKey ?? 'bandeja-tournaments-v1'
  const EVENT = options.storageKey ? `${STORE}:updated` : 'bandeja-tournaments-updated'
  const now = options.now ?? (() => Date.now())
  function localRead(): LocalTournamentStore {
    try { return JSON.parse(localStorage.getItem(STORE) ?? '{"tournaments":[],"scores":{}}') as LocalTournamentStore }
    catch { return { tournaments: [], scores: {} } }
  }
  function localWrite(store: LocalTournamentStore) {
    localStorage.setItem(STORE, JSON.stringify(store))
    window.dispatchEvent(new Event(EVENT))
  }
  function localSubscribe(notify: () => void): Unsubscribe {
    window.addEventListener(EVENT, notify); window.addEventListener('storage', notify); notify()
    return () => { window.removeEventListener(EVENT, notify); window.removeEventListener('storage', notify) }
  }
  const mutate = async (id: string, fn: (t: Tournament, store: LocalTournamentStore) => Tournament) => {
    const store = localRead(), index = store.tournaments.findIndex(t => t.id === id)
    if (index < 0) throw new Error('Torneo non trovato.')
    store.tournaments[index] = fn(store.tournaments[index], store); localWrite(store)
  }
  return {
    subscribeTournaments(userId, listener) {
      return localSubscribe(() => listener(localRead().tournaments.filter(t => canManageTournament(t, userId) || t.published).sort((a, b) => b.startsAt - a.startsAt).slice(0, 50)))
    },
    subscribeTournament(id, userId, listener, onError) {
      return localSubscribe(() => {
        const t = localRead().tournaments.find(item => item.id === id)
        if (t && !t.published && !canManageTournament(t, userId)) { onError(new Error('Questa bozza è privata.')); return }
        listener(t ?? null)
      })
    },
    subscribeTournamentScores(id, listener) { return localSubscribe(() => listener(localRead().scores[id] ?? [])) },
    async createTournament(input, actor) {
      const tournament = makeTournament(crypto.randomUUID(), input, actor.id, now()), store = localRead()
      store.tournaments.push(tournament); localWrite(store); return tournament.id
    },
    editTournament: (id, input, actor) => mutate(id, t => editTournament(t, input, actor.id, now())),
    editTournamentOrganization: (id, input, actor) => mutate(id, t => editTournamentOrganization(t, input, actor.id, now())),
    registerForTournament: (id, partnerId, actor) => mutate(id, t => registerForTournament(t, actor, partnerId, now())),
    leaveTournament: (id, actor) => mutate(id, t => leaveTournament(t, actor.id, now())),
    saveTournamentGuest: (id, guestId, name, partnerId, actor) => mutate(id, t => saveTournamentGuest(t, guestId ?? `guest:${crypto.randomUUID()}`, name, partnerId, actor.id, now())),
    removeTournamentGuest: (id, guestId, actor) => mutate(id, t => removeTournamentGuest(t, guestId, actor.id, now())),
    actOnTournament: (id, action, actor) => mutate(id, (t, store) => applyAction(t, action, actor.id, crypto.getRandomValues(new Uint32Array(1))[0], store.scores[id] ?? [], now())),
    async saveTournamentScore(id, matchId, a, b, revision, actor) {
      const store = localRead(), tournament = store.tournaments.find(t => t.id === id)
      if (!tournament) throw new Error('Torneo non trovato.')
      const scores = store.scores[id] ?? [], existing = scores.find(s => s.matchId === matchId)
      const score = makeTournamentScore(tournament, matchId, a, b, actor.id, existing, revision, now())
      store.scores[id] = [...scores.filter(s => s.matchId !== matchId), score]; localWrite(store)
    },
  }
}
