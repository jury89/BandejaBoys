import { act, fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { PullToRefresh } from './PullToRefresh'

function touchPoint(clientX: number, clientY: number) {
  return { clientX, clientY }
}

describe('PullToRefresh', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 0,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('aggiorna al rilascio dopo avere superato la soglia', () => {
    vi.useFakeTimers()
    const onRefresh = vi.fn()
    render(<PullToRefresh onRefresh={onRefresh} />)

    fireEvent.touchStart(window, {
      touches: [touchPoint(120, 50)],
    })
    fireEvent.touchMove(window, {
      cancelable: true,
      touches: [touchPoint(123, 190)],
    })

    expect(screen.getByRole('status')).toHaveTextContent('Rilascia per aggiornare')

    fireEvent.touchEnd(window, { touches: [] })
    expect(screen.getByRole('status')).toHaveTextContent('Aggiorno la bacheca')

    act(() => vi.advanceTimersByTime(160))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('torna a riposo se il gesto non raggiunge la soglia', () => {
    vi.useFakeTimers()
    const onRefresh = vi.fn()
    render(<PullToRefresh onRefresh={onRefresh} />)

    fireEvent.touchStart(window, {
      touches: [touchPoint(120, 50)],
    })
    fireEvent.touchMove(window, {
      cancelable: true,
      touches: [touchPoint(122, 110)],
    })
    fireEvent.touchEnd(window, { touches: [] })

    act(() => vi.runAllTimers())
    expect(onRefresh).not.toHaveBeenCalled()
    expect(document.querySelector('.pull-refresh')).not.toHaveClass('is-visible')
  })

  it('resta disattivato quando è aperto un modal', () => {
    const onRefresh = vi.fn()
    render(
      <>
        <div className="modal-backdrop" />
        <PullToRefresh onRefresh={onRefresh} />
      </>,
    )

    fireEvent.touchStart(window, {
      touches: [touchPoint(120, 50)],
    })
    fireEvent.touchMove(window, {
      cancelable: true,
      touches: [touchPoint(120, 220)],
    })
    fireEvent.touchEnd(window, { touches: [] })

    expect(document.querySelector('.pull-refresh')).not.toHaveClass('is-visible')
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('non si arma quando la pagina non è in cima', () => {
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 40,
    })
    const onRefresh = vi.fn()
    render(<PullToRefresh onRefresh={onRefresh} />)

    fireEvent.touchStart(window, {
      touches: [touchPoint(120, 50)],
    })
    fireEvent.touchMove(window, {
      cancelable: true,
      touches: [touchPoint(120, 220)],
    })
    fireEvent.touchEnd(window, { touches: [] })

    expect(document.querySelector('.pull-refresh')).not.toHaveClass('is-visible')
    expect(onRefresh).not.toHaveBeenCalled()
  })
})
