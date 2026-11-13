import { useRef, useState } from 'react'
import { PADEL_TIME_ZONE } from '../lib/format'
import type { FantasyLeaderboardContribution, FantasyLeaderboardRow } from '../types'

const PAGE_SIZE = 5
const numberFormatter = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 })
const monthFormatter = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric', timeZone: PADEL_TIME_ZONE })
const dateFormatter = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: PADEL_TIME_ZONE })
const timeFormatter = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: PADEL_TIME_ZONE })
const fullDateFormatter = new Intl.DateTimeFormat('it-IT', { dateStyle: 'full', timeStyle: 'short', timeZone: PADEL_TIME_ZONE })
const sentenceCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

function outcomeLabel(contribution: FantasyLeaderboardContribution): string {
  const fantasyPoints = `${numberFormatter.format(contribution.rawFantasyPoints)} punti\u00a0Fanta`
  if (contribution.source === 'formation') return `${contribution.rank}° posto · ${fantasyPoints}`
  if (contribution.source === 'court-placement') return `${contribution.rank}° posto${contribution.tied ? ' ex aequo' : ''} · ${fantasyPoints}`
  if (contribution.source === 'top-performer') return `Miglior giudizio medio · bonus presenza · ${fantasyPoints}`
  if (contribution.source === 'mvp') return `MVP · bonus presenza · ${fantasyPoints}`
  return `Presenza · ${fantasyPoints}`
}

/** Presentation of already-derived contributions; no scoring or repository calls. */
export function FantasyLeaderboardHistory({ row, id }: { row: FantasyLeaderboardRow; id: string }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const visible = row.contributions.slice(0, visibleCount)
  const remaining = row.contributions.length - visible.length
  const formationPoints = row.contributions.reduce((sum, item) => sum + (item.source === 'formation' ? item.leaguePoints : 0), 0)
  const courtPoints = row.contributions.reduce((sum, item) => sum + (item.source !== 'formation' && item.source !== 'starting-credit' ? item.leaguePoints : 0), 0)
  const startingPoints = row.contributions.reduce((sum, item) => sum + (item.source === 'starting-credit' ? item.leaguePoints : 0), 0)
  const groups = new Map<string, FantasyLeaderboardContribution[]>()
  for (const contribution of visible) {
    const month = sentenceCase(monthFormatter.format(contribution.playedAt))
    groups.set(month, [...(groups.get(month) ?? []), contribution])
  }
  const months = [...groups]
  const firstMonth = months[0]?.[0]
  const historyId = `${id}-history`
  const headingId = `${id}-heading`

  const showLess = () => {
    setVisibleCount(PAGE_SIZE)
    headingRef.current?.focus({ preventScroll: true })
    headingRef.current?.scrollIntoView?.({ block: 'start' })
  }

  return (
    <div className="fantasy-points-breakdown">
      <dl className="fantasy-points-overview" aria-label="Riepilogo punti campionato">
        <div className="fantasy-points-overview__total"><dt>Totale</dt><dd>{row.leaguePoints}<small>pt</small></dd></div>
        <div><dt>Formazioni</dt><dd>{formationPoints}<small>pt</small></dd></div>
        <div><dt>In campo</dt><dd>{courtPoints}<small>pt</small></dd></div>
        {startingPoints > 0 && <div className="fantasy-points-overview__credit"><dt>Punti iniziali</dt><dd>{startingPoints}<small>pt</small></dd></div>}
      </dl>
      <div className="fantasy-points-history__heading">
        <h3 id={headingId} ref={headingRef} tabIndex={-1}>
          {firstMonth && <span className="sr-only">Storico punti: </span>}
          {firstMonth ?? 'Storico punti'}
        </h3>
        <p role="status">{visible.length} di {row.contributions.length} risultati</p>
      </div>
      <div id={historyId} className="fantasy-points-history" aria-labelledby={headingId}>
        {months.map(([month, contributions], index) => (
          <section key={month} className="fantasy-points-month" aria-label={month}>
            {index > 0 && <h4>{month}</h4>}
            <ul>
              {contributions.map((contribution) => (
                <li key={`${contribution.roundId}:${contribution.source}`}>
                  <div className="fantasy-points-entry__match">
                    {contribution.source === 'starting-credit' ? (
                      <strong className="fantasy-points-entry__credit-title">Punti iniziali</strong>
                    ) : (
                      <time dateTime={new Date(contribution.playedAt).toISOString()} aria-label={fullDateFormatter.format(contribution.playedAt)}>
                        {sentenceCase(dateFormatter.format(contribution.playedAt))}
                        <span>{timeFormatter.format(contribution.playedAt)}</span>
                      </time>
                    )}
                    <p>
                      {contribution.source === 'starting-credit' ? contribution.pollTitle : (
                        <>
                          <span className={`fantasy-points-entry__source${contribution.source === 'formation' ? ' is-formation' : ''}`}>{contribution.source === 'formation' ? 'Formazione' : 'In campo'}</span>
                          {' '}{outcomeLabel(contribution)}
                        </>
                      )}
                    </p>
                    {contribution.source !== 'starting-credit' && <span className="sr-only">{contribution.pollTitle}</span>}
                  </div>
                  <strong className="fantasy-points-entry__points" aria-label={`${contribution.leaguePoints} punti campionato`}>{contribution.leaguePoints > 0 ? '+' : ''}{contribution.leaguePoints}<small>pt</small></strong>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {row.contributions.length > PAGE_SIZE && (
        <button
          type="button"
          className="button button--ghost fantasy-points-history__more"
          aria-controls={historyId}
          onClick={remaining > 0 ? () => setVisibleCount((current) => current + PAGE_SIZE) : showLess}
        >
          {remaining > 0 ? `Mostra altri ${Math.min(PAGE_SIZE, remaining)} risultati` : 'Mostra meno'}
        </button>
      )}
    </div>
  )
}
