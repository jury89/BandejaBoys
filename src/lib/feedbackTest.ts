import type { MatchFeedbackPrompt, MemberProfile, SessionUser } from '../types'

export const FEEDBACK_TEST_QUERY_PARAM = 'feedbackTest'

export function isFeedbackTestRequested(search: string): boolean {
  const parameters = new URLSearchParams(search)
  return parameters.get(FEEDBACK_TEST_QUERY_PARAM) === '1'
    || parameters.get('mvpTest') === '1'
    || parameters.get('ratingTest') === '1'
}

export function makeFeedbackTestPrompt(
  reviewer: SessionUser,
  members: MemberProfile[],
  now = Date.now(),
): MatchFeedbackPrompt {
  const seenMemberIds = new Set<string>()
  const uniqueMembers = members.filter((member) => {
    if (member.id === reviewer.id || seenMemberIds.has(member.id)) return false
    seenMemberIds.add(member.id)
    return true
  }).slice(0, 3)
  const candidates = uniqueMembers.map((member) => ({
    userId: member.id,
    displayName: member.displayName,
  }))

  while (candidates.length < 3) {
    const number = candidates.length + 1
    candidates.push({
      userId: `feedback-test-player-${number}`,
      displayName: `Compagno test ${number}`,
    })
  }

  return {
    id: `feedback-test__${reviewer.id}`,
    pollId: 'feedback-test',
    pollTitle: 'Collaudo giudizi',
    slotId: 'feedback-test',
    sessionStartsAt: new Date(now).toISOString(),
    sessionEndedAt: now,
    dueAt: now,
    reviewerId: reviewer.id,
    candidates,
  }
}
