# Restyling Clubhouse

Direzione approvata: mobile-first, stessa identità Bandeja, partite e azioni prima delle decorazioni.

## Sistema visivo

- Inchiostro `#102A3A`, blu Bandeja `#075985`, campo `#0E7490`, lime `#D9FF43`, fondo `#EEF5F7`, bianco `#FFFFFF`.
- Barlow Condensed per titoli brevi e punteggi; Manrope Variable per contenuti e controlli. Il logo `Brand` non viene modificato.
- Una scheda per partita, separatori leggeri per le settimane e un campo con quattro posti sempre visibile. Su desktop una colonna di partite e un riepilogo personale laterale evitano schede eccessivamente larghe.
- Quattro destinazioni persistenti. Dentro Partite restano i percorsi “Le mie” e “Gli altri”; il Fanta conserva le sue tre tab e le transizioni stagionali esistenti.

## Interazioni

- Filtri Tutti / Posti liberi / Sono iscritto; prenotazione selezionabile separatamente (il selettore cambia il filtro corrente, non aggiunge una seconda condizione).
- Campo a due colonne e due metà, con rete centrale, quattro posti numerati in ordine cronologico e foto o iniziale centrata. I numeri indicano l’ordine di iscrizione, non le coppie del referto. Ogni posto non occupato mostra “Posto libero”; la posizione personale viene esplicitata e non dipende dallo stato della prenotazione. Le riserve restano righe separate con posizione, avatar, nome e l’eventuale etichetta Ospite e pulsante di rimozione.
- Mi iscrivo / Entra in riserva conservano la scelta volontaria del ruolo. Ritirati / Passo il posto sono visibili senza aprire un pannello; una riserva vede Passa a titolare quando ci sono meno di quattro titolari. La richiesta conserva l’iscrizione e verifica di nuovo la disponibilità durante il salvataggio.
- Calendario rimane diretto; modifica, ospiti, cronologia e amministrazione sono nel menu con etichette testuali. Il menu si apre sotto se c’è spazio, altrimenti sopra; esclude l’header e la barra inferiore dall’area disponibile e scorre internamente sugli schermi più bassi. Nessun cambiamento alle autorizzazioni.
- Statistiche: selettore giocatore ricercabile, periodo e tre viste; i numeri sono separati dalle linee del campo per evitare sovrapposizioni.
- Moduli a schermo intero fino a 600 px, gestione della tastiera, focus confinato al dialogo e restituito al controllo di apertura alla chiusura.
- Movimento ridotto rispettato, controlli principali di almeno 44 px, safe area inferiore e header opaco.

## Perimetro e verifica

### Menu delle azioni entro lo schermo — 11 settembre 2026

Il posizionamento della sola nuova interfaccia misura il viewport visibile e le barre fisse, incluse le safe area. Il menu resta sovrapposto senza cambiare l’altezza dello slot; sceglie il lato più adatto, limita la sua altezza allo spazio disponibile e mantiene raggiungibili tutte le azioni tramite scorrimento interno. Si aggiorna su scroll, ridimensionamento e variazioni del viewport mobile, chiudendosi quando il pulsante esce dall’area visibile. Gli ascoltatori di posizionamento sono attivi solo a menu aperto. Escape restituisce il focus al pulsante; clic esterno e scelta di un’azione chiudono il menu, che alla riapertura riparte dalla prima voce.

Collaudo demo isolato: cinque azioni amministratore a 390 × 844, 320 × 568, 844 × 390 e 1280 × 900 px; apertura sopra vicino al bordo inferiore e sotto vicino all’header, ultima azione raggiungibile anche in orizzontale, header invariato, riposizionamento su scroll/resize, Escape/focus, clic esterno e apertura del modulo. Classica invariata; nessuna richiesta a Firebase o errore JavaScript. Test automatici dedicati alla geometria e al ciclo apertura/chiusura. Rilascio solo Hosting, nessun cambiamento a dati, autorizzazioni, Fanta o notifiche.

### Campo ripristinato nella nuova interfaccia — 11 settembre 2026

