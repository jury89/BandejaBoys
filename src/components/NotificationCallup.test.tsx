import { fireEvent, render, screen } from '@testing-library/react'
import { NotificationCallup } from './NotificationCallup'

describe('scelta notifiche', () => {
  it('spiega i tre avvisi e permette di attivarli oppure rimandare', () => {
    const onEnable = vi.fn()
    const onClose = vi.fn()
    render(
      <NotificationCallup
        state="prompt"
        busy={false}
        onEnable={onEnable}
        onDisable={vi.fn()}
        onClose={onClose}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Ti avvisiamo noi.' })).toBeInTheDocument()
    expect(screen.getByText('Nuovi slot disponibili')).toBeInTheDocument()
    expect(screen.getByText('Promemoria partita')).toBeInTheDocument()
    expect(screen.getByText('Ultimo richiamo')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Attiva notifiche' }))
    fireEvent.click(screen.getByRole('button', { name: 'Non ora' }))
    expect(onEnable).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('su iPhone spiega come aggiungere il sito alla schermata Home', () => {
    render(
      <NotificationCallup
        state="ios-install"
        busy={false}
        onEnable={vi.fn()}
        onDisable={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Prima mettila in Home.' })).toHaveTextContent('Aggiungi alla schermata Home')
    expect(screen.queryByRole('button', { name: 'Attiva notifiche' })).not.toBeInTheDocument()
  })

  it('permette di disattivare un dispositivo già registrato', () => {
    const onDisable = vi.fn()
    render(
      <NotificationCallup
        state="enabled"
        busy={false}
        onEnable={vi.fn()}
        onDisable={onDisable}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Disattiva notifiche' }))
    expect(onDisable).toHaveBeenCalledOnce()
  })
})
