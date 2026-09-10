import { fireEvent, render, screen } from '@testing-library/react'
import { Modal } from './Modal'

describe('modale', () => {
  it('mantiene il focus nel dialogo e lo restituisce al controllo di apertura', () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const { unmount } = render(<Modal title="Prova" onClose={vi.fn()}><input aria-label="Campo" /><button>Salva</button></Modal>)
    const close = screen.getByRole('button', { name: 'Chiudi' })
    expect(close).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: 'Salva' })).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(close).toHaveFocus()
    unmount()
    expect(trigger).toHaveFocus()
    trigger.remove()
  })
  it('non ruba il focus ai campi quando cambia il callback di chiusura', () => {
    const firstClose = vi.fn()
    const { rerender } = render(
      <Modal title="Modifica slot" onClose={firstClose}>
        <input aria-label="Data" />
      </Modal>,
    )
    const dateInput = screen.getByLabelText('Data')
    dateInput.focus()

    const latestClose = vi.fn()
    rerender(
      <Modal title="Modifica slot" onClose={latestClose}>
        <input aria-label="Data" />
      </Modal>,
    )

    expect(dateInput).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(firstClose).not.toHaveBeenCalled()
    expect(latestClose).toHaveBeenCalledOnce()
  })
})
