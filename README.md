# Bandeja Boys

Mini sito privato per organizzare le partite di padel del gruppo: sondaggi settimanali, quattro titolari in ordine di adesione, riserve, sostituzioni, conferma del campo e campionato FantaBandeja.

## Online

Il sito è disponibile su [bandeja-boys.web.app](https://bandeja-boys.web.app). L'istanza usa il progetto Firebase `bandeja-boys` sul piano gratuito Spark, senza account di fatturazione collegato.

## Cosa fa

- Registrazione e accesso con email e password; dal menu account ogni giocatore può cambiare soltanto il nome visibile, aggiungere o rimuovere una foto profilo e scegliere quali categorie di notifica ricevere. Le nove preferenze indipendenti coprono sveglia del lunedì, nuovi slot, formazione completa, sostituzioni, campo da prenotare, partita a 24 ore, partita a 2 ore, pagelle e FantaBandeja; la scelta vale per tutti i dispositivi dell’account. Il menu si chiude al primo clic o tocco esterno e con il tasto `Esc`, senza interrompere le interazioni al suo interno. Email e password non sono modificabili dalla sezione profilo. Il nome resta l’unico mostrato nell’interfaccia e non viene mai ricavato dall’indirizzo email; un cambio nome che contiene la sottostringa `Evi`, senza distinzione tra maiuscole e minuscole, viene rifiutato mostrando il bordo rosso e l’errore direttamente sotto il campo.
- Creazione di un sondaggio per la settimana successiva con uno o più slot, duplicabili al giorno seguente mantenendo ora e durata. Ogni settimana va sempre da lunedì a domenica: anche selezionando un altro giorno, la form lo riconduce al lunedì corrispondente. Il nome non va compilato e viene generato dall’intervallo, per esempio **Padel · 27 lug – 2 ago 2026**, così ogni sondaggio resta riconoscibile anche negli avvisi. Data, ora e minuti hanno controlli separati anche su iPhone, e i minuti disponibili sono soltanto `00` e `30`: ogni slot resta automaticamente **Orario indicativo** finché il campo non viene prenotato, poi passa a **Orario confermato**. Giorno e ora vengono sempre interpretati e mostrati nel fuso dell’Oasi Boschetto (`Europe/Rome`), indipendentemente dal fuso configurato sul telefono. Qualunque membro può aggiungere in seguito un nuovo slot a un sondaggio ancora aperto; la proposta parte dal giorno successivo all’ultimo slot.
- Modifica di data e ora degli slot già pubblicati senza perdere adesioni, riserve o prenotazione. Ogni slot può anche essere eliminato, finché ne resta almeno uno nel sondaggio: la conferma chiarisce che adesioni e riserve verranno rimosse e, per un campo prenotato, ricorda di annullare anche presso l’Oasi Boschetto.
- Aggiunta diretta di ogni slot al calendario personale: un clic sull’icona apre l’anteprima di sistema su iPhone o scarica un evento `.ics`, con ora locale italiana, durata, Oasi Boschetto e stato indicativo o confermato già compilati. Il file include la definizione CET/CEST, così l’orario proposto non viene spostato durante l’importazione. Le azioni Calendario, Cronologia, Modifica ed Elimina usano icone compatte con etichette accessibili.
- Su iPhone tutti i controlli delle form mantengono almeno `16px`, il viewport disabilita lo zoom e data, ora e minuti si dispongono su due righe senza sovrapporsi né uscire dai bordi del modal. I modal impostano il focus iniziale una sola volta e non lo sottraggono al calendario durante gli aggiornamenti.
- La web app installata controlla la release pubblicata all’apertura, al ritorno in primo piano, al recupero della connessione e ogni cinque minuti. Se trova una versione nuova, ricarica con un parametro cache-busting conservando eventuali deep link; un tentativo recente evita cicli di refresh, ma dopo 30 secondi la stessa release torna ritentabile se WebKit ha riproposto il vecchio documento. In questo modo gli aggiornamenti arrivano su iPhone senza reinstallare l’app. Un aggiornamento ponte del service worker forza inoltre una navigazione cache-busting per recuperare le vecchie installazioni iOS che precedono questo controllo o sono rimaste ferme su un tentativo fallito.
- In qualsiasi pagina autenticata su mobile si può trascinare verso il basso partendo dalla cima del contenuto visibile: superata la soglia, al rilascio il pull-to-refresh ricarica dati e applicazione con un URL univoco, conservando filtri e deep link. Il gesto funziona anche in “I miei match”, “Gli altri match”, “FantaBandeja”, “Le mie notifiche”, nel profilo e nei form aperti come modal, ma si arma soltanto se il relativo contenitore di scroll è già in cima.
- Il logo conserva il lime fluorescente originale e unisce le due parole in una targhetta compatta: **BANDEJA** poggia su un fondo acquamarina chiaro, mentre **BOYS** prosegue senza spazio su un riquadro blu con giunzione diagonale. Il padding verticale compensa otticamente le metriche del font anche su iPhone.
- Scelta esplicita al momento dell’adesione: ogni giocatore può segnarsi come **Titolare** oppure direttamente come **Riserva**. I quattro posti da titolare e la lista d’attesa mantengono l’ordine cronologico.
- Giocatori ospiti senza account: qualunque membro può usare l’icona con la persona e il `+`, scrivere un nome e aggiungere un esterno come **Titolare** o **Riserva**. L’ospite entra nello stesso ordine cronologico degli altri, può completare la formazione da quattro ed essere rimosso dalla scheda; la prima riserva viene promossa con le regole normali. La targhetta tratteggiata **Ospite** lo distingue dai membri registrati. Non avendo un account, non riceve push e non compare tra i destinatari delle pagelle; aggiunta e rimozione conservano nell’audit il membro che le ha eseguite.
- Promozione automatica della prima riserva quando un titolare si ritira da una formazione completa.
- Sostituzione diretta: un titolare passa la propria posizione a un altro membro; se il sostituto era in riserva, il suo vecchio posto viene rimosso. Un tooltip accessibile chiarisce l’effetto prima dell’azione e il nuovo titolare riceve una push personale con il nome di chi ha sostituito e l’orario della partita.
- Stato dello slot immediatamente leggibile: raccolta adesioni, da prenotare, campo prenotato. Nella griglia desktop una fascia uniforme mantiene allineati campo, riserve e azioni: verde pieno per **Campo prenotato**, ambra per **Campo da prenotare**. L’azione **Segna come prenotato** registra con un solo tocco la prenotazione all’**Oasi Boschetto**, anche prima di raggiungere quattro giocatori.
- Filtro della bacheca sempre disponibile sotto l’header: **Tutti** mostra ogni slot futuro o in corso, **Da prenotare** raccoglie esclusivamente quelli con quattro titolari e campo non confermato, mentre **Prenotati** mostra soltanto le partite con campo confermato. Le riserve non concorrono al conteggio dei quattro giocatori. Ogni sondaggio può nascondere e riaprire localmente l’intero elenco degli slot, mantenendo visibili settimana, autore e conteggio senza modificare dati condivisi. I sondaggi aperti e archiviati restano ordinati dal primo slot più vicino; uno slot rimane in bacheca per tutta la propria durata e scompare automaticamente soltanto alla fine, senza essere eliminato da Firestore.
- Pagina personale **I miei match**, raggiungibile dal menu account: mostra in ordine cronologico soltanto i prossimi slot completi, con quattro titolari incluso il giocatore, distinguendo i campi confermati da quelli ancora da prenotare; conserva inoltre a ritroso lo storico delle partite complete, prenotate e concluse. Slot vuoti o incompleti, adesioni come riserva e vecchie proposte mai diventate partite non vengono inclusi. La pagina usa una vera voce nella cronologia del browser, quindi su iPhone lo swipe dal bordo sinistro, il pulsante Indietro e **Torna alla bacheca** riportano tutti alla schermata principale. Toccando un prossimo match si torna direttamente alla bacheca, il filtro passa a **Tutti** se necessario e l’inizio dello slot corrispondente viene portato sotto i filtri sticky ed evidenziato, anche quando Safari ripristina in ritardo la vecchia posizione di scorrimento. Ogni match giocato permette inoltre di compilare o modificare il proprio referto dei set.
- Pagina **Gli altri match**, anch’essa nel menu account: elenca a ritroso soltanto partite complete, prenotate e concluse in cui il giocatore corrente non era tra i quattro titolari. Ogni scheda mostra i quattro partecipanti, la loro media ricevuta in quella specifica partita e il numero di voti; per ospiti o giocatori senza voti mostra uno stato neutro. Quando esiste un referto, coppie e punteggi compaiono nello stesso tabellone per squadre di **I miei match**; in caso contrario la scheda dichiara esplicitamente che il referto non è stato aggiunto. Le medie arrivano da documenti aggregati privi dell’identità dei votanti: i singoli voti restano leggibili soltanto da autore e destinatario.
- Referto condiviso dei set: uno dei quattro titolari sceglie per ogni set una delle tre sole coppie possibili, inserisce i due punteggi e può aggiungere fino a cinque set. Il riepilogo compare subito nella mini scheda dello storico come tabellone raggruppato per squadre: ogni riga identifica una coppia, ogni colonna il relativo set e un cambio di formazione apre un gruppo distinto. Riaprendo il referto si vedono coppie, risultati e autore dell’ultima modifica. Il documento è unico per partita, conserva i quattro partecipanti e l’autore originario; tutti i membri autenticati possono leggerne il risultato, mentre creazione e modifica restano riservate a un titolare registrato di quella partita. I nomi mostrati e salvati vengono riallineati ai profili correnti, mantenendo la copia storica soltanto per ospiti o account non più disponibili.
- **FantaBandeja**, raggiungibile dal menu account: per ogni partita futura prenotata con quattro titolari registrati, chi non è tra quei quattro schiera due giocatori e assegna a uno la fascia. La scelta resta privata e modificabile fino all’orario d’inizio, poi viene bloccata e resa visibile insieme alle altre. Il punteggio di ogni giocatore parte dalla media delle pagelle della partita, usa `6` d’ufficio se sono arrivate meno di due valutazioni, aggiunge `+1,5` per più set vinti che persi (`-0,5` nel caso opposto) e `+0,5` a chi condivide la miglior differenza game positiva. Il capitano vale `×1,5` e guadagna altri `+2` se è MVP della pagella. Il round assegna `5`, `3` e `1` punti ai primi tre; a parità usa nell’ordine pagella del capitano e somma delle due pagelle, poi conserva l’ex aequo. La generale ordina per punti campionato, vittorie e punti fantasy grezzi. Il calcolo avviene 48 ore dopo la fine: senza referto il round viene annullato; una sostituzione o un cambio orario precedente al via invalida la vecchia giocata e chiede di ricomporla. Ospiti e titolari del match non possono partecipare al relativo round.
- Autore della conferma e archivio dei sondaggi chiusi.
- Scorciatoia **Chiama Oasi Boschetto** nel menu account: su telefono apre direttamente il dialer con il numero `0376 290058` già compilato.
- Pagelle post partita: dieci minuti dopo la fine di un campo prenotato, ogni titolare registrato riceve una notifica e trova nell’app una scheda per assegnare da 1 a 10 agli altri compagni registrati; gli eventuali ospiti senza account non vengono proposti. Il salvataggio conserva partita, autore, destinatario e timestamp e aggiorna anche somma e conteggio del destinatario nello stesso batch atomico compatibile con le interruzioni temporanee di rete della PWA; chi chiude la scheda la elimina definitivamente soltanto per sé. Nello storico di **I miei match**, ogni partita per cui il giocatore ha ricevuto almeno un voto mostra la relativa media su 10 nella mini scheda, arrotondata al mezzo punto più vicino; **Gli altri match** legge soltanto l’aggregato anonimo.
- Storico verificabile delle azioni organizzative: creazione, spostamento ed eliminazione degli slot, adesioni, ritiri, sostituzioni, conferme o annullamenti del campo e stato del sondaggio vengono salvati come eventi immutabili con utente e ora del server. L’icona Cronologia presente in ogni scheda apre il registro di quello slot dal più recente, indicando cosa è successo, chi ha eseguito l’azione e l’orario preciso di Roma; resta disponibile anche nei sondaggi archiviati. Le sostituzioni precedenti all’introduzione dell’audit vengono recuperate dal marcatore storico `substitutedFor` già salvato nello slot, conservando giocatore uscente, sostituto e orario originale senza duplicare un eventuale evento audit; le altre attività storiche non ricostruibili non vengono inventate. Una visualizzazione viene registrata soltanto dopo che almeno metà della scheda è rimasta visibile per un secondo; per ogni utente e slot si conservano prima visita, ultima visita e conteggio, con un solo incremento per sessione del browser.
- Aggiornamenti in tempo reale su tutti i dispositivi quando Firebase è configurato.
- Ripresa affidabile della PWA: Firestore conserva una cache locale persistente e sincronizzata tra le schede, così la bacheca può mostrare subito gli ultimi slot anche durante una riconnessione. Quando l’app torna in primo piano rinnova silenziosamente i listener; se il primo caricamento non riceve dati, esegue due tentativi automatici e sostituisce comunque lo spinner con un messaggio e il pulsante **Riprova ora**.
- Notifiche Web Push opzionali per i nuovi slot disponibili e, per chi è tra i quattro titolari, l’avviso che la formazione è completa, la convocazione personale quando riceve il posto tramite sostituzione, un secondo promemoria a una settimana dalla partita se il campo è ancora da prenotare, i reminder a 24 ore e 2 ore dalla partita prenotata e la richiesta delle pagelle a fine sessione. FantaBandeja aggiunge l’apertura del round, il richiamo personale quando la formazione reale rende obsoleta una giocata e il risultato finale. Ogni categoria può essere attivata o disattivata separatamente dal profilo; i profili precedenti alla funzione mantengono tutto attivo finché non salvano una scelta. Gli avvisi raggruppati identificano il sondaggio tramite il suo intervallo settimanale anche per i documenti creati prima dell’introduzione del nome automatico. Gli avvisi di prenotazione non partono se il campo è già confermato; gli slot inseriti entro 10 minuti l’uno dall’altro vengono riuniti in un solo avviso con identità stabile e, dopo un’ora dall’ultima aggiunta, non possono più essere annunciati come nuovi.
- Archivio personale delle push ricevute: la campanella accanto alla foto profilo conta soltanto gli avvisi non letti e apre **Le mie notifiche**, con titolo, testo, categoria e ora italiana dal più recente. Aprire normalmente la bacheca non modifica il conteggio; toccare una push segna come letto quello specifico avviso, mentre aprire l’archivio segna come letti tutti quelli visualizzati. Lo stato è salvato in Firestore e rimane sincronizzato tra i dispositivi. Se lo stesso push è stato consegnato a più dispositivi dell’account compare una sola volta, con il numero di dispositivi raggiunti. Ogni giocatore può leggere e segnare come lette esclusivamente le proprie consegne; i record precedenti all’archiviazione di titolo e testo restano visibili con una spiegazione al posto del contenuto non recuperabile. Anche categorie legacy o sconosciute vengono mostrate con una presentazione generica, senza poter bloccare l’archivio. La pagina usa la cronologia del browser, quindi pulsante Indietro e swipe laterale di iPhone tornano alla bacheca.
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
npm run test:rules:match-report
npx firebase-tools deploy --only firestore:rules,firestore:indexes,hosting
npm run db:backfill-match-rating-summaries -- --yes
npm run smoke:match-report
```

La configurazione Web Firebase non è un segreto: l'accesso ai dati è protetto da Authentication e da `firestore.rules`. Non inserire mai nel repository service account, token CLI o chiavi amministrative.

Il test semantico valuta diciotto casi contro le regole locali: creazione e modifica dei referti fino a cinque set, lettura condivisa dei risultati, visibilità delle sole medie aggregate, riservatezza dei voti individuali e proprietà fidata dei round fantasy. Dopo il primo deploy della pagina **Gli altri match**, il backfill idempotente calcola una volta gli aggregati dello storico già presente; richiede conferma interattiva se si omette `--yes`. Lo smoke test successivo crea invece dati temporanei tramite il Web SDK di produzione, verifica lettura, query e modifica, quindi elimina tutti i dati di collaudo. Questi comandi usano le Application Default Credentials locali e non salvano credenziali nel repository.

## Query Firestore da terminale

La CLI locale in [`scripts/firestore-read.ts`](scripts/firestore-read.ts) usa l’SDK ufficiale Google Cloud e offre esclusivamente operazioni di lettura. Non contiene comandi per creare, modificare o eliminare documenti. Per autenticare il proprio account Google Cloud una sola volta:

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project bandeja-boys
```

Le credenziali Application Default restano fuori dal repository. Non scaricare né versionare service account. Esempi:

```bash
npm run db:get -- users/UID
npm run db:query -- users --where displayName '==' Tommy
npm run db:query -- notificationDeliveries --where kind '==' slot-ready --limit 10
npm run db:query -- activityEvents \
  --where type in '["signup_joined","signup_left"]' \
  --order-by occurredAt desc \
  --select type,actorName,occurredAt \
  --json
```

`--where` può essere ripetuto e accetta gli operatori Firestore standard. Le query restituiscono al massimo 20 documenti per default e non possono superare 100; `--project` e `--database` permettono di puntare a un ambiente alternativo. `--json` elimina le intestazioni per facilitare pipe e trasformazioni. Foto profilo, endpoint push e chiavi delle sottoscrizioni vengono sempre oscurati nell’output.

## Invio push da terminale

`npm run push:send` apre una procedura interattiva: legge i nomi degli utenti da Firestore, mostra quanti dispositivi hanno le notifiche attive, fa scegliere destinatario, titolo e messaggio, quindi chiede una conferma esplicita prima dell’invio. La CLI non possiede le chiavi VAPID: usa `gh` per avviare il workflow GitHub esistente e, per default, attende la ricevuta del servizio push.

```bash
npm run push:send
npm run push:send -- Tommy \
  --title "Forza Tommy" \
  --message "Rimettiti presto, vecchio rottame!"
npm run push:send -- --to Luigi \
  --title "Padel" \
  --message "Ricordati di chiamare il campo" \
  --yes
```

Il comando richiede le Application Default Credentials configurate per la CLI Firestore e una sessione `gh auth login` autorizzata sul repository. `--dry-run` mostra l’anteprima senza inviare; `--uid` distingue eventuali omonimi; `--no-wait` restituisce il controllo appena il workflow viene accodato. Titolo e messaggio sono limitati rispettivamente a 80 e 240 caratteri.

## Configurazione notifiche

Le notifiche richiedono una coppia VAPID Web Push e un account Firebase Authentication tecnico verificato. L’account tecnico è riconosciuto dalle Security Rules tramite email verificata e può soltanto leggere sondaggi, sottoscrizioni ed esiti chiuso/inviato delle pagelle, scrivere le ricevute di consegna ed eliminare dispositivi scaduti; non può leggere i voti, creare o modificare partite.

Configurazione GitHub del repository:

- variabile `WEB_PUSH_VAPID_PUBLIC_KEY`, uguale a `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`;
- secret `WEB_PUSH_VAPID_PRIVATE_KEY`;
- secret `FIREBASE_NOTIFIER_EMAIL`;
- secret `FIREBASE_NOTIFIER_PASSWORD`.

Tutti gli abbinamenti dei nomi delle madri vengono salvati per UID nel documento privato `notificationContent/motherNames`, unica fonte della configurazione e leggibile soltanto dall’account notifier e dalle credenziali amministrative della CLI. Un soprannome o una futura modifica del profilo non rompe quindi la personalizzazione. La CLI permette di aggiungere e ricontrollare gli abbinamenti:

```bash
npm run mother-names:set -- --uid UID_FIREBASE --mother "La Lori"
npm run mother-names:list
```

Il Worker [`scheduler/worker.js`](scheduler/worker.js) parte ogni 10 minuti, ai minuti `00`, `10`, `20`, `30`, `40` e `50`, e usa `workflow_dispatch` per avviare [`.github/workflows/notifications.yml`](.github/workflows/notifications.yml). Questo evita i ritardi occasionali dei cron GitHub senza spostare su Cloudflare le credenziali Firebase o VAPID. Un nuovo slot resta in attesa per 10 minuti dall’ultima aggiunta ravvicinata: così la creazione iniziale di cinque slot genera un solo avviso, mentre uno slot aggiunto il giorno seguente genera un nuovo avviso. Il gruppo viene costruito sull’intera sequenza di creazione, così la sua identità non cambia quando gli elementi più vecchi superano la finestra temporale; l’avviso scade definitivamente un’ora dopo l’ultima aggiunta. Con la cadenza del Worker la consegna avviene normalmente tra 10 e 20 minuti dall’ultima aggiunta. Dopo che il servizio push accetta l’invio, `notificationDeliveries` salva anche il titolo e il testo effettivamente spediti, oltre a evento, destinatario, dispositivo e timestamp. L’avvio manuale senza parametri elabora la coda ordinaria; specificando `test_user_id` invia invece un’unica notifica ai dispositivi di quell’utente. I campi facoltativi `test_title` e `test_message` permettono di personalizzare titolo e testo, rispettivamente fino a 80 e 240 caratteri. Ogni push manuale include nel link l’identificativo univoco dell’esecuzione, così il tap produce una vera navigazione anche se la PWA iOS è già aperta sulla bacheca. Selezionando `test_mode: pagelle`, la vera Web Push apre una pagella marcata **TEST** con gli stessi controlli della scheda reale: chiusura e completamento non scrivono voti, risposte o partite in Firestore.

Ogni payload include `eventId` sia nei dati della notifica sia nel parametro `notificationEvent` del deep link. In questo modo il tap può registrare la lettura anche se il telefono sta ancora usando la precedente versione del service worker; dopo il salvataggio l’app rimuove il parametro dall’URL.

Ogni lunedì, nella prima esecuzione dalle **08:30 Europe/Rome**, ogni utente con almeno una sottoscrizione attiva riceve una frase motivazionale personale. Le 150 frasi sono salvate nel documento Firestore `notificationContent/mondayMotivation`; se il documento manca, il notifier lo inizializza con il catalogo versionato, mentre una versione più recente aggiorna automaticamente quello esistente. La scelta è pseudo-casuale e dipende da settimana e UID, quindi resta stabile sui diversi dispositivi e durante i retry, mentre `notificationDeliveries` impedisce un secondo invio nella stessa settimana. Quando una frase contiene “tua madre”, il notifier cerca l’associazione privata per UID in `notificationContent/motherNames`; applica le forme colloquiali “la Nome” e “della Nome”, rimuovendo un eventuale articolo “La” già inserito nel valore. Senza corrispondenza conserva il testo generico.

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
| `npm run push:send` | sceglie un membro e invia una push personalizzata tramite GitHub Actions |
| `npm run lint` | controllo statico del codice |
| `npm test` | test unitari e di integrazione |
| `npm run build` | typecheck e build di produzione |
| `npm run db:get -- <percorso>` | legge un documento Firestore tramite credenziali Google Cloud locali |
| `npm run db:query -- <collection>` | esegue una query Firestore read-only, con limite massimo di 100 documenti |
| `npm run db:backfill-match-rating-summaries` | ricostruisce le medie aggregate dai voti storici, previa conferma |
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
- I risultati dei set e le medie aggregate sono leggibili dai membri del gruppo; i singoli voti restano leggibili soltanto da chi li ha assegnati e da chi li ha ricevuti.
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
