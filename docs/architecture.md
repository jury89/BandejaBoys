# Architettura e regole di dominio

## Produzione

- URL: [bandeja-boys.web.app](https://bandeja-boys.web.app)
- Progetto Firebase: `bandeja-boys`
- Piano: Spark, senza fatturazione collegata
- Database: Cloud Firestore `(default)`, regione `europe-west8` (Milano)
- Accesso: Firebase Authentication con email e password
- Hosting: Firebase Hosting con HTTPS
- Notifiche: Web Push standard con service worker e coppia VAPID
- Pianificazione: GitHub Actions ogni 10 minuti, ai minuti `03`, `13`, `23`, `33`, `43` e `53`, senza Cloud Functions o fatturazione Firebase
- Repository: pubblico per l’uso gratuito dei runner standard; nessun dato utente o segreto è versionato

## Flusso settimanale

1. Un membro crea un sondaggio, di solito il lunedì, indicando la settimana successiva.
2. Il sondaggio contiene uno o più slot con data, ora e durata. I minuti ammessi sono soltanto `00` e `30`; uno slot può inoltre conservare `timeIsTentative` per comunicare che l’orario è ancora indicativo.
   Qualunque membro può aggiungere altri slot finché il sondaggio resta aperto; l’operazione è transazionale e non modifica quelli esistenti.
3. Al momento dell’adesione il giocatore sceglie esplicitamente **Titolare** o **Riserva**; ogni adesione conserva anche il timestamp per mantenere la precedenza cronologica.
4. I titolari sono al massimo quattro. Una riserva volontaria non occupa un posto libero; quando una formazione di quattro perde un titolare, la prima riserva viene promossa automaticamente.
5. Quando lo slot raggiunge quattro titolari passa automaticamente a **Da prenotare**; è un suggerimento operativo, non un requisito per la prenotazione.
6. Qualunque membro autenticato può usare **Segna come prenotato** per registrare il campo all’**Oasi Boschetto** con un solo tocco, anche se i quattro giocatori non sono ancora completi. Il circolo è una costante di dominio e non viene richiesto nell’interfaccia.
   Se lo slot era stato proposto con un orario indicativo, la presenza di `bookedAt` lo fa apparire come **Orario confermato**. Il flag resta memorizzato: annullando la prenotazione, l’interfaccia torna correttamente a mostrare l’orario come indicativo.
7. L'autore può archiviare il sondaggio quando non serve più raccogliere modifiche.

La bacheca non separa più i sondaggi in due viste aperti/archiviati. Il filtro sticky sotto l’header offre **Tutti**, che mantiene consultabile l’intera cronologia, e **Slot prenotati**, che include soltanto i sondaggi con almeno una prenotazione e mostra al loro interno esclusivamente gli slot prenotati. Le schede dei sondaggi archiviati restano riconoscibili e non consentono modifiche.

Nella griglia desktop ogni scheda usa una fascia di prenotazione della stessa altezza: verde pieno con i dettagli della conferma oppure ambra e marcata **Campo da prenotare / In attesa**. Il contrasto cromatico rende distinguibili gli stati a colpo d’occhio e mantiene campo, riserve e footer allineati tra colonne miste. Su mobile la fascia ambra viene omessa per mantenere la scheda compatta, mentre il badge e la fascia verde della conferma restano visibili.

Data, ora e indicazione provvisoria di uno slot già pubblicato possono essere corrette da qualunque membro autenticato. La modifica conserva adesioni, riserve e dati del campo, accetta soltanto orari all’ora o alla mezz’ora, impedisce duplicati e riordina gli slot cronologicamente.

Il nome mostrato viene risolto sempre dal profilo `users/{uid}` più recente. Le copie presenti in adesioni, prenotazioni e sondaggi restano soltanto un fallback per profili non più disponibili; la parte locale dell’email non viene mai usata come nome. Al termine della registrazione l’`AuthContext` applica subito il profilo completo, evitando lo stato transitorio prodotto da Firebase prima dell’aggiornamento di `displayName`.

Lo stato `ready` non viene salvato: è derivato dal numero di titolari. Lo stato `booked` dipende dalla presenza di `bookedAt`. In questo modo non possono esistere stati incoerenti. Le adesioni precedenti all’introduzione del campo `role` restano compatibili e vengono interpretate secondo il vecchio ordine cronologico.

## Notifiche

Al primo accesso da un browser compatibile, la bacheca mostra una chiamata chiara con due scelte: **Attiva notifiche** e **Non ora**. Il rifiuto non viene riproposto automaticamente; la voce **Notifiche** nel menu account permette di cambiare scelta in seguito. Ogni attivazione vale per il singolo browser o per la singola web app installata.

Su iPhone e iPad Web Push richiede l’apertura come web app dalla schermata Home. Nel browser normale il pannello mostra `Condividi → Aggiungi alla schermata Home`; quando l’utente riapre Bandeja Boys dall’icona installata può concedere il permesso di sistema.

Il service worker `public/sw.js` riceve il payload, mostra sempre una notifica visibile e riapre la bacheca quando viene toccata. La sottoscrizione standard contiene endpoint e chiavi pubbliche del dispositivo e viene salvata in `pushSubscriptions/{subscriptionId}`; l’identificatore è l’hash SHA-256 dell’endpoint, quindi lo stesso dispositivo può essere reclamato dall’ultimo account che vi attiva gli avvisi.

Il workflow GitHub legge lo stato corrente ogni 10 minuti e genera eventi idempotenti:

- **Nuovi slot**: a tutti i dispositivi registrati tranne quelli di chi li ha aggiunti. Gli slot creati nello stesso sondaggio a non più di 10 minuti di distanza vengono raggruppati; l’evento viene emesso soltanto dopo 10 minuti senza altre aggiunte. Cinque proposte iniziali producono quindi un avviso, mentre un’altra proposta inserita il giorno seguente ne produce uno nuovo. Sono considerate soltanto aggiunte avvenute nelle ultime 24 ore e relative a partite future.
- **Reminder 24h**: quando una partita prenotata entra nella finestra delle 24 ore, soltanto ai primi quattro iscritti in quel momento; l’archiviazione del sondaggio non disattiva il promemoria.
- **Reminder 2h**: quando la stessa partita entra nella finestra delle 2 ore, ricalcolando nuovamente i quattro titolari anche se il sondaggio è già archiviato.

I tre avvisi ordinari condividono il titolo informale **“Sveglia fagianotto!”**. Il corpo specifica rispettivamente che sono disponibili uno o più nuovi slot, che il titolare gioca domani oppure che gioca tra due ore; i reminder conservano sempre giorno, ora e circolo.

Ogni slot nuovo conserva `createdAt`, `createdBy` e `createdByName`; un cambio di data e ora lascia invariati questi dati e quindi non viene interpretato come una nuova aggiunta. Gli slot storici privi dei metadati non generano avvisi retroattivi. Ritiri, promozioni dalla riserva, sostituzioni, annullamenti e cambi di orario non richiedono una coda da correggere: i destinatari vengono sempre derivati dal documento più recente. L’identità del reminder include data e ora, perciò uno slot spostato genera i reminder per il nuovo orario. `notificationDeliveries/{deliveryId}` registra ogni coppia evento/dispositivo e impedisce duplicati tra esecuzioni successive.

L’elaborazione parte ai minuti `03`, `13`, `23`, `33`, `43` e `53`. Per i nuovi slot si aggiungono i 10 minuti di quiete, quindi l’avviso arriva normalmente tra 10 e 20 minuti dall’ultima aggiunta; i reminder arrivano invece nella prima esecuzione dopo il superamento della soglia, entro circa 10 minuti. GitHub documenta che i workflow pianificati possono subire ritardi occasionali: in tal caso il reminder 24h resta valido fino all’ingresso nella finestra 2h, mentre quello 2h resta valido fino all’inizio della partita.

Il repository pubblico usa gratuitamente i runner GitHub standard. Per evitare che GitHub disattivi i workflow pianificati dopo 60 giorni senza attività, `keepalive.yml` esegue il primo giorno del mese un heartbeat ristretto al repository originale: valida il progetto con `npm run check`, aggiorna `.github/keepalive.txt` e crea un commit con il `GITHUB_TOKEN`, limitato al solo permesso `contents: write`. L’esecuzione manuale dello stesso workflow permette di verificarlo; un workflow già disattivato deve prima essere riabilitato dalla scheda Actions o tramite API GitHub. I fork pubblici saltano il job grazie al controllo su `github.repository`.

L’avvio manuale può indirizzare una singola notifica a uno specifico UID e, facoltativamente, usare un corpo personalizzato di massimo 240 caratteri. L’identificativo univoco dell’esecuzione mantiene idempotente anche questo tipo di invio; il messaggio manuale non modifica la pianificazione ordinaria.

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

```text
users/{uid}
  id, displayName, email, createdAt

polls/{pollId}
  title, targetWeekStart, createdBy, createdByName
  createdAt, updatedAt, status
  slots[]
    id, startsAt, durationMinutes, timeIsTentative?, venue
    createdAt?, createdBy?, createdByName?
    bookedAt?, bookedBy?, bookedByName?
    signups[]
      id, userId, displayName, joinedAt, role?, substitutedFor?

pushSubscriptions/{subscriptionId}
  userId, endpoint, expirationTime
  keys.auth, keys.p256dh
  createdAt, updatedAt

notificationDeliveries/{deliveryId}
  eventId, kind, userId, subscriptionId, sentAt
```

Un sondaggio e i suoi slot stanno in un solo documento. È una scelta adatta alle dimensioni del gruppo: permette una transazione singola, aggiornamenti in tempo reale semplici e nessun indice composto. Il limite Firestore di 1 MiB resta molto lontano con poche persone e un massimo di 14 slot imposto dalle regole.

## Concorrenza

Ogni aggiunta di uno slot, adesione, ritiro, sostituzione, modifica dell’orario o conferma del campo usa `runTransaction`. Se due membri aggiornano lo stesso sondaggio contemporaneamente, Firestore rilegge la versione più recente e ripete l'operazione, evitando il classico aggiornamento perso.

Al termine della transazione il repository restituisce anche il sondaggio aggiornato: la bacheca lo applica immediatamente, senza attendere il successivo evento realtime. Il listener Firestore resta attivo per confermare lo stato e sincronizzare gli altri dispositivi; questo evita interfacce ferme su connessioni mobili lente o sospese.

## Sicurezza delle notifiche

I membri leggono e gestiscono soltanto la propria sottoscrizione push. L’account tecnico `codex@kirivoraup.resend.app` deve avere l’email verificata: le Firestore Security Rules gli consentono di leggere sondaggi e sottoscrizioni, scrivere le sole ricevute di consegna ed eliminare endpoint scaduti. Non può leggere i profili, creare sondaggi o aggiornare slot.

La password tecnica e la chiave VAPID privata vivono esclusivamente nei GitHub Actions secrets e non fanno parte della cronologia pubblica. La chiave VAPID pubblica e la configurazione Web Firebase sono invece parte della configurazione del client. Prima del passaggio a repository pubblico, tutti i blob raggiungibili dalla cronologia Git sono stati controllati per escludere token, chiavi private, service account e file di credenziali. Il progetto non usa service account Google, Cloud Functions, Cloud Scheduler, Pub/Sub o altri servizi che richiedono il piano Blaze.

## Modalità demo

Se manca la configurazione Firebase, lo stesso contratto `PadelRepository` usa `localStorage`. Il seed contiene due slot e cinque membri fittizi per mostrare subito titolari e riserve. La modalità è dichiarata chiaramente nell'interfaccia e non deve essere usata come backend condiviso.
