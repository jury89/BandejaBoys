import { useRef } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useSlotMenuPosition } from './useSlotMenuPosition'

function Menu({ enabled = true }: { enabled?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null)
  useSlotMenuPosition(ref, enabled)
  return <div className="app-shell">
    <header className="topbar" data-testid="header" />
    <details ref={ref} data-testid="menu"><summary>Altre azioni</summary>
      <div className="slot-card__management" data-testid="panel"><button>Ultima azione</button></div>
    </details>
    <nav className="club-navigation" data-testid="navigation" />
  </div>
}

function rect(top: number, bottom: number, left = 240, right = 366): DOMRect {
  return { top, bottom, left, right, x: left, y: top, height: bottom - top, width: right - left, toJSON: () => ({}) }
}

function geometry() {
  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(844)
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390)
  vi.spyOn(screen.getByTestId('header'), 'getBoundingClientRect').mockReturnValue(rect(0, 68))
  vi.spyOn(screen.getByTestId('navigation'), 'getBoundingClientRect').mockReturnValue(rect(776, 844))
  vi.spyOn(screen.getByTestId('panel'), 'scrollHeight', 'get').mockReturnValue(254)
  return vi.spyOn(screen.getByTestId('menu'), 'getBoundingClientRect')
}

function openMenu() {
  const menu = screen.getByTestId('menu') as HTMLDetailsElement
  menu.open = true
  fireEvent(menu, new Event('toggle'))
  return menu
}

afterEach(() => vi.restoreAllMocks())

it('tiene il menu sopra la barra inferiore e lo riposiziona dopo lo scorrimento', async () => {
  render(<Menu />)
  const anchor = geometry().mockReturnValue(rect(550, 594))
  screen.getByTestId('panel').scrollTop = 100
  const menu = openMenu()
  expect(menu.dataset.placement).toBe('above')
  const panel = screen.getByTestId('panel')
  expect(panel.scrollTop).toBe(0)
  expect(panel.style.getPropertyValue('--slot-menu-max-height')).toBe('470px')
  expect(panel.style.getPropertyValue('--slot-menu-top')).toBe('-258px')
  anchor.mockReturnValue(rect(100, 144))
  fireEvent.scroll(document)
  await waitFor(() => expect(menu.dataset.placement).toBe('below'))
  expect(panel.style.getPropertyValue('--slot-menu-max-height')).toBe('620px')
  expect(panel.style.getPropertyValue('--slot-menu-top')).toBe('48px')
})

it('chiude il menu se il suo pulsante non è più visibile', async () => {
  render(<Menu />)
  const anchor = geometry().mockReturnValue(rect(550, 594))
  const menu = openMenu()
  anchor.mockReturnValue(rect(780, 824))
  fireEvent.resize(window)
  await waitFor(() => expect(menu.open).toBe(false))
})

it('non cambia il posizionamento della classica e rimuove gli ascoltatori alla chiusura', async () => {
  const view = render(<Menu enabled={false} />)
  const anchor = geometry().mockReturnValue(rect(550, 594))
  const menu = openMenu()
  expect(anchor).not.toHaveBeenCalled()
  expect(menu.dataset.placement).toBeUndefined()
  view.rerender(<Menu />)
  expect(menu.dataset.placement).toBe('above')
  const remove = vi.spyOn(document, 'removeEventListener')
  menu.open = false
  fireEvent(menu, new Event('toggle'))
  await waitFor(() => expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function), true))
})
