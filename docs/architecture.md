# Architettura e regole di dominio

## Produzione

- URL: [bandeja-boys.web.app](https://bandeja-boys.web.app)
- Progetto Firebase: `bandeja-boys`
- Piano: Spark, senza fatturazione collegata
- Database: Cloud Firestore `(default)`, regione `europe-west8` (Milano)
- Accesso: Firebase Authentication con email e password
- Hosting: Firebase Hosting con HTTPS
- Notifiche: Web Push standard con service worker e coppia VAPID
- Pianificazione: Cron Trigger Cloudflare Workers ogni 10 minuti, ai minuti `00`, `10`, `20`, `30`, `40` e `50`; il Worker avvia GitHub Actions senza Cloud Functions o fatturazione Firebase
- Repository: pubblico per l’uso gratuito dei runner standard; nessun dato utente o segreto è versionato

## Flusso settimanale

1. Un membro crea un sondaggio, di solito il lunedì, indicando la settimana successiva. `targetWeekStart` viene sempre normalizzato al lunedì della settimana selezionata, che termina la domenica; la stessa normalizzazione in lettura corregge le etichette dei documenti storici salvati con un giorno infrasettimanale. Il nome non è editabile: dominio e interfaccia lo derivano dall’intervallo nel formato **Padel · 27 lug – 2 ago 2026**. Se la settimana attraversa Capodanno, vengono mostrati entrambi gli anni.
2. Il sondaggio contiene uno o più slot con data, ora e durata. L’interfaccia usa controlli separati per data, ora e minuti, così anche i selettori nativi di iOS espongono soltanto i minuti ammessi `00` e `30`; finché uno slot non ha una prenotazione, il suo orario è automaticamente considerato indicativo.
   Qualunque membro può aggiungere o eliminare slot finché il sondaggio resta aperto; entrambe le operazioni sono transazionali. L’ultimo slot non può essere eliminato, così il sondaggio mantiene sempre almeno una proposta. La conferma di eliminazione esplicita la perdita di adesioni e riserve e, se il campo risulta prenotato, ricorda che va annullato direttamente con l’Oasi Boschetto.
3. Al momento dell’adesione il giocatore sceglie esplicitamente **Titolare** o **Riserva**; ogni adesione conserva anche il timestamp per mantenere la precedenza cronologica.
4. I titolari sono al massimo quattro. Una riserva volontaria non occupa un posto libero; quando una formazione di quattro perde un titolare, la prima riserva viene promossa automaticamente.
5. Quando lo slot raggiunge quattro titolari passa automaticamente a **Da prenotare**; è un suggerimento operativo, non un requisito per la prenotazione.
6. Qualunque membro autenticato può usare **Segna come prenotato** per registrare il campo all’**Oasi Boschetto** con un solo tocco, anche se i quattro giocatori non sono ancora completi. Il circolo è una costante di dominio e non viene richiesto nell’interfaccia.
   La presenza di `bookedAt` fa apparire automaticamente lo slot come **Orario confermato**. Annullando la prenotazione, l’interfaccia torna a mostrare **Orario indicativo** senza richiedere un secondo dato da mantenere sincronizzato.
7. L'autore può archiviare il sondaggio quando non serve più raccogliere modifiche.

La bacheca non separa più i sondaggi in due viste aperti/archiviati. Il filtro sticky sotto l’header offre **Tutti**, che mostra ogni slot futuro, **Da prenotare**, che usa `isBookingCandidate` per mostrare soltanto gli slot con esattamente quattro titolari e senza `bookedAt`, e **Prenotati**, che mostra soltanto quelli con campo confermato. Le riserve vengono escluse dal conteggio perché non occupano un posto in campo. Ogni vista include soltanto i sondaggi che contengono almeno uno slot corrispondente e all’interno della scheda nasconde gli altri. L’elenco degli slot di ogni sondaggio può inoltre essere collassato nello stato locale del componente, lasciando visibili settimana, autore e conteggio: l’operazione non viene persistita e non produce scritture o eventi di audit. I sondaggi vengono derivati per la vista ordinandoli dal primo slot futuro più vicino; gli slot il cui orario di inizio è stato raggiunto e i sondaggi rimasti senza slot futuri scompaiono automaticamente, senza cancellare dati da Firestore. Le schede dei sondaggi archiviati restano riconoscibili e non consentono modifiche finché contengono almeno uno slot futuro.

La voce **I miei match** nel menu account apre una vista personale derivata dagli stessi documenti dei sondaggi, senza nuove raccolte Firestore. `getPlayerMatches` applica `getStarters`, quindi rispetta ordine cronologico, ruoli espliciti e sostituzioni: sia lo storico sia i prossimi match richiedono esattamente quattro titolari e includono l’utente soltanto se occupa uno di quei posti. I prossimi match possono avere il campo ancora da prenotare e sono ordinati dal più vicino; lo storico include soltanto slot prenotati la cui durata è terminata, ordinati dal più recente. Slot vuoti o incompleti, adesioni come riserva e slot passati mai confermati non vengono presentati come partite.

Ogni card dei prossimi match conserva la coppia stabile `pollId`/`slotId`. Al clic la dashboard forza il filtro **Tutti**, torna alla vista principale tramite la cronologia del browser e cerca l’elemento deterministico prodotto da `slotElementId`; quando lo trova usa `scrollIntoView` con allineamento iniziale, così sulle card mobile più alte dello schermo resta visibile l’intestazione dello slot. Il posizionamento viene ripetuto brevemente dopo il ritorno alla bacheca per prevalere sul ripristino asincrono della posizione eseguito da Safari iOS, quindi viene applicata una breve evidenziazione visiva. Lo storico resta informativo e non offre questa navigazione, perché gli slot conclusi non sono più presenti nella bacheca futura.

L’apertura della vista personale aggiunge `#i-miei-match` con `history.pushState`, invece di modificare soltanto lo stato React. `popstate` e `hashchange` riallineano la vista all’URL, quindi il gesto Indietro nativo di iOS, i controlli del browser e la navigazione avanti funzionano come per una pagina reale. Il pulsante **Torna alla bacheca** usa `history.back` quando riconosce la voce creata dall’app; un accesso diretto all’hash rimuove invece l’hash con `replaceState`, senza mandare l’utente fuori dal sito.

Nella griglia desktop ogni scheda usa una fascia di prenotazione della stessa altezza: verde pieno con i dettagli della conferma oppure ambra e marcata **Campo da prenotare / In attesa**. Il contrasto cromatico rende distinguibili gli stati a colpo d’occhio e mantiene campo, riserve e footer allineati tra colonne miste. Su mobile la fascia ambra viene omessa per mantenere la scheda compatta, mentre il badge e la fascia verde della conferma restano visibili.

Data e ora di uno slot già pubblicato possono essere corrette da qualunque membro autenticato. La modifica conserva adesioni, riserve e dati del campo, accetta soltanto orari all’ora o alla mezz’ora, impedisce duplicati e riordina gli slot cronologicamente. I valori senza offset inseriti nei form vengono interpretati come orario `Europe/Rome` prima della normalizzazione ISO; viceversa schede, riepiloghi, form di modifica ed esportazione calendario convertono sempre l’istante salvato nel fuso di Roma. Il fuso configurato sul dispositivo non influenza quindi né l’orario registrato né quello mostrato, inclusi i passaggi CET/CEST.

Ogni slot espone un’azione calendario anche nei sondaggi archiviati. Il clic genera direttamente nel client un file iCalendar `.ics` con fuso `Europe/Rome`, durata, Oasi Boschetto e stato `TENTATIVE` o `CONFIRMED`: il calendario include `X-WR-TIMEZONE` e un componente `VTIMEZONE` con le ricorrenze CET/CEST, così i client mantengono l’ora locale proposta invece di reinterpretarla come UTC. Su iPhone si apre l’anteprima di sistema dalla quale confermare l’aggiunta, senza una scelta preliminare del provider e senza inviare dati a servizi calendario esterni. Modifica, eliminazione ed esportazione sono raccolte in una barra di pulsanti a icona con nomi accessibili.

Su mobile i campi `input`, `select` e `textarea` usano almeno `16px`, soglia che impedisce a Safari di ingrandire automaticamente la pagina al focus. Il controllo data/ora porta la data su una riga dedicata e divide equamente ora e minuti nella riga successiva; griglie, field e controlli azzerano la larghezza minima intrinseca, mentre il campo data mobile neutralizza l’`appearance` WebKit e resta contenuto nel modal. I modal di aggiunta e modifica non applicano `autofocus`: il focus iniziale del contenitore viene impostato soltanto al montaggio e non viene ripristinato quando cambiano le callback, così un aggiornamento React non chiude il calendario già aperto. Il viewport limita inoltre la scala a `1`, come richiesto per l’interfaccia installabile.

Ogni build emette `version.json` con lo stesso identificatore compilato nel bundle. `watchForAppUpdates` lo richiede con `cache: no-store` all’avvio, agli eventi `pageshow`, `focus`, `online` e `visibilitychange`, oltre che ogni cinque minuti. Una differenza produce una sola navigazione con il parametro `_bbv`, preservando query e hash esistenti; `sessionStorage` impedisce un ciclo nel caso limite in cui WebKit riproponga ancora il vecchio documento. Firebase Hosting invia inoltre `no-cache, no-store` per pagina iniziale e manifest di versione, mentre gli asset Vite con hash conservano la normale cache efficiente. Il controllo è necessario perché una PWA iOS già sospesa può tornare in primo piano senza una nuova navigazione, anche se il service worker non conserva alcuna cache dell’applicazione.

Il nome mostrato viene risolto sempre dal profilo `users/{uid}` più recente. Le copie presenti in adesioni, prenotazioni e sondaggi restano soltanto un fallback per profili non più disponibili; la parte locale dell’email non viene mai usata come nome. Al termine della registrazione l’`AuthContext` applica subito il profilo completo, evitando lo stato transitorio prodotto da Firebase prima dell’aggiornamento di `displayName`.

La sezione **Profilo** permette di modificare `displayName`, `avatarDataUrl` e le preferenze delle notifiche; email, password e data di creazione non sono modificabili. Il controllo puro `profileNameError` rifiuta ogni nuovo nome che contiene `Evi` senza distinzione tra maiuscole e minuscole e le Security Rules ripetono lo stesso vincolo sull’aggiornamento remoto. Il profilo corrente e la raccolta membri restano sotto listener realtime, quindi nome, avatar, preferenze, header, campo e lista riserve si aggiornano senza ricaricare la pagina. Nelle schede degli slot nomi e avatar hanno dimensioni responsive dedicate, più evidenti sia sul campo sia nella lista riserve senza alterare la griglia delle quattro posizioni.

Il menu account resta montato soltanto mentre è aperto. In quello stato un listener `pointerdown` sul documento confronta il bersaglio con il contenitore del menu: clic e tocchi interni non cambiano lo stato, mentre qualunque pressione esterna lo chiude immediatamente. Lo stesso effetto gestisce `Escape` e rimuove entrambi i listener alla chiusura o allo smontaggio del dashboard. La scorciatoia **Chiama Oasi Boschetto** usa un link `tel:` costruito dalla costante `DEFAULT_VENUE_PHONE`, chiude il menu al tocco e delega al sistema operativo l’apertura del dialer.

Per restare sul piano Spark senza fatturazione, gli avatar non usano Cloud Storage. Il browser ritaglia al centro la foto, la converte in JPEG `160×160` e la limita a 100.000 caratteri prima di salvarla nel documento `users/{uid}`; le Security Rules verificano tipo, prefisso Data URL e dimensione. Questa scelta è intenzionale per il singolo gruppo e resta ampiamente sotto il limite di 1 MiB per documento e la quota gratuita di 1 GiB di Firestore. Un prodotto pubblico dovrebbe invece usare uno storage a oggetti dedicato.

Dieci minuti dopo la fine di una partita prenotata con quattro titolari, ciascun titolare vede una pagella one-shot per gli altri tre. La scadenza è derivata da `startsAt + durationMinutes + 10 minuti` usando sempre il fuso `Europe/Rome`, anche nel runner GitHub configurato in UTC. Un deep link della notifica dà precedenza alla partita indicata; aprendo normalmente l’app dopo la scadenza viene proposta comunque la pagella più vecchia ancora in sospeso. La chiusura crea una risposta `dismissed`, il salvataggio crea una risposta `submitted` e tre voti in un’unica transazione. Entrambi gli esiti impediscono per sempre che la stessa scheda venga riproposta allo stesso giocatore. Il client ascolta inoltre i record `matchRatings` in cui l’utente corrente è il destinatario: `getPlayerMatches` raggruppa quelli con la stessa coppia `pollId`/`slotId` e allega media aritmetica e numero di voti alla sola vista derivata, senza salvare aggregati duplicati.

Lo stato `ready` non viene salvato: è derivato dal numero di titolari. Lo stato `booked` dipende dalla presenza di `bookedAt`. In questo modo non possono esistere stati incoerenti. Le adesioni precedenti all’introduzione del campo `role` restano compatibili e vengono interpretate secondo il vecchio ordine cronologico.

## Notifiche

Al primo accesso da un browser compatibile, la bacheca mostra una chiamata chiara con due scelte: **Attiva notifiche** e **Non ora**. Il rifiuto non viene riproposto automaticamente; la voce **Notifiche** nel menu account permette di cambiare scelta in seguito. Ogni attivazione vale per il singolo browser o per la singola web app installata.

Nel profilo, sette interruttori indipendenti controllano **motivazione del lunedì**, **nuovi slot**, **formazione completa**, **campo da prenotare a 7 giorni**, **reminder 24 ore**, **reminder 2 ore** e **pagelle**. Le scelte sono salvate in `users/{uid}.notificationPreferences`, quindi valgono su tutti i dispositivi dello stesso account; l’assenza del campo, tipica dei profili creati prima della funzione, viene normalizzata a tutte le categorie attive. Il runner applica la preferenza dopo aver derivato i destinatari reali dal sondaggio e prima di creare la ricevuta di consegna. Le notifiche manuali operative di tipo `test` ignorano intenzionalmente questi interruttori, così resta possibile collaudare un dispositivo o inviare un messaggio richiesto esplicitamente.

Su iPhone e iPad Web Push richiede l’apertura come web app dalla schermata Home. Nel browser normale il pannello mostra `Condividi → Aggiungi alla schermata Home`; quando l’utente riapre Bandeja Boys dall’icona installata può concedere il permesso di sistema. Safari non espone al sito lo stato di installazione della stessa app: chi chiude le istruzioni con **Non mostrare più** salva quindi la scelta in `localStorage`, per account, e il pannello non viene riproposto nelle visite successive dello stesso browser.

Il service worker `public/sw.js` riceve il payload, mostra sempre una notifica visibile e riapre la bacheca quando viene toccata. La sottoscrizione standard contiene endpoint e chiavi pubbliche del dispositivo e viene salvata in `pushSubscriptions/{subscriptionId}`; l’identificatore è l’hash SHA-256 dell’endpoint, quindi lo stesso dispositivo può essere reclamato dall’ultimo account che vi attiva gli avvisi.

Il Worker Cloudflare richiama tramite `workflow_dispatch` il workflow GitHub, che legge lo stato corrente ogni 10 minuti e genera eventi idempotenti:

- **Nuovi slot**: a tutti i dispositivi registrati tranne quelli di chi li ha aggiunti. Gli slot creati nello stesso sondaggio a non più di 10 minuti di distanza vengono raggruppati; l’evento viene emesso soltanto dopo 10 minuti senza altre aggiunte. Cinque proposte iniziali producono quindi un avviso, mentre un’altra proposta inserita il giorno seguente ne produce uno nuovo. Il messaggio identifica il sondaggio con l’intervallo lunedì-domenica derivato da `targetWeekStart`, anziché fidarsi del vecchio titolo salvato: anche i documenti storici con il nome generico o una data infrasettimanale diventano quindi riconoscibili senza migrazione. Il raggruppamento usa l’intera sequenza di creazione prima di applicare la scadenza, perciò l’identità dell’evento resta stabile anche quando il primo elemento diventa più vecchio. Un gruppo è notificabile soltanto fino a un’ora dall’ultima aggiunta e solo per partite future.
- **Formazione completa**: quando un quarto titolare completa uno slot futuro ancora da prenotare, soltanto ai quattro titolari correnti. L’identità dell’evento include il timestamp del quarto titolare: le esecuzioni successive restano idempotenti, mentre una formazione che si svuota e torna completa genera un nuovo evento. La finestra di 24 ore evita avvisi retroattivi al rilascio; se `bookedAt` è già presente, l’evento non viene creato.
- **Reminder prenotazione 7g**: nella prima esecuzione a partire da sette giorni prima della partita, soltanto se la formazione era già completa prima della soglia e `bookedAt` è ancora assente. I destinatari sono i quattro titolari correnti e la finestra dura 24 ore; l’identità include l’orario della partita, quindi uno spostamento genera il promemoria rispetto alla nuova data.
- **Reminder 24h**: quando una partita prenotata entra nella finestra delle 24 ore, soltanto ai primi quattro iscritti in quel momento; l’archiviazione del sondaggio non disattiva il promemoria.
- **Reminder 2h**: quando la stessa partita entra nella finestra delle 2 ore, ricalcolando nuovamente i quattro titolari anche se il sondaggio è già archiviato.
- **Pagelle post partita**: da 10 a 40 minuti dopo la fine di una partita prenotata completa, ai quattro titolari. Il link apre direttamente la pagella di quella partita; l’app la mostra anche senza notifica se viene aperta in qualunque momento successivo.
- **Motivazione del lunedì**: nella prima esecuzione tra le 08:30 e le 09:30 `Europe/Rome`, una volta per utente con almeno una sottoscrizione attiva. Il catalogo versionato di 150 frasi vive in `notificationContent/mondayMotivation`: il notifier lo inizializza se assente e migra automaticamente una versione precedente. Un hash stabile di lunedì e UID sceglie la frase: destinatari diversi possono ricevere testi diversi, mentre retry e dispositivi dello stesso utente mantengono lo stesso testo. Se la frase contiene “tua madre”, il notifier risolve il nome più recente dell’utente dalle copie già presenti nei sondaggi e consulta la directory privata `MOTHER_NAMES_BY_RECIPIENT_JSON`; la personalizzazione usa sempre le forme colloquiali “la Nome” e “della Nome”, mentre una corrispondenza assente lascia il testo generico.

Nuovi slot e reminder di gioco condividono il titolo informale **“Sveglia fagianotto!”**; la formazione completa usa **“Slot completo!”**, il promemoria di prenotazione **“Manca solo una settimana!”**, la richiesta delle pagelle **“È ora di dare i voti”** e la motivazione settimanale **“Buon lunedì, bestia!”**. I messaggi legati alle partite conservano giorno e ora della sessione.

Ogni slot nuovo conserva `createdAt`, `createdBy` e `createdByName`; un cambio di data e ora lascia invariati questi dati e quindi non viene interpretato come una nuova aggiunta. Gli slot storici privi dei metadati non generano avvisi retroattivi. Ritiri, promozioni dalla riserva, sostituzioni, annullamenti, eliminazioni e cambi di orario non richiedono una coda da correggere: i destinatari vengono sempre derivati dal documento più recente. Uno slot eliminato non produce quindi notifiche ancora in attesa né reminder futuri. L’identità del reminder include data e ora, perciò uno slot spostato genera i reminder per il nuovo orario. `notificationDeliveries/{deliveryId}` registra ogni coppia evento/dispositivo e impedisce duplicati tra esecuzioni successive. La ricevuta viene creata soltanto dopo che il servizio Web Push accetta l’invio e conserva anche `title` e `body`; non dimostra che il sistema operativo abbia mostrato o che l’utente abbia letto la notifica.

La CLI operativa `scripts/push-send.ts` legge utenti e conteggio dei dispositivi tramite Application Default Credentials, ma non accede alle chiavi VAPID. Dopo la conferma dell’operatore passa UID, titolo e messaggio come input del `workflow_dispatch`; il workflow usa i secret già configurati, salva la normale ricevuta `notificationDeliveries` e restituisce alla CLI l’esito. La selezione per nome richiede una corrispondenza esatta senza distinzione tra maiuscole e minuscole; in caso di omonimia si usa l’UID.

L’elaborazione parte ai minuti `00`, `10`, `20`, `30`, `40` e `50`. Per i nuovi slot si aggiungono i 10 minuti di quiete, quindi l’avviso arriva normalmente tra 10 e 20 minuti dall’ultima aggiunta e non viene più generato dopo un’ora; formazione completa, reminder di prenotazione e reminder di gioco arrivano invece nella prima esecuzione dopo il superamento della rispettiva soglia, entro circa 10 minuti. La motivazione del lunedì viene accodata alle 08:30 locali e resta eleggibile per un’ora, così un breve ritardo del runner non la perde. Il Cron Trigger esterno evita che i ritardi occasionali dei workflow pianificati GitHub diventino ritardi di recapito; la logica idempotente rende innocuo anche un eventuale avvio manuale contemporaneo.

Il Worker non contiene credenziali Firebase o Web Push. Conserva soltanto un secret Cloudflare `GITHUB_TOKEN` fine-grained, limitato al repository `BandejaBoys` e al permesso **Actions: Read and write**, e invia a GitHub una richiesta di dispatch sul branch `main`. Il piano gratuito Cloudflare ammette 100.000 richieste al giorno e 5 Cron Trigger per account; questo progetto ne usa uno e produce 144 invocazioni giornaliere.

Il repository pubblico usa gratuitamente i runner GitHub standard. Per evitare che GitHub disattivi i workflow pianificati dopo 60 giorni senza attività, `keepalive.yml` esegue il primo giorno del mese un heartbeat ristretto al repository originale: valida il progetto con `npm run check`, aggiorna `.github/keepalive.txt` e crea un commit con il `GITHUB_TOKEN`, limitato al solo permesso `contents: write`. L’esecuzione manuale dello stesso workflow permette di verificarlo; un workflow già disattivato deve prima essere riabilitato dalla scheda Actions o tramite API GitHub. I fork pubblici saltano il job grazie al controllo su `github.repository`.

L’avvio manuale può indirizzare una singola notifica a uno specifico UID e, facoltativamente, usare un titolo personalizzato di massimo 80 caratteri e un corpo di massimo 240 caratteri. Con `test_mode: pagelle` il payload usa il deep link `/?ratingTest=1`: il client apre una pagella esplicitamente marcata **TEST**, scegliendo tre membri diversi dall’utente o nomi fittizi se il gruppo non è ancora caricato. Il submit e la chiusura agiscono soltanto sullo stato React e non chiamano il repository, quindi non creano `matchRatings`, `matchRatingResponses` o partite. L’identificativo univoco dell’esecuzione mantiene idempotente anche questo tipo di invio; il messaggio manuale non modifica la pianificazione ordinaria.

## Precedenza e ritiri

Le adesioni sono sempre ordinate da `joinedAt`, con l'identificatore dell'adesione come spareggio deterministico. La UI mostra sul campo fino a quattro adesioni da titolare e nella lista d’attesa quelle da riserva.

Quando una persona si ritira, la sua adesione viene rimossa. Se la formazione era completa, la prima riserva viene promossa impostandola come titolare; con meno di quattro titolari, invece, le riserve volontarie restano in lista d’attesa. Se la stessa persona torna a segnarsi, sceglie nuovamente il ruolo ed entra in fondo con un nuovo timestamp.

## Sostituzioni

Solo un titolare può passare il proprio posto. Il sostituto non può essere un altro titolare.

- Se il sostituto non era segnato, prende la posizione e il timestamp del titolare uscente.
- Se era in riserva, la sua adesione in lista d'attesa viene rimossa e prende la posizione del titolare uscente.
- L'adesione conserva `substitutedFor`, così l'interfaccia mostra chiaramente chi è stato sostituito.

Questa regola implementa l'accordo diretto tra due persone senza alterare la precedenza degli altri.

## Dati Firestore

Le ispezioni operative da terminale passano dalla CLI read-only `scripts/firestore-read.ts`, basata sull’SDK ufficiale `@google-cloud/firestore` e sulle Application Default Credentials locali. La CLI non espone operazioni di scrittura, limita ogni query a un massimo di 100 documenti e oscura automaticamente Data URL delle foto, endpoint e chiavi Web Push. Token, service account e credenziali Google Cloud non vengono salvati nel repository.

```text
users/{uid}
  id, displayName, email, createdAt, avatarDataUrl?
  notificationPreferences?
    mondayMotivation, newSlots, slotReady, bookingReminder7d
    reminder24h, reminder2h, matchRating

polls/{pollId}
  title (generato dalla settimana), targetWeekStart (lunedì), createdBy, createdByName
  createdAt, updatedAt, status
  slots[]
    id, startsAt, durationMinutes, venue
    createdAt?, createdBy?, createdByName?
    bookedAt?, bookedBy?, bookedByName?
    signups[]
      id, userId, displayName, joinedAt, role?, substitutedFor?

pushSubscriptions/{subscriptionId}
  userId, endpoint, expirationTime
  keys.auth, keys.p256dh
  createdAt, updatedAt

notificationDeliveries/{deliveryId}
  eventId, kind, title, body, userId, subscriptionId, sentAt

notificationContent/mondayMotivation
  messages[150], catalogVersion, createdAt, updatedAt

matchRatingResponses/{pollId__slotId__reviewerId}
  id, pollId, slotId, reviewerId, status, closedAt

matchRatings/{pollId__slotId__reviewerId__revieweeId}
  id, responseId, pollId, pollTitle, slotId
  sessionStartsAt, sessionEndedAt
  reviewerId, reviewerName, revieweeId, revieweeName
  score, createdAt

activityEvents/{eventId}
  type, actorId, actorName, pollId, pollTitle
  slotId?, slotStartsAt?, details, occurredAt

slotViews/{pollId__slotId__viewerId}
  pollId, pollTitle, slotId, slotStartsAt
  viewerId, viewerName
  firstViewedAt, lastViewedAt, viewCount
```

Un sondaggio e i suoi slot stanno in un solo documento. `title` resta persistito per compatibilità con audit e dati esistenti, ma per la presentazione viene ricalcolato da `targetWeekStart` dopo aver ricavato il lunedì della stessa settimana: non serve migrare i vecchi documenti e un titolo generico o un intervallo infrasettimanale salvato in passato non ricompare nell’interfaccia o negli avvisi. Le nuove scritture persistono direttamente il lunedì. È una scelta adatta alle dimensioni del gruppo: permette una transazione singola, aggiornamenti in tempo reale semplici e nessun indice composto. Il limite Firestore di 1 MiB resta molto lontano con poche persone e un massimo di 14 slot imposto dalle regole.

Le risposte e i voti sono documenti immutabili. L’identificatore deterministico rende idempotente ogni coppia partita/revisore/destinatario; le copie dei nomi fotografano lo storico mentre gli UID permettono di risalire sempre alle persone coinvolte. Le regole consentono a un giocatore di creare i propri voti e di leggere i record in cui è autore o destinatario, vietando aggiornamenti e cancellazioni. La UI espone al destinatario soltanto la media per partita nella propria mini scheda dello storico; non vengono creati documenti aggregati né classifiche globali.

`activityEvents` è un audit log append-only delle azioni organizzative, non un log di ogni clic: registra creazione e gestione di sondaggi e slot, adesioni, ritiri, sostituzioni e prenotazioni. `occurredAt` usa `serverTimestamp()`, quindi l’orario non dipende dall’orologio del telefono. L’evento viene scritto nella stessa transazione Firestore della modifica a cui si riferisce; la creazione iniziale usa un unico batch per sondaggio ed eventi. Le Security Rules consentono la creazione soltanto all’attore autenticato e vietano aggiornamento e cancellazione.

Le visualizzazioni sono aggregate separatamente per evitare un documento per apertura. Un `IntersectionObserver` considera visto uno slot quando almeno il 50% della scheda resta visibile per un secondo; `sessionStorage` evita più conteggi dello stesso slot nella medesima sessione del browser. La prima visita resta immutabile, mentre ultima visita e conteggio vengono aggiornati in transazione con timestamp del server. Nome e UID rendono l’informazione leggibile al gruppo; il dato non viene condiviso fuori dagli utenti autenticati. Il tracciamento parte dal rilascio della funzione e non prova a ricostruire visite o ritiri precedenti.

## Concorrenza

Ogni aggiunta o eliminazione di uno slot, adesione, ritiro, sostituzione, modifica dell’orario o conferma del campo usa `runTransaction`; il relativo evento di audit fa parte della stessa operazione atomica. Se due membri aggiornano lo stesso sondaggio contemporaneamente, Firestore rilegge la versione più recente e ripete l'operazione, evitando il classico aggiornamento perso.

Anche l’invio di una pagella è transazionale: prima verifica che non esista già una risposta, poi crea insieme i tre voti immutabili e la risposta `submitted`. La chiusura crea soltanto la risposta `dismissed`. Una gara tra due dispositivi dello stesso utente produce quindi un solo esito definitivo.

Al termine della transazione il repository restituisce anche il sondaggio aggiornato: la bacheca lo applica immediatamente, senza attendere il successivo evento realtime. Il listener Firestore resta attivo per confermare lo stato e sincronizzare gli altri dispositivi; questo evita interfacce ferme su connessioni mobili lente o sospese.

## Sicurezza delle notifiche

I membri leggono e gestiscono soltanto la propria sottoscrizione push. L’account tecnico `codex@kirivoraup.resend.app` deve avere l’email verificata: le Firestore Security Rules gli consentono di leggere sondaggi, profili utente, sottoscrizioni, esiti delle pagelle e il solo catalogo motivazionale, scrivere le ricevute di consegna, inizializzare il catalogo e aggiornarlo soltanto incrementandone la versione, oltre a eliminare endpoint scaduti. La lettura dei profili serve ad applicare `notificationPreferences`; gli esiti servono esclusivamente a non notificare chi ha già chiuso o inviato. L’account tecnico non può leggere i punteggi, creare o modificare profili, creare sondaggi o aggiornare slot. I membri non possono leggere o modificare `notificationContent`.

La password tecnica, la chiave VAPID privata e la directory facoltativa dei nomi delle madri vivono esclusivamente nei GitHub Actions secrets e non fanno parte della cronologia pubblica. Il notifier usa i profili esclusivamente per le preferenze e continua a ricavare i nomi per la personalizzazione dalle copie già presenti nei sondaggi. Il token di dispatch vive esclusivamente nei secret cifrati Cloudflare ed è ristretto a un repository e a un solo permesso; Wrangler non ne restituisce il valore dopo il salvataggio. La chiave VAPID pubblica e la configurazione Web Firebase sono invece parte della configurazione del client. Prima del passaggio a repository pubblico, tutti i blob raggiungibili dalla cronologia Git sono stati controllati per escludere token, chiavi private, service account e file di credenziali. Il progetto non usa service account Google, Cloud Functions, Cloud Scheduler, Pub/Sub o altri servizi che richiedono il piano Blaze.

## Modalità demo

Se manca la configurazione Firebase, lo stesso contratto `PadelRepository` usa `localStorage`. Il seed contiene due slot e cinque membri fittizi per mostrare subito titolari e riserve; risposte e voti delle pagelle vengono conservati insieme in un secondo record locale. La modalità è dichiarata chiaramente nell'interfaccia e non deve essere usata come backend condiviso.
