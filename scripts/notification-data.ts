import type {
  FantasyEntry, FantasyRound, MatchFeedbackResponse, MatchFeedbackSummary, MatchReport, PadelPoll,
} from '../src/types'
import { planNotificationMatchReads, type NotificationMatchKey } from '../src/lib/notificationSchedule'

export interface NotificationDataReader {
  list<T>(path: string, filter?: { field: string; values: string[] }): Promise<T[]>
}

const matchKey = ({ pollId, slotId }: NotificationMatchKey) => JSON.stringify([pollId, slotId])

/** One indexed field, max 30 disjunctions: no composite index or data migration required. */
async function readMatches<T extends NotificationMatchKey>(
  reader: NotificationDataReader, path: string, matches: NotificationMatchKey[],
): Promise<T[]> {
  const keys = new Set(matches.map(matchKey))
  const slotIds = [...new Set(matches.map((match) => match.slotId))]
  const result: T[] = []
  for (let offset = 0; offset < slotIds.length; offset += 30) {
    const documents = await reader.list<T>(path, { field: 'slotId', values: slotIds.slice(offset, offset + 30) })
    result.push(...documents.filter((document) => keys.has(matchKey(document))))
  }
  return result
}

export async function loadNotificationMatchData(
  reader: NotificationDataReader, polls: PadelPoll[], rounds: FantasyRound[], now: number,
) {
  const initialPlan = planNotificationMatchReads(polls, rounds, [], now)
  // Even very old void rounds remain recoverable when their missing report arrives.
  const matchReports = await readMatches<MatchReport>(reader, 'matchReports', initialPlan.reportMatches)
  const plan = planNotificationMatchReads(polls, rounds, matchReports, now)
  const current = await readMatches<MatchFeedbackResponse>(reader, 'matchFeedbackResponses', plan.feedbackMatches)
  type LegacyMvp = Omit<MatchFeedbackResponse, 'reviewerId'> & { voterId: string }
  const legacyMvp = await readMatches<LegacyMvp>(reader, 'matchMvpResponses', plan.feedbackMatches)
  const legacyRatings = await readMatches<MatchFeedbackResponse>(reader, 'matchRatingResponses', plan.feedbackMatches)
  const currentIds = new Set(current.map((response) => response.id))
  const feedbackResponses = [
    ...[...legacyMvp.map(({ voterId, ...response }) => ({ ...response, reviewerId: voterId })), ...legacyRatings]
      .filter((response) => !currentIds.has(response.id)),
    ...current,
  ]
  const feedbackSummaries = await readMatches<MatchFeedbackSummary>(reader, 'matchFeedbackSummaries', plan.summaryMatches)
  const fantasyEntries: FantasyEntry[] = []
  for (const roundId of plan.entryRoundIds) {
    fantasyEntries.push(...await reader.list<FantasyEntry>(`fantasyRounds/${roundId}/entries`))
  }
  return { feedbackResponses, feedbackSummaries, matchReports, fantasyEntries }
}
