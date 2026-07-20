# Bandeja Boys

Mini sito privato per organizzare le partite di padel del gruppo: sondaggi settimanali, quattro titolari in ordine di adesione, riserve, sostituzioni e conferma del campo.

## Online

Il sito è disponibile su [bandeja-boys.web.app](https://bandeja-boys.web.app). L'istanza usa il progetto Firebase `bandeja-boys` sul piano gratuito Spark, senza account di fatturazione collegato.

## Cosa fa

- Registrazione e accesso con email e password.
- Creazione di un sondaggio per la settimana successiva con uno o più slot, duplicabili al giorno seguente mantenendo ora e durata.
- Modifica di data e ora degli slot già pubblicati senza perdere adesioni, riserve o prenotazione.
- Scelta esplicita al momento dell’adesione: ogni giocatore può segnarsi come **Titolare** oppure direttamente come **Riserva**. I quattro posti da titolare e la lista d’attesa mantengono l’ordine cronologico.
- Promozione automatica della prima riserva quando un titolare si ritira da una formazione completa.
- Sostituzione diretta: un titolare passa la propria posizione a un altro membro; se il sostituto era in riserva, il suo vecchio posto viene rimosso. Un tooltip accessibile chiarisce l’effetto prima dell’azione.
- Stato dello slot immediatamente leggibile: raccolta adesioni, da prenotare, campo prenotato. L’azione **Segna come prenotato** registra con un solo tocco la prenotazione all’**Oasi Boschetto**, anche prima di raggiungere quattro giocatori.
- Autore della conferma e archivio dei sondaggi chiusi.
- Aggiornamenti in tempo reale su tutti i dispositivi quando Firebase è configurato.

## Stack e costo

- React, TypeScript e Vite per l'applicazione statica.
- Firebase Authentication per gli account.
- Cloud Firestore per la sincronizzazione in tempo reale.
- Firebase Hosting per SSL e sottodominio gratuito `web.app`.

Il progetto usa solo servizi disponibili nel piano Spark, che non richiede un metodo di pagamento. Per un gruppo ristretto, le quote gratuite di Firestore e Hosting sono molto superiori al traffico previsto. Riferimenti: [piani Firebase](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans) e [Firebase Hosting](https://firebase.google.com/docs/hosting/quickstart).

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
5. Copia `.env.example` in `.env.local` e compila i valori `VITE_FIREBASE_*`. Il repository include già `.env.production` con la configurazione Web pubblica dell'istanza di produzione.
6. Collega la CLI al progetto e pubblica regole e sito:

```bash
npx firebase-tools login
npx firebase-tools use --add
npm run check
npx firebase-tools deploy --only firestore:rules,firestore:indexes,hosting
```

La configurazione Web Firebase non è un segreto: l'accesso ai dati è protetto da Authentication e da `firestore.rules`. Non inserire mai nel repository service account, token CLI o chiavi amministrative.

## Comandi

| Comando | Scopo |
| --- | --- |
| `npm run dev` | server locale con hot reload |
| `npm run lint` | controllo statico del codice |
| `npm test` | test unitari e di integrazione |
| `npm run build` | typecheck e build di produzione |
| `npm run check` | lint, test e build in sequenza |

Prima di ogni commit o deploy deve passare `npm run check`.

## Modello di sicurezza

- Solo gli utenti autenticati possono leggere membri e sondaggi.
- Ogni utente può creare o aggiornare soltanto il proprio profilo.
- Qualunque membro autenticato può aderire, ritirarsi, fare una sostituzione o segnare una prenotazione: è una scelta intenzionale per un piccolo gruppo fidato.
- Soltanto chi ha creato un sondaggio può eliminarlo; nell'interfaccia l'autore può archiviarlo o riaprirlo.
- Gli aggiornamenti agli slot avvengono con transazioni Firestore per non perdere l'ordine quando due persone agiscono quasi contemporaneamente.

La struttura e gli invarianti completi sono descritti in [docs/architecture.md](docs/architecture.md).

## Limiti intenzionali

- Non esistono ruoli amministrativi o gruppi multipli: l'istanza è pensata per un'unica cerchia di amici.
- Non vengono inviate notifiche push o email automatiche; il sito è la fonte condivisa dello stato.
- Il codice non usa Cloud Functions, così resta compatibile con il piano gratuito senza collegare un account di fatturazione.
