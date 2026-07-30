import type {
  MatchPairing,
  MatchReportPlayer,
  MemberProfile,
  PlayerMatch,
} from '../types'

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

function resolveMatchPlayer(
  members: MemberProfile[],
  player: MatchReportPlayer,
): MatchReportPlayer {
  return {
    ...player,
    displayName: resolveMemberName(members, player.userId, player.displayName),
  }
}

function resolveMatchTeam(
  members: MemberProfile[],
  team: MatchPairing['teamA'],
): MatchPairing['teamA'] {
  return team.map((player) => resolveMatchPlayer(members, player)) as MatchPairing['teamA']
}

export function resolvePlayerMatchNames(
  members: MemberProfile[],
  match: PlayerMatch,
): PlayerMatch {
  return {
    ...match,
    slot: {
      ...match.slot,
      signups: match.slot.signups.map((signup) => ({
        ...signup,
        displayName: resolveMemberName(members, signup.userId, signup.displayName),
      })),
    },
    ...(match.report ? {
      report: {
        ...match.report,
        participants: match.report.participants
          .map((player) => resolveMatchPlayer(members, player)),
        sets: match.report.sets.map((set) => ({
          ...set,
          teamA: resolveMatchTeam(members, set.teamA),
          teamB: resolveMatchTeam(members, set.teamB),
        })),
      },
    } : {}),
  }
}
