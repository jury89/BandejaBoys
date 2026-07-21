import type { MatchRatingPrompt, MemberProfile, SessionUser } from '../types'

export const RATING_TEST_QUERY_PARAM = 'ratingTest'

export function isRatingTestRequested(search: string): boolean {
  return new URLSearchParams(search).get(RATING_TEST_QUERY_PARAM) === '1'
}

export function makeRatingTestPrompt(
  reviewer: SessionUser,
  members: MemberProfile[],
  now = Date.now(),
): MatchRatingPrompt {
  const seenMemberIds = new Set<string>()
  const uniqueMembers = members.filter((member) => {
    if (member.id === reviewer.id || seenMemberIds.has(member.id)) return false
    seenMemberIds.add(member.id)
    return true
  }).slice(0, 3)
  const teammates = uniqueMembers.map((member) => ({
    userId: member.id,
    displayName: member.displayName,
  }))

  while (teammates.length < 3) {
    const number = teammates.length + 1
    teammates.push({
      userId: `rating-test-player-${number}`,
      displayName: `Compagno test ${number}`,
    })
  }

  return {
    id: `rating-test__${reviewer.id}`,
    pollId: 'rating-test',
    pollTitle: 'Collaudo pagelle',
    slotId: 'rating-test',
    sessionStartsAt: new Date(now).toISOString(),
    sessionEndedAt: now,
    dueAt: now,
    reviewerId: reviewer.id,
    teammates,
  }
}
