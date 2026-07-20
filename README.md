# Bandeja Boys

Mini sito privato per organizzare le partite di padel del gruppo: sondaggi settimanali, quattro titolari in ordine di adesione, riserve, sostituzioni e conferma del campo.

## Online

Il sito è disponibile su [bandeja-boys.web.app](https://bandeja-boys.web.app). L'istanza usa il progetto Firebase `bandeja-boys` sul piano gratuito Spark, senza account di fatturazione collegato.

## Cosa fa

- Registrazione e accesso con email e password; il nome inserito nel profilo resta l’unico nome mostrato nell’interfaccia e non viene mai ricavato dall’indirizzo email.
- Creazione di un sondaggio per la settimana successiva con uno o più slot, duplicabili al giorno seguente mantenendo ora e durata.
- Modifica di data e ora degli slot già pubblicati senza perdere adesioni, riserve o prenotazione.
- Scelta esplicita al momento dell’adesione: ogni giocatore può segnarsi come **Titolare** oppure direttamente come **Riserva**. I quattro posti da titolare e la lista d’attesa mantengono l’ordine cronologico.
- Promozione automatica della prima riserva quando un titolare si ritira da una formazione completa.
- Sostituzione diretta: un titolare passa la propria posizione a un altro membro; se il sostituto era in riserva, il suo vecchio posto viene rimosso. Un tooltip accessibile chiarisce l’effetto prima dell’azione.
- Stato dello slot immediatamente leggibile: raccolta adesioni, da prenotare, campo prenotato. L’azione **Segna come prenotato** registra con un solo tocco la prenotazione all’**Oasi Boschetto**, anche prima di raggiungere quattro giocatori.
- Filtro della bacheca sempre disponibile sotto l’header: **Tutti** mostra gli slot dei sondaggi aperti e archiviati, mentre **Slot prenotati** raccoglie soltanto le partite con campo confermato.
- Autore della conferma e archivio dei sondaggi chiusi.
- Aggiornamenti in tempo reale su tutti i dispositivi quando Firebase è configurato.
- Notifiche Web Push opzionali per nuovi sondaggi e, per chi è tra i quattro titolari, reminder a 24 ore e 2 ore dalla partita anche quando il sondaggio è già archiviato.
- Installazione come web app su Android, iPhone, iPad e desktop tramite manifest PWA.

## Stack e costo

- React, TypeScript e Vite per l'applicazione statica.
- Firebase Authentication per gli account.
- Cloud Firestore per la sincronizzazione in tempo reale.
- Firebase Hosting per SSL e sottodominio gratuito `web.app`.
- Web Push standard per il recapito delle notifiche, senza servizi a pagamento.
- GitHub Actions ogni 30 minuti per elaborare gli avvisi anche quando il sito è chiuso.

Il progetto usa solo servizi disponibili nel piano Spark, che non richiede un metodo di pagamento. Per un gruppo ristretto, le quote gratuite di Firestore e Hosting sono molto superiori al traffico previsto. Riferimenti: [piani Firebase](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans) e [Firebase Hosting](https://firebase.google.com/docs/hosting/quickstart).

Il workflow notifiche esegue 48 controlli al giorno. Su un runner Linux ogni esecuzione dura normalmente meno di un minuto, rimanendo entro i minuti mensili inclusi per i repository privati GitHub Free. Il workflow ha comunque un limite rigido di 5 minuti per evitare consumi anomali.

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

Le notifiche richiedono una coppia VAPID Web Push e un account Firebase Authentication tecnico verificato. L’account tecnico è riconosciuto dalle Security Rules tramite email verificata e può soltanto leggere sondaggi e sottoscrizioni, scrivere le ricevute di consegna ed eliminare dispositivi scaduti; non può creare o modificare partite.

Configurazione GitHub del repository:

- variabile `WEB_PUSH_VAPID_PUBLIC_KEY`, uguale a `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`;
- secret `WEB_PUSH_VAPID_PRIVATE_KEY`;
- secret `FIREBASE_NOTIFIER_EMAIL`;
- secret `FIREBASE_NOTIFIER_PASSWORD`.

Il workflow [`.github/workflows/notifications.yml`](.github/workflows/notifications.yml) parte ai minuti `07` e `37` di ogni ora e può essere avviato manualmente per il collaudo. Non inserire mai le chiavi private in file locali versionati o nei log.

Su Android e desktop l’attivazione avviene direttamente dal pannello mostrato al primo accesso. Su iPhone e iPad Web Push è disponibile per le web app aggiunte alla schermata Home: il sito mostra prima le istruzioni di installazione, poi richiede il permesso quando viene aperto dalla nuova icona.

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
| `npm run assets:icons` | rigenera le icone PWA dal favicon SVG |
| `npm run check` | lint, test, build e typecheck notifiche |

Prima di ogni commit o deploy deve passare `npm run check`.

## Modello di sicurezza

- Solo gli utenti autenticati possono leggere membri e sondaggi.
- Ogni utente può creare o aggiornare soltanto il proprio profilo.
- Qualunque membro autenticato può aderire, ritirarsi, fare una sostituzione o segnare una prenotazione: è una scelta intenzionale per un piccolo gruppo fidato.
- Ogni membro può creare, sostituire o eliminare soltanto la sottoscrizione push del proprio dispositivo.
- L’account tecnico verificato non può modificare utenti, sondaggi o partite; le sue letture e scritture sono limitate al recapito delle notifiche.
- Soltanto chi ha creato un sondaggio può eliminarlo; nell'interfaccia l'autore può archiviarlo o riaprirlo.
- Gli aggiornamenti agli slot avvengono con transazioni Firestore per non perdere l'ordine quando due persone agiscono quasi contemporaneamente.

La struttura e gli invarianti completi sono descritti in [docs/architecture.md](docs/architecture.md).

## Limiti intenzionali

- Non esistono ruoli amministrativi o gruppi multipli: l'istanza è pensata per un'unica cerchia di amici.
- Non vengono inviate email automatiche; gli avvisi Web Push sono facoltativi e possono essere disattivati per ciascun dispositivo.
- Il codice non usa Cloud Functions, così resta compatibile con il piano gratuito senza collegare un account di fatturazione.
