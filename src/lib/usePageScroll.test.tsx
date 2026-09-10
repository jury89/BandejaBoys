import { act, renderHook } from '@testing-library/react'
import { usePageScroll } from './usePageScroll'

it('aspetta i dati prima di ripristinare la posizione della pagina', () => {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  const { rerender, unmount } = renderHook(({ ready }) => usePageScroll('fantasy', ready, false), { initialProps: { ready: false } })
  expect(scroll).not.toHaveBeenCalled()
  rerender({ ready: true })
  expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
  unmount()
  scroll.mockRestore()
})

it('ricorda lo scroll di ogni sezione senza interferire con una destinazione slot esplicita', () => {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  const { rerender, unmount } = renderHook(({ view, explicit }) => usePageScroll(view, true, explicit), { initialProps: { view: 'feed', explicit: false } })
  expect(scroll).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' })
  Object.defineProperty(window, 'scrollY', { value: 540, configurable: true })
  act(() => window.dispatchEvent(new Event('scroll')))
  rerender({ view: 'fantasy', explicit: false })
  expect(scroll).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' })
  rerender({ view: 'feed', explicit: false })
  expect(scroll).toHaveBeenLastCalledWith({ top: 540, behavior: 'instant' })
  scroll.mockClear()
  rerender({ view: 'feed', explicit: true })
  expect(scroll).not.toHaveBeenCalled()
  unmount()
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
  scroll.mockRestore()
})
