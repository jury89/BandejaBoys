# Architettura e regole di dominio

## Produzione

- URL: [bandeja-boys.web.app](https://bandeja-boys.web.app)
- Progetto Firebase: `bandeja-boys`
- Piano: Spark, senza fatturazione collegata
- Database: Cloud Firestore `(default)`, regione `europe-west8` (Milano)
- Accesso: Firebase Authentication con email e password
- Hosting: Firebase Hosting con HTTPS

## Flusso settimanale

1. Un membro crea un sondaggio, di solito il lunedì, indicando la settimana successiva.
2. Il sondaggio contiene uno o più slot con data, ora e durata.
3. Al momento dell’adesione il giocatore sceglie esplicitamente **Titolare** o **Riserva**; ogni adesione conserva anche il timestamp per mantenere la precedenza cronologica.
4. I titolari sono al massimo quattro. Una riserva volontaria non occupa un posto libero; quando una formazione di quattro perde un titolare, la prima riserva viene promossa automaticamente.
5. Quando lo slot raggiunge quattro titolari passa automaticamente a **Da prenotare**; è un suggerimento operativo, non un requisito per la prenotazione.
6. Qualunque membro autenticato può usare **Segna come prenotato** per registrare il campo all’**Oasi Boschetto** con un solo tocco, anche se i quattro giocatori non sono ancora completi. Il circolo è una costante di dominio e non viene richiesto nell’interfaccia.
7. L'autore può archiviare il sondaggio quando non serve più raccogliere modifiche.

La bacheca non separa più i sondaggi in due viste aperti/archiviati. Il filtro sticky sotto l’header offre **Tutti**, che mantiene consultabile l’intera cronologia, e **Slot prenotati**, che include soltanto i sondaggi con almeno una prenotazione e mostra al loro interno esclusivamente gli slot prenotati. Le schede dei sondaggi archiviati restano riconoscibili e non consentono modifiche.

Data e ora di uno slot già pubblicato possono essere corrette da qualunque membro autenticato. La modifica conserva adesioni, riserve e dati del campo, impedisce duplicati e riordina gli slot cronologicamente.

Il nome mostrato viene risolto sempre dal profilo `users/{uid}` più recente. Le copie presenti in adesioni, prenotazioni e sondaggi restano soltanto un fallback per profili non più disponibili; la parte locale dell’email non viene mai usata come nome. Al termine della registrazione l’`AuthContext` applica subito il profilo completo, evitando lo stato transitorio prodotto da Firebase prima dell’aggiornamento di `displayName`.

Lo stato `ready` non viene salvato: è derivato dal numero di titolari. Lo stato `booked` dipende dalla presenza di `bookedAt`. In questo modo non possono esistere stati incoerenti. Le adesioni precedenti all’introduzione del campo `role` restano compatibili e vengono interpretate secondo il vecchio ordine cronologico.

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
    id, startsAt, durationMinutes, venue
    bookedAt?, bookedBy?, bookedByName?
    signups[]
      id, userId, displayName, joinedAt, role?, substitutedFor?
```

Un sondaggio e i suoi slot stanno in un solo documento. È una scelta adatta alle dimensioni del gruppo: permette una transazione singola, aggiornamenti in tempo reale semplici e nessun indice composto. Il limite Firestore di 1 MiB resta molto lontano con poche persone e un massimo di 14 slot imposto dalle regole.

## Concorrenza

Ogni adesione, ritiro, sostituzione, modifica dell’orario o conferma del campo usa `runTransaction`. Se due membri aggiornano lo stesso sondaggio contemporaneamente, Firestore rilegge la versione più recente e ripete l'operazione, evitando il classico aggiornamento perso.

Al termine della transazione il repository restituisce anche il sondaggio aggiornato: la bacheca lo applica immediatamente, senza attendere il successivo evento realtime. Il listener Firestore resta attivo per confermare lo stato e sincronizzare gli altri dispositivi; questo evita interfacce ferme su connessioni mobili lente o sospese.

## Modalità demo

Se manca la configurazione Firebase, lo stesso contratto `PadelRepository` usa `localStorage`. Il seed contiene due slot e cinque membri fittizi per mostrare subito titolari e riserve. La modalità è dichiarata chiaramente nell'interfaccia e non deve essere usata come backend condiviso.
