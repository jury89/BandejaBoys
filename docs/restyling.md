# Restyling Clubhouse

Direzione approvata: mobile-first, stessa identità Bandeja, partite e azioni prima delle decorazioni.

## Sistema visivo

- Inchiostro `#102A3A`, blu Bandeja `#075985`, campo `#0E7490`, lime `#D9FF43`, fondo `#EEF5F7`, bianco `#FFFFFF`.
- Barlow Condensed per titoli brevi e punteggi; Manrope Variable per contenuti e controlli. Il logo `Brand` non viene modificato.
- Una scheda per partita, separatori leggeri per le settimane, campo completo solo su richiesta. Su desktop una colonna di partite e un riepilogo personale laterale evitano schede eccessivamente larghe.
- Quattro destinazioni persistenti. Dentro Partite restano i percorsi “Le mie” e “Gli altri”; il Fanta conserva le sue tre tab e le transizioni stagionali esistenti.

## Interazioni

- Filtri Tutti / Posti liberi / Sono iscritto; prenotazione selezionabile separatamente (il selettore cambia il filtro corrente, non aggiunge una seconda condizione).
- Rosa compatta ed espansa mostrano gli stessi giocatori in ordine cronologico. La posizione personale viene esplicitata e non dipende dallo stato del campo.
- Mi iscrivo / Entra in riserva conservano la scelta volontaria del ruolo. Gli iscritti possono ritirarsi o scegliere una sostituzione da Gestisci iscrizione.
- Calendario rimane diretto; modifica, ospiti, cronologia e amministrazione sono nel menu con etichette testuali. Nessun cambiamento alle autorizzazioni.
- Statistiche: selettore giocatore ricercabile, periodo e tre viste; i numeri sono separati dalle linee del campo per evitare sovrapposizioni.
- Moduli a schermo intero fino a 600 px, gestione della tastiera, focus confinato al dialogo e restituito al controllo di apertura alla chiusura.
- Movimento ridotto rispettato, controlli principali di almeno 44 px, safe area inferiore e header opaco.

## Perimetro e verifica

Il restyling non attiva la chiusura del Fanta, non cambia voti, calcoli, stagioni, storico o dati. Nessuna modifica a Firestore Rules o al notifier. I test di dominio e repository restano parte della validazione completa.

Prima del rilascio: `npm run check`, poi smoke test in demo isolata a 320 / 390 / 430 / 1280 px. Verificare navigazione e ritorno, filtri, campo, riserve, calendario, azioni amministrative autorizzate, form di più slot e avvisi duplicati, referti, scelta Fanta, ricerca statistiche, assenza di overflow e controlli non coperti dalla navigazione.

Lo storico a blocchi usa dati già caricati: non cambia la strategia delle letture Firestore introdotta dal PR #24.

### Collaudo del 10 settembre 2026

Browser Chromium locale, account e partite demo isolati: nessuna scrittura su Firebase e nessuna notifica reale.

- Layout verificato a 320, 390, 430, 760, 1024 e 1280 px, senza overflow orizzontale; la navigazione passa in alto da 1050 px e lascia spazio a logo, notifiche e account.
- Storico simulato con 21 referti: apertura delle due viste, caricamento delle partite successive, ricerca giocatore, risultati Fanta e regole.
- Iscrizione e ritiro da titolare e riserva; modifica dell’orario; creazione multipla con avviso per ogni duplicato; aggiornamento referto; scelta di entrambi i giocatori, capitano e salvataggio della formazione Fanta.
- Calendario scaricato e verificato: titolo Padel e due alert. Dialoghi verificati anche a 320 px, con ritorno del focus al menu di apertura; i toast non coprono i moduli.
- Nessun errore JavaScript nei due smoke test conclusivi. Si tratta di viewport mobili emulate, non di un collaudo su iPhone fisico.
