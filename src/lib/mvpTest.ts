import type { MatchMvpPrompt, MemberProfile, SessionUser } from '../types'

export const MVP_TEST_QUERY_PARAM = 'mvpTest'

export function isMvpTestRequested(search: string): boolean {
  const parameters = new URLSearchParams(search)
  return parameters.get(MVP_TEST_QUERY_PARAM) === '1' || parameters.get('ratingTest') === '1'
}

export function makeMvpTestPrompt(
  voter: SessionUser,
  members: MemberProfile[],
  now = Date.now(),
): MatchMvpPrompt {
  const seenMemberIds = new Set<string>()
  const uniqueMembers = members.filter((member) => {
    if (member.id === voter.id || seenMemberIds.has(member.id)) return false
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
      userId: `mvp-test-player-${number}`,
      displayName: `Compagno test ${number}`,
    })
  }

  return {
    id: `mvp-test__${voter.id}`,
    pollId: 'mvp-test',
    pollTitle: 'Collaudo MVP',
    slotId: 'mvp-test',
    sessionStartsAt: new Date(now).toISOString(),
    sessionEndedAt: now,
    dueAt: now,
    voterId: voter.id,
    candidates,
  }
}
