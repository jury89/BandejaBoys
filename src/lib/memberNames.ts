import type { MemberProfile } from '../types'

export function resolveMemberName(
  members: MemberProfile[],
  userId: string | undefined,
  savedName: string | undefined,
): string {
  const currentName = userId
    ? members.find((member) => member.id === userId)?.displayName.trim()
    : ''

  return currentName || savedName?.trim() || 'Giocatore'
}
