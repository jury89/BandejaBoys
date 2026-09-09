import { describe, expect, it } from 'vitest'
import type { FantasyEntry, FantasyRound, MatchFeedbackResponse, MatchFeedbackSummary, MatchReport, PadelPoll } from '../src/types'
import {
  FANTASY_MISSING_REPORT_VOID_REASON, getMatchFeedbackDueAt, makeFantasyRound, reconcileFantasyRounds,
} from '../src/lib/domain'
import { collectFantasyNotifications, collectScheduledNotifications, FANTASY_RESULT_NOTIFICATION_WINDOW_MS } from '../src/lib/notificationSchedule'
import { loadNotificationMatchData, type NotificationDataReader } from './notification-data'

const DAY = 86_400_000
const poll: PadelPoll = {
  id: 'poll', title: 'Padel', targetWeekStart: '2026-09-07', status: 'open',
  createdBy: 'a', createdByName: 'A', createdAt: 1, updatedAt: 1,
  slots: [{
    id: 'slot', startsAt: '2026-09-09T16:00:00.000Z', durationMinutes: 90,
    bookedAt: 1, bookedBy: 'a', bookedByName: 'A', venue: 'Oasi',
    signups: ['a', 'b', 'c', 'd'].map((userId, index) => ({
      id: userId, userId, displayName: userId.toUpperCase(), joinedAt: index + 1, role: 'starter',
    })),
  }],
}
const round = makeFantasyRound(poll, poll.slots[0], 1)!
const now = getMatchFeedbackDueAt(poll.slots[0]) + 60_000
const report: MatchReport = {
  id: round.id, pollId: poll.id, slotId: 'slot', pollTitle: 'Padel',
  sessionStartsAt: round.slotStartsAt, participantIds: round.participantIds, participants: round.participants,
  sets: [{ id: 'set', teamA: [round.participants[0], round.participants[1]],
    teamB: [round.participants[2], round.participants[3]], scoreA: 6, scoreB: 4 }],
  createdBy: 'a', createdByName: 'A', createdAt: round.slotEndsAt,
  updatedBy: 'a', updatedByName: 'A', updatedAt: round.slotEndsAt,
}
const entry: FantasyEntry = {
  id: 'manager', roundId: round.id, pollId: poll.id, slotId: 'slot',
  managerId: 'manager', managerName: 'Manager', playerIds: ['a', 'b'], captainId: 'a',
  rosterKey: round.rosterKey, locksAt: round.locksAt, createdAt: 1, updatedAt: 1,
}
const responses: MatchFeedbackResponse[] = round.participantIds.map((reviewerId) => ({
  id: `poll__slot__${reviewerId}`, pollId: poll.id, slotId: 'slot', reviewerId,
  status: 'submitted', closedAt: round.slotEndsAt + 60_000,
}))
const summaries: MatchFeedbackSummary[] = round.participantIds.map((playerId) => ({
  id: `poll__slot__${playerId}`, pollId: poll.id, slotId: 'slot', playerId,
  scoreUnitsTotal: 24, ratingCount: 3, lastResponseId: responses[0].id, updatedAt: now,
}))

function fakeReader(data: Record<string, unknown[]> = {}) {
  const calls: { path: string; filter?: { field: string; values: string[] } }[] = []
  let documentReads = 0
  const reader: NotificationDataReader = {
    async list<T>(path: string, filter?: { field: string; values: string[] }): Promise<T[]> {
      calls.push({ path, filter })
      const rows = (data[path] ?? []).filter((row) => !filter
        || filter.values.includes((row as Record<string, string>)[filter.field]))
      documentReads += Math.max(1, rows.length)
      return rows as T[]
    },
  }
  return { reader, calls, reads: () => documentReads }
}

