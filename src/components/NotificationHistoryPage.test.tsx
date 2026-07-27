import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { NotificationHistoryItem } from '../lib/notificationHistory'
import { NotificationHistoryPage } from './NotificationHistoryPage'

const notifications: NotificationHistoryItem[] = [{
  id: 'delivery-2',
  eventId: 'event-2',
  kind: 'starter-substitution',
  title: 'Sei il nuovo titolare',
  body: 'Dade, prendi il posto di Tommy.',
  sentAt: Date.UTC(2026, 6, 27, 8, 30),
  deliveredDeviceCount: 2,
}, {
  id: 'delivery-1',
  eventId: 'event-1',
  kind: 'monday-motivation',
  title: 'Sveglia fagianotto',
  body: 'È lunedì.',
  sentAt: Date.UTC(2026, 6, 27, 6, 30),
  deliveredDeviceCount: 1,
}]

describe('archivio notifiche', () => {
  it('mostra testo, categoria, ora di Roma e torna alla bacheca', async () => {
    const onBack = vi.fn()
    const user = userEvent.setup()

    render(
      <NotificationHistoryPage
        notifications={notifications}
        loading={false}
        error={null}
        onBack={onBack}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Le mie notifiche' })).toBeInTheDocument()
    expect(screen.getByText('Sei il nuovo titolare')).toBeInTheDocument()
    expect(screen.getByText('Dade, prendi il posto di Tommy.')).toBeInTheDocument()
    expect(screen.getByText('Nuova convocazione')).toBeInTheDocument()
    expect(screen.getByText('Lun 27 luglio 2026 alle ore 10:30')).toBeInTheDocument()
    expect(screen.getByText('2 dispositivi')).toBeInTheDocument()
    expect(screen.getByLabelText('2 notifiche ricevute')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Torna alla bacheca' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('spiega lo stato vuoto', () => {
    render(
      <NotificationHistoryPage
        notifications={[]}
        loading={false}
        error={null}
        onBack={vi.fn()}
      />,
    )

    expect(screen.getByText('Nessuna notifica salvata')).toBeInTheDocument()
    expect(screen.getByText(/prossime notifiche push consegnate/)).toBeInTheDocument()
  })
})
