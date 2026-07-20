# Architettura e regole di dominio

## Flusso settimanale

1. Un membro crea un sondaggio, di solito il lunedì, indicando la settimana successiva.
2. Il sondaggio contiene uno o più slot con data, ora e durata.
3. Ogni adesione riceve un timestamp e viene ordinata cronologicamente.
4. Le posizioni 1–4 sono titolari; dalla posizione 5 in poi si è riserve.
5. Quando lo slot raggiunge quattro adesioni passa automaticamente a **Da prenotare**.
6. Qualunque membro autenticato può segnare il campo come prenotato e indicare il circolo.
7. L'autore può archiviare il sondaggio quando non serve più raccogliere modifiche.

Lo stato `ready` non viene salvato: è derivato dal numero di adesioni. Lo stato `booked` dipende dalla presenza di `bookedAt`. In questo modo non possono esistere stati incoerenti.

## Precedenza e ritiri

Le adesioni sono sempre ordinate da `joinedAt`, con l'identificatore dell'adesione come spareggio deterministico. La UI mostra i primi quattro sul campo e le altre persone oltre la linea di fondo.

Quando una persona si ritira, la sua adesione viene rimossa. Non occorre un'operazione separata di promozione: ricalcolando i primi quattro, la prima riserva entra automaticamente tra i titolari. Se la stessa persona torna a segnarsi, entra in fondo con un nuovo timestamp.

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
      id, userId, displayName, joinedAt, substitutedFor?
```

Un sondaggio e i suoi slot stanno in un solo documento. È una scelta adatta alle dimensioni del gruppo: permette una transazione singola, aggiornamenti in tempo reale semplici e nessun indice composto. Il limite Firestore di 1 MiB resta molto lontano con poche persone e un massimo di 14 slot imposto dalle regole.

## Concorrenza

Ogni adesione, ritiro, sostituzione o conferma del campo usa `runTransaction`. Se due membri aggiornano lo stesso sondaggio contemporaneamente, Firestore rilegge la versione più recente e ripete l'operazione, evitando il classico aggiornamento perso.

## Modalità demo

Se manca la configurazione Firebase, lo stesso contratto `PadelRepository` usa `localStorage`. Il seed contiene due slot e cinque membri fittizi per mostrare subito titolari e riserve. La modalità è dichiarata chiaramente nell'interfaccia e non deve essere usata come backend condiviso.

