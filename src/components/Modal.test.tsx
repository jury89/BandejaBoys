import { fireEvent, render, screen } from '@testing-library/react'
import { Modal } from './Modal'

describe('modale', () => {
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
