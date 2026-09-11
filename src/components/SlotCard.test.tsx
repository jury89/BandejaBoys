import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SlotCard } from './SlotCard'

vi.mock('../InterfaceContext', () => ({ useInterfaceMode: () => 'nuova', clearInterfaceOverride: vi.fn() }))
import type { PadelPoll, PadelSlot, SessionUser } from '../types'
import { DEFAULT_VENUE, setSlotBooking } from '../lib/domain'
import { repository } from '../lib/repository'
import { SLOT_ADMIN_USER_ID } from '../lib/admin'

const user: SessionUser = {
  id: 'jury',
  displayName: 'Jury',
  email: 'jury@example.test',
  createdAt: 1,
}

const slot: PadelSlot = {
  id: 'slot-1',
  startsAt: '2026-07-28T19:00',
  durationMinutes: 90,
  venue: '',
  signups: [{ id: 'signup-1', userId: user.id, displayName: user.displayName, joinedAt: 1 }],
}

const poll: PadelPoll = {
  id: 'poll-1',
  title: 'Prossima settimana',
  targetWeekStart: '2026-07-27',
  createdBy: user.id,
  createdByName: user.displayName,
  createdAt: 1,
  updatedAt: 1,
  status: 'open',
  slots: [slot],
}

describe('azioni dello slot', () => {
  it('mostra sempre il campo con quattro posti, iniziali e posizione personale', () => {
    render(<SlotCard poll={poll} slot={slot} user={user} members={[user]} onPollChange={vi.fn()} onNotify={vi.fn()} onError={vi.fn()} />)
    const lineup = screen.getByRole('region', { name: 'Titolari' })
    expect(lineup).toHaveClass('club-roster')
    expect(screen.getByText('Sei titolare')).toBeInTheDocument()
    expect(lineup.querySelector('.club-roster__avatar')).toHaveTextContent('J')
    expect(lineup.querySelector('.club-roster__net')).toHaveAttribute('aria-hidden', 'true')
    expect(lineup.querySelectorAll('.club-roster__player')).toHaveLength(4)
    expect(Array.from(lineup.querySelectorAll('.club-roster__marker'), marker => marker.textContent)).toEqual(['1', '2', '3', '4'])
    expect(lineup.querySelectorAll('.club-roster__empty')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /Mostra campo|Riduci campo/ })).not.toBeInTheDocument()
  })
  it('mantiene quattro posti liberi quando lo slot è vuoto', () => {
    render(<SlotCard poll={poll} slot={{ ...slot, signups: [] }} user={user} members={[user]} onPollChange={vi.fn()} onNotify={vi.fn()} onError={vi.fn()} />)
    const lineup = screen.getByRole('region', { name: 'Titolari' })
    expect(lineup.querySelectorAll('.club-roster__player.is-empty')).toHaveLength(4)
    expect(screen.getAllByText('Posto libero')).toHaveLength(4)
  })
  it('mostra solo i quattro titolari in ordine nel campo, con la riserva separata', () => {
    const signups = ['Uno', 'Due', 'Tre', 'Quattro', 'Riserva'].map((name, index) => ({ id: `signup-${index}`, userId: name, displayName: name, joinedAt: index + 1 }))
    render(<SlotCard poll={poll} slot={{ ...slot, signups: [...signups].reverse() }} user={user} members={[]} onPollChange={vi.fn()} onNotify={vi.fn()} onError={vi.fn()} />)
    const lineup = screen.getByRole('region', { name: 'Titolari' })
    expect(Array.from(lineup.querySelectorAll('.club-roster__name strong'), name => name.textContent)).toEqual(['Uno', 'Due', 'Tre', 'Quattro'])
    expect(lineup.querySelectorAll('.club-roster__player.is-filled')).toHaveLength(4)
    expect(lineup).not.toHaveTextContent('Riserva')
    expect(screen.getByLabelText('Lista d’attesa')).toHaveTextContent('Riserva')
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('mostra il nome attuale del profilo al posto della vecchia copia ricavata dall’email', () => {
    const mattia: SessionUser = {
      id: 'mattia',
      displayName: 'Mattia Baruffaldi',
      email: 'mattia.baruffaldi@example.test',
      createdAt: 2,
    }
    const legacySlot: PadelSlot = {
      ...slot,
      signups: [{
        id: 'signup-mattia',
        userId: mattia.id,
        displayName: 'mattia.baruffaldi',
        joinedAt: 1,
      }],
    }

    render(
      <SlotCard
        poll={{ ...poll, slots: [legacySlot] }}
        slot={legacySlot}
        user={user}
        members={[user, mattia]}
        onPollChange={vi.fn()}
        onNotify={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(screen.getByText('Mattia Baruffaldi')).toBeInTheDocument()
    expect(screen.queryByText('mattia.baruffaldi')).not.toBeInTheDocument()
  })

  it('mostra la foto del profilo accanto al nome del giocatore', () => {
    const avatarUser = { ...user, avatarDataUrl: 'data:image/jpeg;base64,avatar' }
    render(
      <SlotCard
        poll={poll}
        slot={slot}
        user={avatarUser}
        members={[avatarUser]}
        onPollChange={vi.fn()}
        onNotify={vi.fn()}
        onError={vi.fn()}
      />,
    )

    const avatar = screen.getByRole('img', { name: 'Foto profilo di Jury' })
    expect(avatar).toHaveClass('club-roster__avatar')
    expect(avatar).toHaveAttribute('src', avatarUser.avatarDataUrl)
  })

  it('spiega in modo accessibile cosa fa Passo il posto', () => {
    render(
      <SlotCard
        poll={poll}
        slot={slot}
        user={user}
        members={[user]}
        onPollChange={vi.fn()}
        onNotify={vi.fn()}
        onError={vi.fn()}
      />,
    )

    const action = screen.getByRole('button', { name: 'Passo il posto' })
    const tooltip = screen.getByText(/Con “Passo il posto” scegli chi ti sostituisce/)

    expect(action).toHaveAttribute('aria-describedby', tooltip.id)
    expect(tooltip).not.toHaveTextContent('entra la prima riserva')
  })

  it('permette alla riserva di prendere un posto libero senza uscire e rientrare', async () => {
    const reserveSlot: PadelSlot = { ...slot, signups: [{ ...slot.signups[0], role: 'reserve' }] }
    const promote = vi.spyOn(repository, 'takeStarterPlace').mockResolvedValue(poll)
    const leave = vi.spyOn(repository, 'leaveSlot')
    const notify = vi.fn()
    function Harness() {
      const [current, setCurrent] = useState({ ...poll, slots: [reserveSlot] })
      return <SlotCard poll={current} slot={current.slots[0]} user={user} members={[user]} onPollChange={setCurrent} onNotify={notify} onError={vi.fn()} />
    }
    render(<Harness />)
    expect(screen.getByLabelText('Lista d’attesa').querySelector('.club-roster__avatar')).toHaveTextContent('J')
    fireEvent.click(screen.getByRole('button', { name: 'Passa a titolare' }))
    await waitFor(() => expect(screen.getByText('Sei titolare')).toBeInTheDocument())
    expect(promote).toHaveBeenCalledWith(poll.id, slot.id, user)
    expect(leave).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith('Sei passato da riserva a titolare.')
  })

  it('non propone il passaggio a titolare se il campo è pieno o lo slot è disabilitato', () => {
    const reserveSlot: PadelSlot = { ...slot, signups: [
      ...['a', 'b', 'c', 'd'].map((id, i) => ({ id, userId: id, displayName: id, joinedAt: i })),
      { ...slot.signups[0], role: 'reserve', joinedAt: 10 },
    ] }
    const props = { poll: { ...poll, slots: [reserveSlot] }, slot: reserveSlot, user, members: [user], onPollChange: vi.fn(), onNotify: vi.fn(), onError: vi.fn() }
    const { rerender } = render(<SlotCard {...props} />)
    expect(screen.queryByRole('button', { name: 'Passa a titolare' })).not.toBeInTheDocument()
    rerender(<SlotCard {...props} slot={{ ...reserveSlot, signups: [reserveSlot.signups[4]] }} disabled />)
    expect(screen.queryByRole('button', { name: 'Passa a titolare' })).not.toBeInTheDocument()
  })

  it('se il posto viene occupato nel frattempo mostra l’errore e mantiene la riserva', async () => {
    const reserveSlot: PadelSlot = { ...slot, signups: [{ ...slot.signups[0], role: 'reserve' }] }
    vi.spyOn(repository, 'takeStarterPlace').mockRejectedValue(new Error('Posti già occupati.'))
    const onError = vi.fn(), onPollChange = vi.fn(), onNotify = vi.fn()
    render(<SlotCard poll={{ ...poll, slots: [reserveSlot] }} slot={reserveSlot} user={user} members={[user]} onPollChange={onPollChange} onNotify={onNotify} onError={onError} />)
    fireEvent.click(screen.getByRole('button', { name: 'Passa a titolare' }))
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Posti già occupati.'))
    expect(onPollChange).not.toHaveBeenCalled()
    expect(onNotify).not.toHaveBeenCalled()
    expect(screen.getByText('Sei la riserva n° 1')).toBeInTheDocument()
  })

  it('prenota con un tocco all’Oasi Boschetto anche con meno di quattro giocatori', async () => {
    const updatedPoll: PadelPoll = { ...poll, slots: [setSlotBooking(slot, user, 20)] }
    const setBooking = vi.spyOn(repository, 'setBooking').mockResolvedValue(updatedPoll)
    const onPollChange = vi.fn()
    const onNotify = vi.fn()
    render(
      <SlotCard
        poll={poll}
        slot={slot}
        user={user}
        members={[user]}
        onPollChange={onPollChange}
        onNotify={onNotify}
        onError={vi.fn()}
      />,
    )

    expect(slot.signups).toHaveLength(1)
    expect(screen.getByLabelText('Campo da prenotare')).toHaveTextContent('Prenotazione non ancora confermata')
    expect(screen.getByText(DEFAULT_VENUE)).toBeInTheDocument()
    expect(screen.getByText('Segna come prenotato')).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Segna il campo come prenotato all’Oasi Boschetto' }),
    )

    await waitFor(() => expect(setBooking).toHaveBeenCalledWith(
      poll.id,
      slot.id,
      { bookedBy: user },
      user,
    ))
    expect(onPollChange).toHaveBeenCalledWith(updatedPoll)
    expect(onNotify).toHaveBeenCalledWith(
      'Campo prenotato all’Oasi Boschetto. L’orario è confermato.',
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('mostra la conferma del campo al posto della fascia in attesa', () => {
    const bookedSlot = setSlotBooking(slot, user, 20)

    render(
      <SlotCard
        poll={{ ...poll, slots: [bookedSlot] }}
        slot={bookedSlot}
        user={user}
        members={[user]}
        onPollChange={vi.fn()}
        onNotify={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText('Campo da prenotare')).not.toBeInTheDocument()
    expect(screen.getByText('Prenotazione confermata da Jury')).toBeInTheDocument()
    expect(screen.getByText('Confermato')).toBeInTheDocument()
  })

  it('mostra ogni orario come indicativo e lo conferma automaticamente con la prenotazione', () => {
    const { rerender } = render(
      <SlotCard
        poll={poll}
        slot={slot}
        user={user}
        members={[user]}
        onPollChange={vi.fn()}
        onNotify={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(screen.getByText('Orario indicativo')).toBeInTheDocument()

    const bookedSlot = setSlotBooking(slot, user, 20)
    rerender(
      <SlotCard
        poll={{ ...poll, slots: [bookedSlot] }}
        slot={bookedSlot}
        user={user}
        members={[user]}
        onPollChange={vi.fn()}
        onNotify={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(screen.queryByText('Orario indicativo')).not.toBeInTheDocument()
    expect(screen.getByText('Orario confermato')).toBeInTheDocument()
  })

  it('modifica data e ora di uno slot esistente', async () => {
    const reschedule = vi.spyOn(repository, 'rescheduleSlot').mockResolvedValue(poll)
    const onNotify = vi.fn()
    render(
      <SlotCard
        poll={poll}
        slot={slot}
        user={user}
        members={[user]}
        onPollChange={vi.fn()}
        onNotify={onNotify}
        onError={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Modifica data e ora dello slot' }))
    expect(screen.getByLabelText('Data')).not.toHaveFocus()
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-07-29' } })
    fireEvent.change(screen.getByLabelText('Ora'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('Minuti'), { target: { value: '30' } })
    expect(Array.from(
      screen.getByLabelText('Minuti').querySelectorAll<HTMLOptionElement>('option'),
      (option) => option.value,
    )).toEqual(['00', '30'])
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Salva data e ora' }))

    await waitFor(() => expect(reschedule).toHaveBeenCalledWith(
      poll.id,
      slot.id,
      '2026-07-29T20:30',
      user,
    ))
    expect(onNotify).toHaveBeenCalledWith('Data e ora dello slot aggiornate.')
  })

  it('apre direttamente lo slot come evento calendario dal pulsante a icona', () => {
    vi.useFakeTimers()
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:padel-calendar')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const onNotify = vi.fn()

    render(
      <SlotCard
        poll={poll}
        slot={slot}
        user={user}
        members={[user]}
        onPollChange={vi.fn()}
        onNotify={onNotify}
        onError={vi.fn()}
      />,
    )

    const actions = screen.getByRole('group', { name: 'Azioni dello slot' })
    const calendar = screen.getByRole('button', { name: /Aggiungi lo slot.+al calendario/ })
    const edit = screen.getByRole('button', { name: 'Modifica data e ora dello slot' })
    const remove = screen.getByRole('button', { name: /Elimina lo slot/ })

    expect(actions).not.toContainElement(calendar)
    expect(calendar).toHaveTextContent('Calendario')
    expect(edit).toHaveTextContent('Modifica data e ora')
    expect(remove).toHaveTextContent('Elimina slot')
    fireEvent.click(calendar)

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(click).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onNotify).toHaveBeenCalledWith(
      'Evento calendario pronto: aprilo per aggiungere la partita.',
    )
    vi.advanceTimersByTime(1_000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:padel-calendar')
  })

  it('apre la cronologia dello slot dal pulsante a icona nella scheda', async () => {
    const getSlotActivity = vi.spyOn(repository, 'getSlotActivity').mockResolvedValue([])

    render(
      <SlotCard
        poll={poll}
        slot={slot}
        user={user}
        members={[user]}
        onPollChange={vi.fn()}
        onNotify={vi.fn()}
        onError={vi.fn()}
      />,
    )

    const actions = screen.getByRole('group', { name: 'Azioni dello slot' })
    const history = screen.getByRole('button', { name: /Vedi la cronologia dello slot/ })
    expect(actions).toContainElement(history)
    expect(history).toHaveTextContent('Cronologia')

    fireEvent.click(history)

    expect(await screen.findByRole('dialog', { name: 'Cronologia dello slot' })).toBeInTheDocument()
    expect(getSlotActivity).toHaveBeenCalledWith(poll.id, slot.id)
  })

  it('elimina uno slot dopo conferma e aggiorna subito la bacheca', async () => {
    const otherSlot: PadelSlot = {
      ...slot,
      id: 'slot-2',
      startsAt: '2026-07-30T19:30',
      signups: [],
    }
    const currentPoll = { ...poll, slots: [slot, otherSlot] }
    const updatedPoll = { ...poll, updatedAt: 20, slots: [otherSlot] }
    const deleteSlot = vi.spyOn(repository, 'deleteSlot').mockResolvedValue(updatedPoll)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onPollChange = vi.fn()
    const onNotify = vi.fn()

    render(
      <SlotCard
        poll={currentPoll}
        slot={slot}
        user={user}
        members={[user]}
        onPollChange={onPollChange}
        onNotify={onNotify}
        onError={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Elimina lo slot/ }))

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Verranno rimosse tutte le adesioni e le riserve'))
    await waitFor(() => expect(deleteSlot).toHaveBeenCalledWith(poll.id, slot.id, user))
    expect(onPollChange).toHaveBeenCalledWith(updatedPoll)
    expect(onNotify).toHaveBeenCalledWith('Slot eliminato.')
  })

  it('avvisa che un campo prenotato va annullato anche presso il circolo', () => {
    const bookedSlot = setSlotBooking(slot, user, 20)
    const otherSlot = { ...slot, id: 'slot-2', startsAt: '2026-07-30T19:30' }
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(
      <SlotCard
        poll={{ ...poll, slots: [bookedSlot, otherSlot] }}
        slot={bookedSlot}
        user={user}
        members={[user]}
        onPollChange={vi.fn()}
        onNotify={vi.fn()}
        onError={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Elimina lo slot/ }))

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('annullarlo direttamente con l’Oasi Boschetto'))
  })

  it('permette di eliminare anche l’unico slot rimasto nel gruppo tecnico', () => {
    render(
      <SlotCard
        poll={poll}
        slot={slot}
        user={user}
        members={[user]}
        onPollChange={vi.fn()}
        onNotify={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /Elimina lo slot/ })).toBeEnabled()
  })

  it('permette di scegliere il ruolo e aggiorna subito la formazione da titolare', async () => {
    const emptySlot = { ...slot, signups: [] }
    const initialPoll: PadelPoll = { ...poll, slots: [emptySlot] }
    const starterSlot: PadelSlot = {
      ...slot,
      signups: [{ ...slot.signups[0], role: 'starter' }],
    }
    const updatedPoll: PadelPoll = { ...poll, slots: [starterSlot] }
    const joinSlot = vi.spyOn(repository, 'joinSlot').mockResolvedValue(updatedPoll)

    function Harness() {
      const [current, setCurrent] = useState(initialPoll)
      return (
        <SlotCard
          poll={current}
          slot={current.slots[0]}
          user={user}
          members={[user]}
          onPollChange={setCurrent}
          onNotify={vi.fn()}
          onError={vi.fn()}
        />
      )
    }

    render(<Harness />)
    expect(screen.getByRole('group', { name: 'Scegli come partecipare' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Segnati come titolare' }))

    expect(await screen.findByRole('button', { name: 'Ritirati' })).toBeInTheDocument()
    expect(joinSlot).toHaveBeenCalledWith(poll.id, slot.id, user, 'starter')
    expect(screen.getByText('Jury')).toBeInTheDocument()
  })

  it('permette di segnarsi direttamente come riserva anche con il campo vuoto', async () => {
    const emptySlot = { ...slot, signups: [] }
    const reserveSlot: PadelSlot = {
      ...slot,
      signups: [{ ...slot.signups[0], role: 'reserve' }],
    }
    const initialPoll: PadelPoll = { ...poll, slots: [emptySlot] }
    const updatedPoll: PadelPoll = { ...poll, slots: [reserveSlot] }
    const joinSlot = vi.spyOn(repository, 'joinSlot').mockResolvedValue(updatedPoll)

    function Harness() {
      const [current, setCurrent] = useState(initialPoll)
      return (
        <SlotCard
          poll={current}
          slot={current.slots[0]}
          user={user}
          members={[user]}
          onPollChange={setCurrent}
          onNotify={vi.fn()}
          onError={vi.fn()}
        />
      )
    }

    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Segnati come riserva' }))

    expect(await screen.findByRole('button', { name: 'Lascia la riserva' })).toBeInTheDocument()
    expect(joinSlot).toHaveBeenCalledWith(poll.id, slot.id, user, 'reserve')
    expect(screen.getByLabelText('Lista d’attesa')).toHaveTextContent('Jury')
  })

  it('lascia disponibile solo la riserva quando i quattro titolari sono completi', () => {
    const guest: SessionUser = {
      id: 'guest',
      displayName: 'Guest',
      email: 'guest@example.test',
      createdAt: 2,
    }
    const fullSlot: PadelSlot = {
      ...slot,
      signups: ['a', 'b', 'c', 'd'].map((id, index) => ({
        id: `signup-${id}`,
        userId: id,
        displayName: id.toUpperCase(),
        joinedAt: index,
        role: 'starter',
      })),
    }

    render(
      <SlotCard
        poll={{ ...poll, slots: [fullSlot] }}
        slot={fullSlot}
        user={guest}
        members={[guest]}
        onPollChange={vi.fn()}
        onNotify={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Segnati come titolare' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Segnati come riserva' })).toBeEnabled()
  })

  it('permette a un membro di aggiungere un ospite come titolare', async () => {
    const emptySlot = { ...slot, signups: [] }
    const guestSignup = {
      id: 'signup-guest',
      userId: 'guest-ciccio',
      displayName: 'Ciccio',
      joinedAt: 2,
      role: 'starter' as const,
      isGuest: true,
      addedBy: user.id,
      addedByName: user.displayName,
    }
    const updatedPoll = {
      ...poll,
      slots: [{ ...emptySlot, signups: [guestSignup] }],
    }
    const addGuest = vi.spyOn(repository, 'addGuest').mockResolvedValue(updatedPoll)

    render(
      <SlotCard
        poll={{ ...poll, slots: [emptySlot] }}
        slot={emptySlot}
        user={user}
        members={[user]}
        onPollChange={vi.fn()}
        onNotify={vi.fn()}
        onError={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Aggiungi un ospite allo slot/ }))
    fireEvent.change(screen.getByLabelText('Nome dell’ospite'), { target: { value: 'Ciccio' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi ospite' }))

    await waitFor(() => {
      expect(addGuest).toHaveBeenCalledWith(poll.id, slot.id, user, 'Ciccio', 'starter')
    })
  })

  it('permette a un membro di rimuovere un ospite aggiunto da un altro membro', async () => {
    const guestSignup = {
      id: 'signup-guest',
      userId: 'guest-ciccio',
      displayName: 'Ciccio',
      joinedAt: 2,
      role: 'starter' as const,
      addedBy: 'luigi',
      addedByName: 'Luigi',
    }
    const guestSlot = { ...slot, signups: [guestSignup] }
    const updatedPoll = { ...poll, slots: [{ ...guestSlot, signups: [] }] }
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const removeGuest = vi.spyOn(repository, 'removeGuest').mockResolvedValue(updatedPoll)

    render(
      <SlotCard
        poll={{ ...poll, slots: [guestSlot] }}
        slot={guestSlot}
        user={user}
        members={[user]}
        onPollChange={vi.fn()}
        onNotify={vi.fn()}
        onError={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi l’ospite Ciccio dallo slot' }))

    await waitFor(() => {
      expect(removeGuest).toHaveBeenCalledWith(poll.id, slot.id, user, guestSignup.id)
    })
  })

  it('mostra i controlli amministrativi soltanto all’amministratore', () => {
    const { rerender } = render(
      <SlotCard
        poll={poll}
        slot={slot}
        user={user}
        members={[user]}
        onPollChange={vi.fn()}
        onNotify={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: /Gestisci i giocatori dello slot/ })).not.toBeInTheDocument()

    const admin = { ...user, id: SLOT_ADMIN_USER_ID }
    rerender(
      <SlotCard
        poll={poll}
        slot={slot}
        user={admin}
        members={[admin, user]}
        onPollChange={vi.fn()}
        onNotify={vi.fn()}
        onError={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Gestisci i giocatori dello slot/ }))
    expect(screen.getByRole('dialog', { name: 'Gestisci giocatori' })).toBeInTheDocument()
    expect(screen.getByText('Modifica diretta della formazione')).toBeInTheDocument()
  })
})
