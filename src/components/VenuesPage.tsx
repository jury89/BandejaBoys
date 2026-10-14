import { ArrowLeft, ExternalLink, MapPin, Phone } from 'lucide-react'
import { useState } from 'react'
import { VENUES } from '../lib/venues'

const TCM_URL = 'https://www.tennisclubmantova.com/'
const SPORT_URL = 'https://www.mantovasportcity.it/servizi/'
const TIME_URL = 'https://www.anytimes.it/club/time-to-padel/'

export function VenuesPage({ selectedId, onBack }: { selectedId: string; onBack: () => void }) {
  const venue = VENUES.find((item) => item.id === selectedId && item.id !== 'oasi-boschetto')
  const [openedAt] = useState(() => Date.now())
  const summerExpired = openedAt >= Date.parse('2026-11-01T00:00:00+01:00')
  return <main className="venues-page">
    <button className="button button--ghost" type="button" onClick={onBack}><ArrowLeft size={18} /> Torna alla bacheca</button>
    <header className="venues-page__hero"><p className="eyebrow">Dove si gioca</p><h1>Campi e costi</h1>
      <p>Scegli il circolo, organizza la partita. La prenotazione del campo si fa direttamente con la struttura.</p>
    </header>
    <nav className="venue-page-nav" aria-label="Informazioni sui circoli">
      {VENUES.filter((item) => item.id !== 'oasi-boschetto').map((item) => <a key={item.id} href={`#campi/${item.id}`} aria-current={venue?.id === item.id ? 'page' : undefined}>{item.name}</a>)}
    </nav>
    {!venue ? <section className="venue-info-card"><h2>I nostri circoli</h2>
      <p>Apri una scheda qui sopra per tariffe e iscrizione. Puoi scegliere i tuoi campi preferiti nel profilo.</p>
      <p>Continuiamo a giocare anche all’Oasi Boschetto. <a href="tel:+390376290058">Segreteria Oasi: 0376 290058</a></p>
    </section> : <article className="venue-info-card">
      <header><p className="eyebrow">Il circolo</p><h2>{venue.name}</h2><p className="venue-address"><MapPin size={18} /> {venue.address}</p></header>
      {venue.id === 'tennis-club-mantova' ? <>
        <section><h3>Quanto costa giocare</h3>
          <p><strong>Tariffe estive 2026 · 90 minuti, a persona</strong><br />Validità pubblicata: 1 aprile – 31 ottobre 2026.</p>
          {summerExpired && <p className="venue-notice" role="status">Questo listino è scaduto. Chiedi le tariffe aggiornate al circolo prima di prenotare.</p>}
          <div className="venue-price-table"><table><caption>Padel: diurno 08–18, serale 18–22:30</caption>
            <thead><tr><th scope="col">Campo / giocatore</th><th scope="col">Diurno</th><th scope="col">Serale</th></tr></thead>
            <tbody><tr><th scope="row">Coperto · socio</th><td>7 €</td><td>8 €</td></tr>
              <tr><th scope="row">Coperto · non socio</th><td>8 €</td><td>10 €</td></tr>
              <tr><th scope="row">Scoperto · tutti</th><td>5 €</td><td>6 €</td></tr></tbody>
          </table></div>
          <p>Luci diurne extra su richiesta. <a href={TCM_URL} target="_blank" rel="noreferrer">Listino ufficiale completo</a>.</p>
        </section>
        <section><h3>Come iscriversi e prenotare</h3>
          <ol><li>Compila il <a href="https://tennisclubmantova.com/wp-content/uploads/2024/05/precensimento.pdf" target="_blank" rel="noreferrer">modulo di registrazione anagrafica</a> e restituiscilo seguendo le istruzioni del circolo.</li>
            <li>Una volta abilitato, usa <a href="https://tennisclubmantova.wansport.com/" target="_blank" rel="noreferrer">Wansport TC Mantova</a> per prenotare.</li></ol>
          <p>Per assistenza: <a href="mailto:segreteria@tennisclubmantova.com">segreteria@tennisclubmantova.com</a>.</p>
        </section>
        <aside className="venue-notice"><h3>Da confermare con il circolo</h3><p>Quota associativa e tesseramento (nuovi iscritti e rinnovi), documenti/certificato richiesti e listino invernale 2026/27. Non abbiamo un prezzo aggiornato verificabile: non usiamo le tariffe degli anni passati.</p></aside>
      </> : venue.id === 'time-to-padel' ? <>
        <section><h3>Il centro</h3>
          <p>Tre campi da padel indoor panoramici a Gazoldo degli Ippoliti, con lounge bar e corner shop.</p>
          <p>Indirizzo e servizi sono riportati nella <a href={TIME_URL} target="_blank" rel="noreferrer">scheda del circolo su AnyTimes</a>.</p>
        </section>
        <section><h3>Quanto costa giocare</h3>
          <p>Il listino aggiornato non è pubblicato nella scheda del circolo. Verifica la tariffa per la durata e l’orario scelti prima di prenotare.</p>
        </section>
        <section><h3>Come iscriversi e prenotare</h3>
          <p>Usa <a href="https://timetopadel.anytimes.it/" target="_blank" rel="noreferrer">AnyTimes Time to Padel</a> per controllare le disponibilità e prenotare con il tuo account.</p>
          <p>Dopo aver prenotato con il circolo, usa <strong>Segna come prenotato</strong> nello slot di Bandeca per confermare il campo al gruppo.</p>
        </section>
        <aside className="venue-notice"><h3>Da confermare con il circolo</h3><p>Tariffe, quota e durata del tesseramento, procedura d’iscrizione e documenti/certificato richiesti.</p></aside>
      </> : <>
        <section><h3>Quanto costa giocare</h3>
          <p className="venue-price-lead">Da 40 € / ora <span>indicazione del sito, non un preventivo</span></p>
          <p>Il <a href={SPORT_URL} target="_blank" rel="noreferrer">sito ufficiale</a> riporta questa tariffa per il padel indoor. Non chiarisce la quota per giocatore né il costo di 90 minuti: chiedi conferma prima di prenotare.</p>
          <p>Qui lo slot “Sport City Mantova” indica la sede indoor di via Palmiro Azzi 5. Il sito elenca anche un impianto outdoor in viale Fiume 11.</p>
        </section>
        <section><h3>Come iscriversi e prenotare</h3><p>La <a href="https://www.mantovasportcity.it/contatti/" target="_blank" rel="noreferrer">pagina contatti ufficiale</a> permette di contattare la segreteria e scaricare l’app del circolo per le prenotazioni. Chiedi l’abilitazione e i requisiti per il tesseramento.</p></section>
        <aside className="venue-notice"><h3>Da confermare con il circolo</h3><p>Costo e durata del tesseramento, procedura d’iscrizione e documenti/certificato richiesti; prezzo di una partita da 90 minuti e differenze per fascia oraria, luci e riscaldamento. Le informazioni pubbliche non sono sufficienti per indicare un totale affidabile.</p></aside>
      </>}
      <footer className="venue-info-card__footer">
        {venue.phone && <a className="button button--secondary" href={`tel:${venue.phone}`}><Phone size={18} /> Chiama il circolo</a>}
        <a className="button button--secondary" href={venue.website} target="_blank" rel="noreferrer"><ExternalLink size={18} /> {venue.id === 'time-to-padel' ? 'Scheda del circolo' : 'Sito ufficiale'}</a>
        <small>Fonti consultate il {venue.id === 'time-to-padel' ? '14 ottobre 2026' : '15 settembre 2026'}. Prezzi e condizioni possono cambiare: la conferma spetta al circolo.</small>
      </footer>
    </article>}
  </main>
}
