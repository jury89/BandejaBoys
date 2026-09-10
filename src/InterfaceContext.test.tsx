import { act, render, screen } from '@testing-library/react'
import { clearInterfaceOverride, InterfaceProvider, useInterfaceMode } from './InterfaceContext'

function Probe() { return <output>{useInterfaceMode()}</output> }

afterEach(() => window.history.replaceState(null, '', '/'))

describe('interfaccia per sessione', () => {
  it('segue profilo, override, salvataggio e cambio account senza condividere preferenze', () => {
    window.history.replaceState({ marker: 1 }, '', '/?_swv=abc&ux=classica#fanta')
    const { rerender } = render(<InterfaceProvider preference="nuova"><Probe /></InterfaceProvider>)
    expect(screen.getByRole('status')).toHaveTextContent('classica')
    act(clearInterfaceOverride)
    expect(screen.getByRole('status')).toHaveTextContent('nuova')
    expect(window.location.search).toBe('?_swv=abc')
    expect(window.location.hash).toBe('#fanta')
    expect(window.history.state).toEqual({ marker: 1 })
    rerender(<InterfaceProvider><Probe /></InterfaceProvider>)
    expect(screen.getByRole('status')).toHaveTextContent('classica')
  })

  it('segue avanti e indietro nella cronologia del browser', () => {
    window.history.replaceState(null, '', '/')
    render(<InterfaceProvider><Probe /></InterfaceProvider>)
    act(() => {
      window.history.replaceState(null, '', '/?ux=nuova')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.getByRole('status')).toHaveTextContent('nuova')
  })
})