In seguito al feedback del gruppo, il campo colorato torna al posto della lista compatta dei titolari. È sempre visibile, senza controllo Mostra/Nascondi. La griglia resta 2 × 2 anche su desktop; su mobile nomi e descrizioni possono andare a capo sotto foto e numero. Menu sovrapposti, navigazione, riserve e scelta Classica/Nuova rimangono invariati. Nessuna modifica a dati, ordine di iscrizione, Fanta, regole o notifiche: per questo aggiornamento serve soltanto il deploy Hosting.

Il collaudo deve includere campo pieno e vuoto, posti parzialmente occupati, nomi lunghi, foto e iniziali, ospite titolare/riserve, menu sovrapposto e ritorno alla classica a larghezze telefono e desktop.

Affinamento compatto: altezza minima da 260 a 220 px su mobile e da 250 a 210 px su desktop, con meno spazio verticale interno. Larghezza, margini e spaziatura orizzontale restano invariati, così come dimensioni di testo, avatar e pulsanti. Nessuna altezza fissa o ritaglio: il campo cresce ancora se nomi lunghi e ospiti richiedono spazio. La classica non cambia.

Collaudo dell’affinamento: a 320 / 390 / 520 / 760 / 1280 px la larghezza coincide con quella precedente. La riduzione misurata è di 40 px nei campi standard e di 16 px nel caso mobile con nome lungo su più righe. Ripetuti i controlli su campo pieno/vuoto, ospiti, riserva → titolare, menu sovrapposto e ritorno alla classica, senza sovrapposizioni, errori JavaScript o richieste a Firebase.

Esito: suite completa con 365 test in 51 file, lint, build, typecheck notifiche e dry-run scheduler superati. Chromium in demo isolata a 320 / 390 / 520 / 760 / 1280 px: quattro posti su due colonne, rete centrata e nessuna sovrapposizione del contenuto; verificati foto circolari, nomi lunghi, ospite titolare, passaggio riserva → titolare e rimozione ospite. Menu aperto senza cambiamenti all’altezza dell’header; ritorno alla classica verificato. Nessuna richiesta a Firebase e nessun errore JavaScript. Mobile verificato con viewport emulati, non su dispositivo fisico.

Il restyling non attiva la chiusura del Fanta e non cambia voti, calcoli, stagioni o storico. L’unica estensione alle Firestore Rules è la preferenza facoltativa `users.interfaceMode`; nessuna modifica al notifier. I test di dominio e repository restano parte della validazione completa.

## Pubblicazione in anteprima, scelta per account

- La classica rimane il default per profili nuovi o già esistenti senza preferenza. Non serve una migrazione.
- Profilo → Interfaccia permette di scegliere Classica oppure Nuova — anteprima; la scelta si applica solo premendo Salva profilo. Nel backend remoto è salvata sul proprio documento utente e segue l’account sui dispositivi; in demo è conservata con l’account locale.
- `?ux=nuova` e `?ux=classica` forzano temporaneamente una presentazione, senza scrivere la preferenza. Precedenza: parametro valido → preferenza dell’account → classica. Valori sconosciuti vengono ignorati.
- Il profilo propone la modalità effettivamente visualizzata. Dopo un salvataggio riuscito viene eliminato solo il parametro `ux`, conservando gli altri parametri, il deep link e lo stato della cronologia. Annullamento o errore non modificano la preferenza tramite questa azione né il link.
- Le due presentazioni condividono autenticazione, repository, iscrizioni, risultati e Fanta. La preview online usa dati veri: non è una sandbox. Il restyling CSS è circoscritto a `.app-shell.ux-new`; la classica mantiene campo, filtri e navigazione originali. I miglioramenti di accessibilità dei moduli e le correzioni funzionali sono condivisi.
- Il cambio non aggiunge listener Firestore: usa il profilo già sottoscritto dalla sessione. Le regole ammettono soltanto `classica` e `nuova`, sempre con i vincoli di proprietà del profilo esistenti.

Release: eseguire `npm run check`, `npm run test:rules:match-report` e collaudare entrambe le presentazioni a desktop e mobile; pubblicare Hosting e Firestore Rules, senza toccare scheduler, notifier o altri PR.

### Collaudo del rilascio opt-in — 10 settembre 2026

