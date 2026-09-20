# Tornei del gruppo

## Esperienza e regole

Tutti i membri trovano **Tornei** nel menu account e possono crearne uno. Ogni torneo è gestito dal suo creatore e dall’amministratore già configurato per gli slot. Bozze leggibili solo da creatore e admin; dopo la pubblicazione il torneo compare nell’elenco di tutti i membri ed è raggiungibile anche dal link condiviso. Non si può assumere la proprietà del torneo di un altro membro. Nessun legame con Fanta, giudizi, posto fisso o statistiche delle partite ordinarie.

Palette e caratteri esistenti: ink `#102A3A`, deep `#075985`, court `#0E7490`, ball `#D9FF43`, sfondo `#EEF5F7`, bianco; Barlow Condensed per i titoli, Manrope per testo e controlli. Layout mobile-first allineato a sinistra: riepilogo con scadenza iscrizioni, elenco iscritti/coppie, partite divise per turno, classifica con podio. Si evita un tabellone orizzontale da trascinare sul telefono; campi e ondate indicano la sequenza effettiva delle partite.

Le impostazioni si modificano in bozza e si congelano alla pubblicazione. Le iscrizioni e le scelte reciproche del compagno terminano **esattamente un’ora prima** dell’inizio, fuso Europe/Rome. Non basta nascondere il pulsante: la scadenza viene imposta nelle Security Rules con l’orologio del server. Un torneo non prenota il circolo: luogo e numero di campi devono essere organizzati separatamente.

- Americano: multipli di 4 giocatori, compagni ruotati con metodo circolare. In un ciclo di N−1 turni ogni coppia di compagni compare una volta; turni ulteriori ripetono il ciclo. Punti a somma fissa per incontro (16, 24 o 32), anche con pareggio.
- Mexicano: multipli di 4, primo turno casuale, successivi raggruppati per classifica; 1+4 contro 2+3 in ciascun gruppo. Sono varianti sociali, non un regolamento federale univoco.
- Girone all’italiana: coppie fisse, casuali oppure scelte reciprocamente. Tutte le coppie si incontrano; eventuali riposi del calendario non assegnano punti artificiali. A scelta: un set a 6, tie-break sul 6–6, oppure partite a tempo (vedi sotto).
- Eliminazione diretta: 8, 16 o 32 giocatori (4/8/16 coppie), tabellone sorteggiato, finale e finalina obbligatoria per il bronzo. Un set a 6, tie-break sul 6–6.

Capienza massima 32; al via si usa il numero effettivo di iscritti se compatibile con la formula. Tutti giocano in ogni turno rotante: se i campi non bastano, le partite si distribuiscono in ondate, senza falsi punti riposo. Le coppie scelte richiedono consenso reciproco; nessuno iscrive un altro membro a sua insaputa. Gli ospiti senza account possono essere inseriti dall’organizzatore (vedi sotto). Il sorteggio viene salvato, non rigenerato a ogni apertura.

Per Americano/Mexicano: punti fatti, differenza punti, vittorie. Per il girone: vittorie, differenza game, game fatti. Pari merito completi condividono il rango, saltando i posti occupati: nessuno vince per ordine alfabetico. Nell’eliminazione decidono finale e finalina. Il creatore o l’admin avanza al turno successivo soltanto dopo tutti i risultati; si possono correggere i risultati del turno corrente, non quelli che hanno già determinato turni successivi. Creatore e admin possono inserire tutti i risultati; i giocatori solo quelli delle proprie partite quando l’opzione lo permette. Prima dell’avanzamento la UI chiede conferma.

## Girone a tempo: 10 persone, 2 campi, 90 minuti

Il pulsante **Imposta 10 giocatori · 2 campi · 90 minuti** seleziona 5 coppie fisse sorteggiate (modificabili in coppie scelte), 5 turni da 15 minuti, 5 minuti di riscaldamento e 2 minuti tra i turni. Totale stimato: 88 minuti. Ciascuna coppia gioca quattro incontri (60 minuti) e riposa un turno, indicato nel calendario. I tempi si personalizzano in bozza: partita 5–30 minuti, riscaldamento 0–15, cambio 0–5. Il programma usa gli iscritti effettivi dopo il sorteggio.

Variante sociale esplicita: punto secco sul 40–40, alla scadenza si termina il punto in corso e si contano solo i game interamente completati. Un game rimasto incompleto non conta. Pareggio ammesso, anche 0–0, niente tie-break. Classifica **3 punti vittoria / 1 pareggio / 0 sconfitta**, poi differenza game e game fatti; eventuali pari merito rimangono tali anche nel podio. Il riepilogo mostra punti, vinte–pareggiate–perse e game fatti/subiti. Questa variante non cambia i tornei a set esistenti.

Tutte le partite di un turno iniziano insieme: servono almeno `floor(numeroGiocatori / 4)` campi, controllati su capienza e iscritti effettivi. L’organizzatore o Jury sorteggia dalla chiusura iscrizioni e avvia il timer solo dall’orario previsto del torneo. Il timestamp è condiviso e sopravvive al ricaricamento; un timer locale aggiorna la visualizzazione, senza nuove letture/scritture ogni secondo. Non è un cronometro arbitrale: deriva dall’orologio dei dispositivi, che devono essere sincronizzati.

