import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeTournament } from '../lib/domain'
import { TournamentRoundTimer } from './TournamentRoundTimer'

const now = Date.UTC(2026, 9, 1, 10)
const tournament = { ...makeTournament('clock', { title: 'Timer prova', startsAt: now + 7_200_000, venueId: 'oasi-boschetto', format: 'round-robin', pairing: 'random-fixed', capacity: 10, courts: 2, rounds: 5, pointsPerMatch: 24, scoreAccess: 'players', scoringMode: 'timed' }, 'owner', now), status: 'running' as const, currentRound: 1, totalRounds: 5, roundStartedAt: now + 7_200_000 }
const at = tournament.roundStartedAt, end = at + 900_000

describe('TournamentRoundTimer', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('requires an explicit sound opt-in and plays one signal per expired round', async () => {
    const start = vi.fn(), close = vi.fn().mockResolvedValue(undefined)
    class FakeAudio {
      state = 'running'; currentTime = 0; destination = {}
      resume = vi.fn().mockResolvedValue(undefined)
      close = close
      createOscillator = () => ({ frequency: { value: 0 }, connect: vi.fn(), start, stop: vi.fn() })
      createGain = () => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() })
    }
    vi.stubGlobal('AudioContext', FakeAudio)
    const props = { tournament, manager: true, busy: false, onStart: vi.fn() }
    const view = render(<TournamentRoundTimer {...props} now={end - 1000} />)
    expect(start).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Attiva avviso sonoro' }))
    view.rerender(<TournamentRoundTimer {...props} now={end} />)
    expect(start).toHaveBeenCalledTimes(3)
    expect(screen.getByRole('timer')).toHaveTextContent('00:00')
    view.rerender(<TournamentRoundTimer {...props} now={end + 1000} />)
    expect(start).toHaveBeenCalledTimes(3)
    view.unmount(); expect(close).toHaveBeenCalledOnce()
  })
  it('shows a fallback when browser audio is unavailable', async () => {
    vi.stubGlobal('AudioContext', undefined)
    render(<TournamentRoundTimer tournament={tournament} now={at} manager={false} busy={false} onStart={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Attiva avviso sonoro' }))
    expect(screen.getByRole('alert')).toHaveTextContent('timer del telefono')
  })
})