- `npm run check`: 362 test in 51 file, lint, build, typecheck notifiche e dry-run scheduler superati.
- Simulatore ufficiale Firebase Rules: 31 casi superati, inclusi cambio interfaccia valido, valore non ammesso e modifica del profilo altrui negata.
- Chromium demo isolata: entrambe le interfacce senza overflow a 320 / 390 / 1280 px; classica predefinita, salvataggio e nuovo accesso, override da link senza persistenza, annullamento, rimozione del solo parametro `ux` al salvataggio e conservazione del deep link.
- Verificati i percorsi classici I miei match / Statistiche / Fanta e ripetuti i tre percorsi completi della nuova interfaccia (azioni dello slot e salvataggi, profilo e statistiche, geometria e ospiti fino a 1280 px).
- Nessuna richiesta a Firebase, nessuna notifica e nessun errore JavaScript nei collaudi locali. Le partite demo restano identiche passando da una presentazione all’altra. Questi test mobile emulano il viewport: non sostituiscono una prova su iPhone fisico.

Prima del rilascio: `npm run check`, poi smoke test in demo isolata a 320 / 390 / 430 / 1280 px. Verificare navigazione e ritorno, filtri, campo, riserve, calendario, azioni amministrative autorizzate, form di più slot e avvisi duplicati, referti, scelta Fanta, ricerca statistiche, assenza di overflow e controlli non coperti dalla navigazione.

Lo storico a blocchi usa dati già caricati: non cambia la strategia delle letture Firestore introdotta dal PR #24.

### Revisione dopo il collaudo dell’utente

- Rimossi il campo espandibile e i controlli ridondanti; palette e caratteri restano quelli approvati.
- Il campo illustrato nel login dispone un giocatore al centro di ogni quadrante, senza altri nodi nella griglia.
- Filtro prenotazioni: etichetta visibile Tutti. Non anticipa il futuro filtro per circolo.
- Menu delle azioni fuori dal flusso anche su mobile, senza aumentare l’altezza della scheda.
- Stili della rosa isolati dal vecchio campo per non ereditare allineamenti alternati, ombre sulle iniziali o badge da ospite fuori posto.
- Nuovo passaggio personale riserva → titolare con controllo concorrente e audit, senza cancellare l’adesione.

### Primo collaudo del 10 settembre 2026 (prima della revisione)

Browser Chromium locale, account e partite demo isolati: nessuna scrittura su Firebase e nessuna notifica reale.

- Layout verificato a 320, 390, 430, 760, 1024 e 1280 px, senza overflow orizzontale; la navigazione passa in alto da 1050 px e lascia spazio a logo, notifiche e account.
- Storico simulato con 21 referti: apertura delle due viste, caricamento delle partite successive, ricerca giocatore, risultati Fanta e regole.
- Iscrizione e ritiro da titolare e riserva; modifica dell’orario; creazione multipla con avviso per ogni duplicato; aggiornamento referto; scelta di entrambi i giocatori, capitano e salvataggio della formazione Fanta.
- Calendario scaricato e verificato: titolo Padel e due alert. Dialoghi verificati anche a 320 px, con ritorno del focus al menu di apertura; i toast non coprono i moduli.
- Nessun errore JavaScript nei due smoke test conclusivi. Si tratta di viewport mobili emulate, non di un collaudo su iPhone fisico.

### Collaudo della revisione

- `npm run check`: 350 test in 47 file, lint, build, typecheck notifiche e controllo scheduler completati.
- Chromium con sessione demo separata a 320 / 390 / 520 / 760 / 1280 px: iniziali centrate, foto caricate e ritagliate, ospiti titolari e riserve senza overflow.
- Apertura di “Altre azioni”: altezza dell’header invariata a tutte le larghezze, menu entro il viewport e realmente sovrapposto; Escape ripristina il focus e il clic esterno lo chiude.
- Ingresso volontario in riserva e passaggio diretto a titolare verificati conservando id e orario di adesione. I test di dominio e repository coprono anche campo pieno, idempotenza, audit e riallineamento atomico del Fanta.
- Quattro bollini del login verificati al centro dei quattro quadranti; nessuna richiesta a Firebase e nessun errore JavaScript. I dati di prova del browser dell’utente non sono stati azzerati. Nessun merge o deploy.

