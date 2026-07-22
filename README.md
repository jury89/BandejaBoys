# Bandeja Boys

Mini sito privato per organizzare le partite di padel del gruppo: sondaggi settimanali, quattro titolari in ordine di adesione, riserve, sostituzioni e conferma del campo.

## Online

Il sito è disponibile su [bandeja-boys.web.app](https://bandeja-boys.web.app). L'istanza usa il progetto Firebase `bandeja-boys` sul piano gratuito Spark, senza account di fatturazione collegato.

## Cosa fa

- Registrazione e accesso con email e password; dal menu account ogni giocatore può cambiare soltanto il nome visibile e aggiungere o rimuovere una foto profilo. Il menu si chiude al primo clic o tocco esterno e con il tasto `Esc`, senza interrompere le interazioni al suo interno. Email e password non sono modificabili dalla sezione profilo. Il nome resta l’unico mostrato nell’interfaccia e non viene mai ricavato dall’indirizzo email; un cambio nome che contiene la sottostringa `Evi`, senza distinzione tra maiuscole e minuscole, viene rifiutato mostrando il bordo rosso e l’errore direttamente sotto il campo.
- Creazione di un sondaggio per la settimana successiva con uno o più slot, duplicabili al giorno seguente mantenendo ora e durata. Data, ora e minuti hanno controlli separati anche su iPhone, e i minuti disponibili sono soltanto `00` e `30`: ogni slot resta automaticamente **Orario indicativo** finché il campo non viene prenotato, poi passa a **Orario confermato**. Qualunque membro può aggiungere in seguito un nuovo slot a un sondaggio ancora aperto; la proposta parte dal giorno successivo all’ultimo slot.
- Modifica di data e ora degli slot già pubblicati senza perdere adesioni, riserve o prenotazione. Ogni slot può anche essere eliminato, finché ne resta almeno uno nel sondaggio: la conferma chiarisce che adesioni e riserve verranno rimosse e, per un campo prenotato, ricorda di annullare anche presso l’Oasi Boschetto.
- Aggiunta diretta di ogni slot al calendario personale: un clic sull’icona apre l’anteprima di sistema su iPhone o scarica un evento `.ics`, con ora locale italiana, durata, Oasi Boschetto e stato indicativo o confermato già compilati. Il file include la definizione CET/CEST, così l’orario proposto non viene spostato durante l’importazione. Le azioni Calendario, Modifica ed Elimina usano icone compatte con etichette accessibili.
- Su iPhone tutti i controlli delle form mantengono almeno `16px`, il viewport disabilita lo zoom e data, ora e minuti si dispongono su due righe senza sovrapporsi né uscire dai bordi del modal. I modal impostano il focus iniziale una sola volta e non lo sottraggono al calendario durante gli aggiornamenti.
- Il logo conserva il lime fluorescente originale e unisce le due parole in una targhetta compatta: **BANDEJA** poggia su un fondo acquamarina chiaro, mentre **BOYS** prosegue senza spazio su un riquadro blu con giunzione diagonale. Il padding verticale compensa otticamente le metriche del font anche su iPhone.
- Scelta esplicita al momento dell’adesione: ogni giocatore può segnarsi come **Titolare** oppure direttamente come **Riserva**. I quattro posti da titolare e la lista d’attesa mantengono l’ordine cronologico.
- Promozione automatica della prima riserva quando un titolare si ritira da una formazione completa.
- Sostituzione diretta: un titolare passa la propria posizione a un altro membro; se il sostituto era in riserva, il suo vecchio posto viene rimosso. Un tooltip accessibile chiarisce l’effetto prima dell’azione.
- Stato dello slot immediatamente leggibile: raccolta adesioni, da prenotare, campo prenotato. Nella griglia desktop una fascia uniforme mantiene allineati campo, riserve e azioni: verde pieno per **Campo prenotato**, ambra per **Campo da prenotare**. L’azione **Segna come prenotato** registra con un solo tocco la prenotazione all’**Oasi Boschetto**, anche prima di raggiungere quattro giocatori.
- Filtro della bacheca sempre disponibile sotto l’header: **Tutti** mostra ogni slot futuro, **Da prenotare** raccoglie esclusivamente quelli con quattro titolari e campo non confermato, mentre **Prenotati** mostra soltanto le partite con campo confermato. Le riserve non concorrono al conteggio dei quattro giocatori. I sondaggi aperti e archiviati restano ordinati dal primo slot più vicino; uno slot scompare dalla bacheca quando raggiunge il proprio orario di inizio, senza essere eliminato da Firestore.
- Pagina personale **I miei match**, raggiungibile dal menu account: mostra in ordine cronologico soltanto i prossimi slot completi, con quattro titolari incluso il giocatore, distinguendo i campi confermati da quelli ancora da prenotare; conserva inoltre a ritroso lo storico delle partite complete, prenotate e concluse. Slot vuoti o incompleti, adesioni come riserva e vecchie proposte mai diventate partite non vengono inclusi.
- Autore della conferma e archivio dei sondaggi chiusi.
- Pagelle post partita: dieci minuti dopo la fine di un campo prenotato, ciascuno dei quattro titolari riceve una notifica e trova nell’app una scheda per assegnare da 1 a 10 agli altri tre. Il salvataggio conserva partita, autore, destinatario e timestamp; chi chiude la scheda la elimina definitivamente soltanto per sé. Per ora i voti restano nello storico e non vengono mostrati o aggregati nell’interfaccia.
- Storico verificabile delle azioni organizzative: creazione, spostamento ed eliminazione degli slot, adesioni, ritiri, sostituzioni, conferme o annullamenti del campo e stato del sondaggio vengono salvati come eventi immutabili con utente e ora del server. Una visualizzazione viene registrata soltanto dopo che almeno metà della scheda è rimasta visibile per un secondo; per ogni utente e slot si conservano prima visita, ultima visita e conteggio, con un solo incremento per sessione del browser.
- Aggiornamenti in tempo reale su tutti i dispositivi quando Firebase è configurato.
- Notifiche Web Push opzionali per i nuovi slot disponibili e, per chi è tra i quattro titolari, l’avviso che la formazione è completa, un secondo promemoria a una settimana dalla partita se il campo è ancora da prenotare, i reminder a 24 ore e 2 ore dalla partita prenotata e la richiesta delle pagelle a fine sessione. Gli avvisi di prenotazione non partono se il campo è già confermato; gli slot inseriti entro 10 minuti l’uno dall’altro vengono riuniti in un solo avviso.
- Installazione come web app su Android, iPhone, iPad e desktop tramite manifest PWA.

## Stack e costo

- React, TypeScript e Vite per l'applicazione statica.
- Firebase Authentication per gli account.
- Cloud Firestore per la sincronizzazione in tempo reale.
- Firebase Hosting per SSL e sottodominio gratuito `web.app`.
- Web Push standard per il recapito delle notifiche, senza servizi a pagamento.
- Un Cron Trigger Cloudflare Workers ogni 10 minuti avvia il workflow GitHub Actions che elabora gli avvisi anche quando il sito è chiuso.

Il progetto usa solo servizi gratuiti e non richiede un metodo di pagamento. Le foto profilo non usano Firebase Storage, che dal 2026 richiede il piano Blaze: vengono ritagliate e compresse nel browser a `160×160` pixel e salvate come piccolo Data URL nel documento Firestore del proprietario, con un limite di 100.000 caratteri applicato anche dalle Security Rules. Per un gruppo ristretto, le quote gratuite di Firestore e Hosting sono molto superiori al traffico previsto; lo scheduler usa 144 delle 100.000 richieste giornaliere incluse nel piano gratuito Cloudflare Workers. Riferimenti: [piani Firebase](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), [quote Firestore](https://firebase.google.com/docs/firestore/quotas), [modifiche ai requisiti di Cloud Storage](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024), [Firebase Hosting](https://firebase.google.com/docs/hosting/quickstart) e [limiti Cloudflare Workers](https://developers.cloudflare.com/workers/platform/limits/).

Il repository GitHub è pubblico per utilizzare gratuitamente i runner standard senza consumare il monte minuti dei repository privati. Il sito resta ad accesso riservato: codice e configurazione Firebase pubblica non contengono password, dati degli utenti o chiavi private, mentre Firebase Authentication e le Security Rules proteggono i dati condivisi. Cloudflare effettua 144 risvegli al giorno; ogni run GitHub mantiene un limite rigido di 5 minuti per evitare esecuzioni anomale.

GitHub può disattivare i workflow pianificati di un repository pubblico dopo 60 giorni senza attività. [`.github/workflows/keepalive.yml`](.github/workflows/keepalive.yml) esegue il controllo completo del progetto e aggiorna mensilmente `.github/keepalive.txt` con un commit automatico, mantenendo attivi i controlli. Può essere avviato manualmente per verificarne il funzionamento; se fosse già disattivato, va prima riabilitato dalla scheda Actions o tramite API GitHub.

## Avvio locale

Requisiti: Node.js 22 o successivo.

```bash
npm install
npm run dev
```

Senza variabili Firebase, l'app parte in **modalità demo locale**. Account e sondaggi vengono salvati solo nel `localStorage` del browser; questa modalità serve per sviluppo e collaudo, non per l'uso condiviso.

## Configurazione Firebase

L'istanza di produzione è già configurata; i passaggi seguenti servono soltanto per creare un ambiente Firebase alternativo.

1. Crea un progetto dal [pannello Firebase](https://console.firebase.google.com/) scegliendo il piano Spark.
2. Registra una Web App nel progetto e copia la configurazione proposta.
3. In Authentication abilita il provider **Email/Password**.
4. Crea un database Cloud Firestore in modalità produzione, preferibilmente in una regione europea.
5. Copia `.env.example` in `.env.local` e compila i valori `VITE_FIREBASE_*` e `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`. Il repository include già `.env.production` con la configurazione Web pubblica dell'istanza di produzione.
6. Collega la CLI al progetto e pubblica regole e sito:

```bash
npx firebase-tools login
npx firebase-tools use --add
npm run check
npx firebase-tools deploy --only firestore:rules,firestore:indexes,hosting
```

La configurazione Web Firebase non è un segreto: l'accesso ai dati è protetto da Authentication e da `firestore.rules`. Non inserire mai nel repository service account, token CLI o chiavi amministrative.

## Configurazione notifiche

Le notifiche richiedono una coppia VAPID Web Push e un account Firebase Authentication tecnico verificato. L’account tecnico è riconosciuto dalle Security Rules tramite email verificata e può soltanto leggere sondaggi, sottoscrizioni ed esiti chiuso/inviato delle pagelle, scrivere le ricevute di consegna ed eliminare dispositivi scaduti; non può leggere i voti, creare o modificare partite.

Configurazione GitHub del repository:

- variabile `WEB_PUSH_VAPID_PUBLIC_KEY`, uguale a `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`;
- secret `WEB_PUSH_VAPID_PRIVATE_KEY`;
- secret `FIREBASE_NOTIFIER_EMAIL`;
- secret `FIREBASE_NOTIFIER_PASSWORD`.

Il Worker [`scheduler/worker.js`](scheduler/worker.js) parte ogni 10 minuti, ai minuti `03`, `13`, `23`, `33`, `43` e `53`, e usa `workflow_dispatch` per avviare [`.github/workflows/notifications.yml`](.github/workflows/notifications.yml). Questo evita i ritardi occasionali dei cron GitHub senza spostare su Cloudflare le credenziali Firebase o VAPID. Un nuovo slot resta in attesa per 10 minuti dall’ultima aggiunta ravvicinata: così la creazione iniziale di cinque slot genera un solo avviso, mentre uno slot aggiunto il giorno seguente genera un nuovo avviso. Con la cadenza del Worker la consegna avviene normalmente tra 10 e 20 minuti dall’ultima aggiunta. Dopo che il servizio push accetta l’invio, `notificationDeliveries` salva anche il titolo e il testo effettivamente spediti, oltre a evento, destinatario, dispositivo e timestamp. L’avvio manuale senza parametri elabora la coda ordinaria; specificando `test_user_id` invia invece un’unica notifica ai dispositivi di quell’utente. Il campo facoltativo `test_message` permette di personalizzarne il testo fino a 240 caratteri. Selezionando `test_mode: pagelle`, la vera Web Push apre una pagella marcata **TEST** con gli stessi controlli della scheda reale: chiusura e completamento non scrivono voti, risposte o partite in Firestore.

Lo scheduler richiede un token GitHub fine-grained limitato al solo repository `BandejaBoys`, con permesso repository **Actions: Read and write**. Il token viene salvato esclusivamente come secret cifrato `GITHUB_TOKEN` del Worker e non deve mai comparire in file, log o variabili versionate:

```bash
npx wrangler login
npx wrangler secret put GITHUB_TOKEN --config scheduler/wrangler.jsonc
npm run scheduler:deploy
```

Su Android e desktop l’attivazione avviene direttamente dal pannello mostrato al primo accesso. Su iPhone e iPad Web Push è disponibile per le web app aggiunte alla schermata Home: il sito mostra prima le istruzioni di installazione, poi richiede il permesso quando viene aperto dalla nuova icona. Chi sceglie **Non mostrare più** nel browser salva la preferenza in modo persistente per il proprio account e non rivede il pannello agli accessi successivi.

Se il browser non restituisce l’esito del permesso entro 15 secondi, l’interfaccia interrompe l’attesa e permette di riprovare senza rimanere bloccata su “Attivazione…”.

## Comandi

| Comando | Scopo |
| --- | --- |
| `npm run dev` | server locale con hot reload |
| `npm run lint` | controllo statico del codice |
| `npm test` | test unitari e di integrazione |
| `npm run build` | typecheck e build di produzione |
| `npm run notifications:typecheck` | typecheck del processo notifiche |
| `npm run notifications:send` | elabora manualmente la coda; richiede i secret |
| `npm run scheduler:check` | valida e crea localmente il bundle del Worker senza pubblicarlo |
| `npm run scheduler:deploy` | pubblica il Worker e il calendario Cloudflare |
| `npm run assets:icons` | rigenera le icone PWA dal favicon SVG |
| `npm run check` | lint, test, build, typecheck notifiche e validazione Worker |

Prima di ogni commit o deploy deve passare `npm run check`.

## Modello di sicurezza

- Solo gli utenti autenticati possono leggere membri e sondaggi.
- Ogni utente può creare o aggiornare soltanto il proprio profilo.
- Le foto profilo accettate dalle regole sono esclusivamente Data URL immagine entro 100.000 caratteri; email e data di creazione del profilo restano immutabili.
- Qualunque membro autenticato può aggiungere o eliminare uno slot da un sondaggio aperto, aderire, ritirarsi, fare una sostituzione o segnare una prenotazione: è una scelta intenzionale per un piccolo gruppo fidato.
- Le azioni organizzative vengono aggiunte a uno storico immutabile nella stessa transazione della modifica. I membri possono leggere lo storico e le visualizzazioni del gruppo, ma non modificarli o cancellarli; ogni utente può incrementare soltanto la propria visualizzazione.
- Ogni membro può creare, sostituire o eliminare soltanto la sottoscrizione push del proprio dispositivo.
- L’account tecnico verificato non può modificare utenti, sondaggi o partite; le sue letture e scritture sono limitate al recapito delle notifiche.
- Soltanto chi ha creato un sondaggio può eliminarlo; nell'interfaccia l'autore può archiviarlo o riaprirlo.
- Gli aggiornamenti agli slot avvengono con transazioni Firestore per non perdere l'ordine quando due persone agiscono quasi contemporaneamente.

La struttura e gli invarianti completi sono descritti in [docs/architecture.md](docs/architecture.md).

## Limiti intenzionali

- Non esistono ruoli amministrativi o gruppi multipli: l'istanza è pensata per un'unica cerchia di amici.
- Non vengono inviate email automatiche; gli avvisi Web Push sono facoltativi e possono essere disattivati per ciascun dispositivo.
- Il codice non usa Cloud Functions, così resta compatibile con il piano gratuito senza collegare un account di fatturazione.