I risultati si inseriscono dopo l’avvio, anche progressivamente, e restano provvisori fino alla conferma. Per avanzare servono sia timer scaduto sia tutti i risultati del turno; l’organizzatore aspetta la fine del punto in corso prima di confermare. Il turno seguente richiede un nuovo avvio manuale. Riscaldamento e cambi sono stime visibili del programma, non pause imposte automaticamente; per stare nei 90 minuti occorre rispettarle. Non si promette una fine automatica né una prenotazione del circolo.

L’avviso sonoro va attivato esplicitamente su ogni dispositivo. Usa Web Audio e richiede pagina aperta/dispositivo attivo; in background o a schermo bloccato non è garantito, quindi usare anche un timer del telefono. Nessuna notifica push o processo aggiuntivo. Il countdown grande, ad alto contrasto, è il punto focale della UI; riepiloghi e iscritti restano sobri, allineati a sinistra e coerenti con i caratteri/colori del resto dell’app.

## Partecipanti esterni

Nell’elenco iscritti, creatore e Jury vedono **Aggiungi ospite** finché le iscrizioni sono aperte. Nome obbligatorio, massimo 80 caratteri; ogni ospite ha un ID `guest:<UUID>` e occupa un posto nella stessa capienza dei membri. Non vengono creati account o registrazioni nelle partite ordinarie. Nome, compagno e rimozione si gestiscono dalla voce dell’ospite; tutto si blocca a −1 ora, anche per l’organizzatore, senza alterare tabelloni o storico dopo il via.

Per le coppie scelte, l’organizzatore sceglie per l’ospite; il membro deve ricambiare dal suo account. Per due ospiti si impostano entrambe le scelte. Se uno viene rimosso, il compagno resta da confermare e il sorteggio non può partire con una coppia incoerente. Ospiti e membri compaiono allo stesso modo nelle partite e nel podio, ma gli esterni non possono accedere o salvare risultati: lo fa l’organizzatore/Jury oppure un membro coinvolto, se abilitato.

## Fonti e varianti adottate

- [Playtomic: Americano e Mexicano](https://helpmanager.playtomic.com/hc/en-gb/articles/44129657203985-New-Tournament-Tools-King-of-the-Court-Americano-and-Mexicano): rotazione dei compagni, classifica individuale, abbinamenti adattivi e risultati progressivi (consultato il 20 settembre 2026).
- [LTA: formule di tabellone](https://www.lta.org.uk/support-centre/competing/competing-in-padel/what-are-the-draw-and-scoring-formats-for-lta-sanctioned-padel-tournaments/): riferimento per gironi e tabelloni; questi tornei privati non sono competizioni federali.

Le varianti esatte e gli spareggi sono sempre mostrati nella pagina del torneo: non si promette compatibilità con ogni regolamento chiamato “Americano” o “Mexicano”.

## Collaudo e rilascio

- `npm run check`: lint, suite completa, produzione, typecheck notifier e dry-run scheduler. Le prove coprono rotazioni fino a 32 giocatori, riposi, tabelloni 8/16/32, consensi, pareggi, scadenze, permessi e revisioni, gestione da un creatore non amministratore e isolamento delle bozze. Per la modalità a tempo: programma 88 minuti, avvio/timer/scadenza/conferma manuale, punteggio 3/1/0 e regressione set classici; per gli ospiti: capienza, gestione, consensi e persistenza locale.
- `npm run test:rules:tournaments`: scenari con risorse sintetiche e `get()`/`exists()` simulati nell’API Rules; nessuna lettura o scrittura di partite reali. Verificati UID, bozze, gestione/risultati per creatore e admin, ospiti/cutoff/capienza, validazione timer/punteggi a tempo e compatibilità dei documenti legacy senza nuovi campi. Esecuzione seriale in piccoli batch per limitare la risposta dell’API. Quota assegnata esplicitamente al progetto di `.firebaserc`.
- Browser locale, desktop 1280×900 e mobile 390×844: creazione bozza/pubblicazione, visibilità membri, iscrizione, conferma reciproca della coppia, inserimento finale da un partecipante, blocco della conclusione senza finalina, finalina e podio. Controllate interfaccia nuova e classica, assenza di overflow orizzontale e navigazione dal menu account nell’app completa. Solo fixture in localStorage; nessun torneo di test sul database condiviso.
- Apertura a tutti: collaudati creazione desktop e mobile da membri normali, bozza non leggibile da un secondo account, pubblicazione e iscrizione altrui senza comandi di gestione, menu account nell’app completa, inserimento risultato e conclusione/podio da un creatore non partecipante. Nessun errore console nel flusso e nessun overflow a 390 px.
- Modalità a tempo/ospiti: collaudati preset, pubblicazione e ospite su desktop; aggiunta ospite con compagno su mobile, consenso reciproco dal membro e assenza di gestione ospiti per altri membri. Verificati avvio, persistenza del countdown al reload, blocco avanzamento anticipato, pareggio 4–4 con un punto a coppia, conferma turno scaduto e nuovo avvio manuale. Fixture ultimo turno conclusa con podio e ospiti, senza errori console nella sessione pulita; nessun overflow a 390 o 1280 px, interfaccia nuova e classica. Corretto e coperto da regressione il tick immediatamente precedente all’avvio che poteva mostrare 15:01.
- Deploy limitato a Hosting, Firestore Rules e indici dei tornei. Nessun deploy di scheduler/notifier, nessuna migrazione, nessuna modifica ai documenti esistenti. Verificare gli indici `published ASC, startsAt DESC` e `createdBy ASC, startsAt DESC` in stato `READY` prima di considerare operativo l’elenco per i membri.