### Circoli multipli (15 settembre 2026)

Entrambe le UX condividono il selettore del circolo per slot, i preferiti multipli nel profilo e il filtro della bacheca. Il filtro parte compatto (“Scegli i campi”), evitando tre righe di caselle sempre aperte sul telefono. “Tutti i campi” e “Ripristina i preferiti” modificano soltanto la vista corrente. Se non ci sono risultati nei circoli selezionati, il messaggio lo chiarisce e offre un ritorno immediato a tutti.

Il nome del circolo è leggibile sia in raccolta adesioni sia dopo la prenotazione. Le nuove schede dei circoli sono raggiungibili dallo slot e da “Campi e costi”, senza aggiungere un quinto pulsante alla navigazione principale mobile. Tariffe con periodo di validità e dati da confermare sono distinti; la prenotazione resta esterna all’app. Collaudare preferenze/ricaricamento, filtri combinati, creazione simultanea in circoli diversi, vincolo del posto fisso, conferma prenotazione e link diretti alle due schede, a 390 e 1280 px in entrambe le UX.

Collaudo completato nel browser integrato, con account e slot esclusivamente demo: preferiti multipli persistenti, filtri Tutti/Ripristina, slot simultanei Oasi/Sport City e auto-iscrizione solo al circolo preferito, creazione TCM, prenotazione e schede informative. Verificate entrambe le UX su desktop e telefono; nessun overflow orizzontale a 390 px né errore JavaScript. La versione classica mobile mantiene visibile anche il circolo non ancora prenotato. Suite completa: 385 test; regole Firestore: 38 casi. Nessun dato di produzione modificato dal collaudo.

### Collaudo esplorativo della demo

Correzioni emerse utilizzando l’app con una sessione e dati finti separati:

- Avatar delle statistiche: la base flex e l’allineamento dell’iniziale ora seguono le dimensioni compatte, evitando foto ovali e lettere decentrate.
- Preferenze: l’altezza dei campi di testo non stira più in verticale gli interruttori di notifiche e posto fisso. L’etichetta del posto fisso mantiene un’area cliccabile di almeno 44 px.
- Menu account: altezza limitata e scorrimento interno, con azioni di almeno 44 px. Anche Esci resta raggiungibile con uno schermo basso, senza finire dietro la navigazione.
- Ricerca giocatore: dopo la scelta il pannello si richiude e restituisce il focus al riepilogo, evitando che la navigazione da tastiera riparta dal corpo della pagina. Il giocatore selezionato arriva direttamente dal contenitore: non viene ricreata tutta la pagina a ogni cambio e la vista Panoramica / Coppie e rivali / Storico resta quella scelta.

Ripetere i percorsi di iscrizione/ritiro, sostituzione, ospiti, modifica orario, creazione multipla con duplicati, salvataggio referto e formazione Fanta. Nel profilo verificare nome, foto, posto fisso e preferenze anche dopo un ricaricamento; nelle statistiche provare ricerca senza risultati, cambio giocatore, periodo e tutte le viste. Controllare foto e iniziali a 320 / 390 / 1280 px e il menu account a 844 × 390 px. I test CSS proteggono i contratti di dimensionamento; la geometria effettiva richiede comunque il browser.

Esito finale del 10 settembre 2026: `npm run check` completato con 354 test in 48 file, lint, build, typecheck del notifier e dry-run scheduler. Tre percorsi Chromium conclusivi superati: azioni e salvataggi, profilo/statistiche/sostituzione/uscita, geometria della rosa e ospiti a 320 / 390 / 520 / 760 / 1280 px. Verificati anche annullamento e conferma della rimozione ospite, focus dopo il cambio giocatore e persistenza del profilo dopo il ricaricamento. Nessun errore JavaScript rilevato; sessioni demo isolate, nessuna richiesta a Firebase e nessuna notifica reale. Il collaudo mobile usa viewport emulate, non un iPhone fisico. Preview lasciata disponibile; nessun commit, push, merge o deploy.
