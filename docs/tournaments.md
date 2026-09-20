# Tornei del gruppo

## Esperienza e regole

Creazione e gestione riservate all’amministratore già configurato per gli slot. La voce di creazione compare solo nel suo menu. Bozze leggibili solo dall’admin; gli altri membri aprono il link del torneo dopo la pubblicazione. Nessun legame con Fanta, giudizi, posto fisso o statistiche delle partite ordinarie.

Palette e caratteri esistenti: ink `#102A3A`, deep `#075985`, court `#0E7490`, ball `#D9FF43`, sfondo `#EEF5F7`, bianco; Barlow Condensed per i titoli, Manrope per testo e controlli. Layout mobile-first allineato a sinistra: riepilogo con scadenza iscrizioni, elenco iscritti/coppie, partite divise per turno, classifica con podio. Si evita un tabellone orizzontale da trascinare sul telefono; campi e ondate indicano la sequenza effettiva delle partite.

Le impostazioni si modificano in bozza e si congelano alla pubblicazione. Le iscrizioni e le scelte reciproche del compagno terminano **esattamente un’ora prima** dell’inizio, fuso Europe/Rome. Non basta nascondere il pulsante: la scadenza viene imposta nelle Security Rules con l’orologio del server. Un torneo non prenota il circolo: luogo e numero di campi devono essere organizzati separatamente.

- Americano: multipli di 4 giocatori, compagni ruotati con metodo circolare. In un ciclo di N−1 turni ogni coppia di compagni compare una volta; turni ulteriori ripetono il ciclo. Punti a somma fissa per incontro (16, 24 o 32), anche con pareggio.
- Mexicano: multipli di 4, primo turno casuale, successivi raggruppati per classifica; 1+4 contro 2+3 in ciascun gruppo. Sono varianti sociali, non un regolamento federale univoco.
- Girone all’italiana: coppie fisse, casuali oppure scelte reciprocamente. Tutte le coppie si incontrano; eventuali riposi del calendario non assegnano punti artificiali. Un set a 6, tie-break sul 6–6.
- Eliminazione diretta: 8, 16 o 32 giocatori (4/8/16 coppie), tabellone sorteggiato, finale e finalina obbligatoria per il bronzo. Un set a 6, tie-break sul 6–6.

Capienza massima 32; al via si usa il numero effettivo di iscritti se compatibile con la formula. Tutti giocano in ogni turno rotante: se i campi non bastano, le partite si distribuiscono in ondate, senza falsi punti riposo. Le coppie scelte richiedono consenso reciproco; nessuno iscrive un altro giocatore. Il sorteggio viene salvato, non rigenerato a ogni apertura.

Per Americano/Mexicano: punti fatti, differenza punti, vittorie. Per il girone: vittorie, differenza game, game fatti. Pari merito completi condividono il rango, saltando i posti occupati: nessuno vince per ordine alfabetico. Nell’eliminazione decidono finale e finalina. L’admin avanza al turno successivo soltanto dopo tutti i risultati; si possono correggere i risultati del turno corrente, non quelli che hanno già determinato turni successivi. Prima dell’avanzamento la UI chiede conferma.

## Fonti e varianti adottate

- [Playtomic: Americano e Mexicano](https://helpmanager.playtomic.com/hc/en-gb/articles/44129657203985-New-Tournament-Tools-King-of-the-Court-Americano-and-Mexicano): rotazione dei compagni, classifica individuale, abbinamenti adattivi e risultati progressivi (consultato il 20 settembre 2026).
- [LTA: formule di tabellone](https://www.lta.org.uk/support-centre/competing/competing-in-padel/what-are-the-draw-and-scoring-formats-for-lta-sanctioned-padel-tournaments/): riferimento per gironi e tabelloni; questi tornei privati non sono competizioni federali.

Le varianti esatte e gli spareggi sono sempre mostrati nella pagina del torneo: non si promette compatibilità con ogni regolamento chiamato “Americano” o “Mexicano”.

## Collaudo e rilascio

- `npm run check`: lint, suite completa (449 test), produzione, typecheck notifier e dry-run scheduler. Le nuove prove coprono rotazioni complete fino a 32 giocatori, gironi con riposi, tabelloni 8/16/32, consensi reciproci, pareggi, scadenza esatta, permessi e conflitti di revisione.
- `npm run test:rules:tournaments`: 50 scenari con risorse sintetiche e `get()` simulato nell’API Rules; nessuna lettura o scrittura di partite reali. Quota API assegnata esplicitamente al progetto di `.firebaserc`, non al progetto predefinito delle credenziali locali.
- Browser locale, desktop 1280×900 e mobile 390×844: creazione bozza/pubblicazione, visibilità membri, iscrizione, conferma reciproca della coppia, inserimento finale da un partecipante, blocco della conclusione senza finalina, finalina e podio. Controllate interfaccia nuova e classica, assenza di overflow orizzontale e navigazione dal menu account nell’app completa. Solo fixture in localStorage; nessun torneo di test sul database condiviso.
- Deploy limitato a Hosting, Firestore Rules e indice dei tornei. Nessun deploy di scheduler/notifier, nessuna migrazione, nessuna modifica ai documenti esistenti. Verificare l’indice `published ASC, startsAt DESC` in stato `READY` prima di considerare operativo l’elenco per i membri.
