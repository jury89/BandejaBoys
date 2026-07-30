import { groupMatchReportSetsByTeams } from '../lib/domain'
import type { MatchReport, MatchReportPlayer } from '../types'

function matchTeamLabel(team: MatchReportPlayer[]): string {
  return team.map((player) => player.displayName).join(' + ')
}

export function MatchReportScoreboard({ report }: { report: MatchReport }) {
  const reportGroups = groupMatchReportSetsByTeams(report.sets)

  return (
    <div className="personal-match__report-groups">
      {reportGroups.map((group, groupIndex) => {
        const teamALabel = matchTeamLabel(group.teamA)
        const teamBLabel = matchTeamLabel(group.teamB)
        return (
          <div className="personal-match__report-group" key={group.key}>
            {reportGroups.length > 1 && (
              <small className="personal-match__report-group-label">
                Formazione {groupIndex + 1}
              </small>
            )}
            <table aria-label={`Formazione ${groupIndex + 1}: ${teamALabel} contro ${teamBLabel}`}>
              <colgroup>
                <col />
                {group.sets.map((set) => (
                  <col className="personal-match__report-score-column" key={set.setId} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Squadra</th>
                  {group.sets.map((set) => (
                    <th scope="col" key={set.setId} title={`Set ${set.setNumber}`}>
                      S{set.setNumber}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">{teamALabel}</th>
                  {group.sets.map((set) => (
                    <td className={set.scoreA > set.scoreB ? 'is-winner' : ''} key={set.setId}>
                      {set.scoreA}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">{teamBLabel}</th>
                  {group.sets.map((set) => (
                    <td className={set.scoreB > set.scoreA ? 'is-winner' : ''} key={set.setId}>
                      {set.scoreB}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
