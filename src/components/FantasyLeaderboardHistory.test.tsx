import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FantasyLeaderboardContribution, FantasyLeaderboardRow } from '../types'
import { FantasyLeaderboardHistory } from './FantasyLeaderboardHistory'

const points = [5, 3, 0, 1, 5, 0, 3, 5, 1, 3, 5, 3]
const row: FantasyLeaderboardRow = {
  managerId: 'a', managerName: 'Ale', leaguePoints: 34, rank: 1, wins: 3, roundsPlayed: 12, rawFantasyPoints: 120,
  contributions: points.map((leaguePoints, index) => ({
    roundId: `round-${index}`, pollTitle: `Partita ${index + 1}`,
    playedAt: Date.parse('2026-11-12T17:00:00Z') - index * 5 * 86_400_000,
    source: index % 2 ? 'court-placement' : 'formation', leaguePoints,
    rawFantasyPoints: 8 + index / 10, rank: leaguePoints === 0 ? 4 : index % 3 + 1, tied: index === 1,
  })),
}

describe('storico punti Fanta compatto', () => {
  it('separa i punti iniziali dai punti in campo e conserva la motivazione senza inventare una partita', () => {
    render(<FantasyLeaderboardHistory row={{ ...row, leaguePoints: 54, contributions: [{
      roundId: 'starting-credit:winter:a', playedAt: Date.parse('2026-11-13T10:00:00Z'),
      source: 'starting-credit', leaguePoints: 20, rawFantasyPoints: 0, pollTitle: 'Ingresso a stagione in corso',
    }, ...row.contributions] }} id="test" />)
    const overview = screen.getByLabelText('Riepilogo punti campionato')
    expect(within(overview).getByText('Totale').parentElement).toHaveTextContent('54pt')
    expect(within(overview).getByText('Formazioni').parentElement).toHaveTextContent('19pt')
    expect(within(overview).getByText('In campo').parentElement).toHaveTextContent('15pt')
    expect(within(overview).getByText('Punti iniziali').parentElement).toHaveTextContent('20pt')
    const credit = screen.getByLabelText('20 punti campionato').closest('li')!
    expect(within(credit).getByText('Punti iniziali')).toBeInTheDocument()
    expect(within(credit).getByText('Ingresso a stagione in corso')).toBeInTheDocument()
    expect(within(credit).queryByText('In campo')).not.toBeInTheDocument()
    expect(within(credit).queryByText(/punti Fanta/)).not.toBeInTheDocument()
    expect(credit.querySelector('time')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('5 di 13 risultati')
  })

  it('mantiene il totale completo durante la paginazione, distingue le origini e conserva il focus', async () => {
    const user = userEvent.setup()
    render(<FantasyLeaderboardHistory row={row} id="test" />)
    const overview = screen.getByLabelText('Riepilogo punti campionato')
    expect(within(overview).getByText('Totale').parentElement).toHaveTextContent('34pt')
    expect(within(overview).getByText('Formazioni').parentElement).toHaveTextContent('19pt')
    expect(within(overview).getByText('In campo').parentElement).toHaveTextContent('15pt')
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByRole('status')).toHaveTextContent('5 di 12 risultati')
    expect(screen.getByRole('region', { name: 'Novembre 2026' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Ottobre 2026' })).toBeInTheDocument()
    expect(screen.getByText('2° posto ex aequo · 8,1 punti Fanta')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mostra altri 5 risultati' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(10)
    expect(screen.getByRole('button', { name: 'Mostra altri 2 risultati' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getAllByRole('listitem')).toHaveLength(12)
    expect(screen.getByRole('button', { name: 'Mostra meno' })).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('12 di 12 risultati')
    await user.keyboard('{Enter}')
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByRole('heading', { name: /Storico punti/ })).toHaveFocus()
    expect(within(overview).getByText('Totale').parentElement).toHaveTextContent('34pt')
  })

  it('raggruppa nel mese italiano corretto e mostra anche un contributo da zero punti', () => {
    const contribution: FantasyLeaderboardContribution = {
      roundId: 'midnight', playedAt: Date.parse('2026-10-31T23:30:00Z'), pollTitle: 'Titolo storico completo',
      source: 'court-placement', rank: 4, leaguePoints: 0, rawFantasyPoints: 5,
    }
    render(<FantasyLeaderboardHistory row={{ ...row, leaguePoints: 0, contributions: [contribution] }} id="test" />)
    expect(screen.getByRole('region', { name: 'Novembre 2026' })).toBeInTheDocument()
    expect(screen.getByText('00:30')).toBeInTheDocument()
    expect(screen.getByLabelText('0 punti campionato')).toBeInTheDocument()
    expect(screen.getByText('Titolo storico completo')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('mantiene leggibili i bonus presenza storici senza presentarli come piazzamenti invernali', () => {
    const contributions = (['starter', 'mvp', 'top-performer'] as const).map((source, index) => ({
      ...row.contributions[index], source, leaguePoints: index === 0 ? 2 : 3,
    }))
    render(<FantasyLeaderboardHistory row={{ ...row, leaguePoints: 8, contributions }} id="test" />)
    expect(screen.getByText(/Presenza · 8 punti Fanta/)).toBeInTheDocument()
    expect(screen.getByText(/MVP · bonus presenza · 8,1 punti Fanta/)).toBeInTheDocument()
    expect(screen.getByText(/Miglior giudizio medio · bonus presenza · 8,2 punti Fanta/)).toBeInTheDocument()
  })
})