describe('letture mirate del notifier', () => {
  it('non rilegge dettagli e formazioni dei round già calcolati, anche con uno storico grande', async () => {
    const history = Array.from({ length: 200 }, (_, i) => ({
      ...round, id: `history-${i}`, status: 'scored' as const, settledAt: now - 10 * DAY,
    }))
    const fake = fakeReader()
    const loaded = await loadNotificationMatchData(fake.reader, [], history, now)
    expect(fake.calls).toEqual([])
    expect(loaded.fantasyEntries).toEqual([])
    expect(collectFantasyNotifications(history, [], now)).toEqual([])
  })

  it('legge solo le formazioni per un round futuro e non interroga pagelle o referti', async () => {
    const fake = fakeReader({ [`fantasyRounds/${round.id}/entries`]: [entry] })
    const loaded = await loadNotificationMatchData(fake.reader, [poll], [round], round.locksAt - 1)
    expect(fake.calls).toEqual([{ path: `fantasyRounds/${round.id}/entries`, filter: undefined }])
    expect(loaded.fantasyEntries).toEqual([entry])
  })

  it('filtra le schede chiuse del solo match in notifica e mantiene la precedenza dei giudizi correnti', async () => {
    const legacyMvp = responses.map(({ reviewerId, ...response }) => ({ ...response, voterId: reviewerId }))
    const fake = fakeReader({
      matchFeedbackResponses: [responses[0], { ...responses[1], id: 'other-poll', pollId: 'other' }],
      matchMvpResponses: [legacyMvp[0], legacyMvp[1]],
      matchRatingResponses: [responses[2]],
    })
    const loaded = await loadNotificationMatchData(fake.reader, [poll], [], now)
    expect(loaded.feedbackResponses.map((r) => r.id).sort()).toEqual(responses.slice(0, 3).map((r) => r.id).sort())
    expect(loaded.feedbackResponses.find((r) => r.id === responses[0].id)).toEqual(responses[0])
    expect(collectScheduledNotifications([poll], now, loaded.feedbackResponses)
      .find((n) => n.kind === 'match-feedback')?.recipientUserIds).toEqual(['d'])
    expect(fake.calls.every(({ filter }) => filter?.field === 'slotId' && filter.values.join() === 'slot')).toBe(true)
  })

  it('non interroga schede prima della finestra o dopo la scadenza di invio', async () => {
    for (const at of [now - 120_000, now + 30 * 60_000]) {
      const fake = fakeReader()
      await loadNotificationMatchData(fake.reader, [poll], [], at)
      expect(fake.calls).toEqual([])
    }
  })

  it('non cambia punteggi, classifiche e notifiche rispetto alla lettura completa', async () => {
    const fake = fakeReader({ matchReports: [report], matchFeedbackResponses: responses,
      matchFeedbackSummaries: summaries, [`fantasyRounds/${round.id}/entries`]: [entry] })
    const loaded = await loadNotificationMatchData(fake.reader, [poll], [round], now)
    const optimized = reconcileFantasyRounds([poll], [round], loaded.fantasyEntries,
      loaded.feedbackSummaries, loaded.feedbackResponses, loaded.matchReports, now)
    const full = reconcileFantasyRounds([poll], [round], [entry], summaries, responses, [report], now)
    expect(optimized).toEqual(full)
    expect(optimized[0].status).toBe('scored')
    expect(collectFantasyNotifications(optimized, loaded.fantasyEntries, now))
      .toEqual(collectFantasyNotifications(full, [entry], now))
  })

  it('recupera un referto tardivo anche dopo mesi, senza ricaricare le vecchie risposte', async () => {
    const at = now + 90 * DAY
    const voidRound: FantasyRound = { ...round, status: 'void', settledAt: now,
      voidReason: FANTASY_MISSING_REPORT_VOID_REASON }
    const fake = fakeReader({ matchReports: [report], matchFeedbackSummaries: summaries,
      [`fantasyRounds/${round.id}/entries`]: [entry] })
    const loaded = await loadNotificationMatchData(fake.reader, [], [voidRound], at)
    const reconciled = reconcileFantasyRounds([], [voidRound], loaded.fantasyEntries,
      loaded.feedbackSummaries, loaded.feedbackResponses, loaded.matchReports, at)
    expect(reconciled[0].status).toBe('scored')
    expect(reconciled[0].settledAt).toBe(at)
    expect(reconciled).toEqual(reconcileFantasyRounds([], [voidRound], [entry], summaries, responses, [report], at))
    expect(collectFantasyNotifications(reconciled, loaded.fantasyEntries, at)).toHaveLength(1)
    expect(fake.calls.some(({ path }) => /Responses$/.test(path))).toBe(false)
  })

  it('se il vecchio referto manca ancora controlla solo quel referto, non formazioni e giudizi', async () => {
    const fake = fakeReader()
    await loadNotificationMatchData(fake.reader, [], [{ ...round, status: 'void', settledAt: now - 10 * DAY,
      voidReason: FANTASY_MISSING_REPORT_VOID_REASON }], now)
    expect(fake.calls).toEqual([{ path: 'matchReports', filter: { field: 'slotId', values: ['slot'] } }])
  })

  it('mantiene la notifica di annullamento recente e ignora quella scaduta', async () => {
    const fake = fakeReader({ [`fantasyRounds/${round.id}/entries`]: [entry] })
    const recent: FantasyRound = { ...round, status: 'void', settledAt: now - 1, voidReason: 'Rosa cambiata' }
    const loaded = await loadNotificationMatchData(fake.reader, [], [recent], now)
    expect(collectFantasyNotifications([recent], loaded.fantasyEntries, now)).toHaveLength(1)
    const expired = { ...recent, settledAt: now - FANTASY_RESULT_NOTIFICATION_WINDOW_MS }
    expect(collectFantasyNotifications([expired], [entry], now)).toEqual([])
    expect(collectFantasyNotifications([{ ...recent, settledAt: now + 1 }], [entry], now)).toEqual([])
  })

  it('continua ad aggiornare il conteggio dei giudizi in attesa del referto', async () => {
    const fake = fakeReader({ matchFeedbackResponses: responses.slice(0, 2) })
    const loaded = await loadNotificationMatchData(fake.reader, [poll], [round], now)
    expect(loaded.feedbackSummaries).toEqual([])
    const [updated] = reconcileFantasyRounds([poll], [round], loaded.fantasyEntries,
      loaded.feedbackSummaries, loaded.feedbackResponses, loaded.matchReports, now)
    expect(updated.feedbackResponseCount).toBe(2)
    expect(updated.status).toBe('open')
  })

  it('spezza le query in gruppi di 30 e deduplica gli ID condivisi', async () => {
    const fake = fakeReader()
    const polls = Array.from({ length: 31 }, (_, i) => ({ ...poll, id: `poll-${i}`,
      slots: [{ ...poll.slots[0], id: `slot-${i}` }] }))
    await loadNotificationMatchData(fake.reader, [...polls, polls[0]], [], now)
    expect(fake.calls).toHaveLength(6)
    expect(fake.calls.map((call) => call.filter?.values.length)).toEqual([30, 1, 30, 1, 30, 1])
  })

  it('limita le letture ai dati recenti anche con migliaia di vecchi giudizi', async () => {
    const history = Array.from({ length: 1000 }, (_, i) => ({ ...responses[0], id: `old-${i}`, slotId: `old-${i}` }))
    const fake = fakeReader({ matchFeedbackResponses: [...history, ...responses] })
    await loadNotificationMatchData(fake.reader, [poll], [], now)
    expect(fake.reads()).toBe(6) // 4 risposte + minimo di una lettura per le 2 query legacy vuote.
  })
})
