import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeTournament } from '../lib/domain'
import { TournamentRoundTimer } from './TournamentRoundTimer'

const now = Date.UTC(2026, 9, 1, 10)
const tournament = { ...makeTournament('clock', { title: 'Timer prova', startsAt: now + 7_200_000, venueId: 'oasi-boschetto', format: 'round-robin', pairing: 'random-fixed', capacity: 10, courts: 2, rounds: 5, pointsPerMatch: 24, scoreAccess: 'players', scoringMode: 'timed' }, 'owner', now), status: 'running' as const, currentRound: 1, totalRounds: 5, roundStartedAt: now + 7_200_000 }
const at = tournament.roundStartedAt, end = at + 900_000

describe('TournamentRoundTimer', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('lets the manager start early, but not while busy or as an ordinary participant', async () => {
    const onStart = vi.fn(), props = { tournament: { ...tournament, roundStartedAt: null }, now: at - 600_000, manager: true, busy: false, onStart }
    const view = render(<TournamentRoundTimer {...props} />)
    const button = screen.getByRole('button', { name: 'Avvia timer del turno' })
    expect(button).toBeEnabled()
    await userEvent.click(button)
    expect(onStart).toHaveBeenCalledOnce()
    view.rerender(<TournamentRoundTimer {...props} busy />)
    expect(button).toBeDisabled()
    view.rerender(<TournamentRoundTimer {...props} manager={false} />)
    expect(screen.queryByRole('button', { name: 'Avvia timer del turno' })).not.toBeInTheDocument()
  })
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
  it('freezes the remainder after manual stop and never sounds at the original deadline', async () => {
    const oscillator = vi.fn()
    vi.stubGlobal('AudioContext', class {
      state = 'running'
      resume = vi.fn().mockResolvedValue(undefined)
      close = vi.fn().mockResolvedValue(undefined)
      createOscillator = oscillator
    })
    const stopped = { ...tournament, roundEndedAt: at + 60_000 }
    const props = { tournament: stopped, manager: true, busy: false, onStart: vi.fn(), onEnd: vi.fn() }
    const view = render(<TournamentRoundTimer {...props} now={at + 60_000} />)
    await userEvent.click(screen.getByRole('button', { name: 'Attiva avviso sonoro' }))
    view.rerender(<TournamentRoundTimer {...props} now={end + 1000} />)
    expect(screen.getByRole('timer')).toHaveTextContent('14:00')
    expect(oscillator).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Concludi turno' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Avvia timer del turno' })).not.toBeInTheDocument()
  })
})
