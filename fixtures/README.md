# Fixtures Pipeline Commerciale

Copia qui i file originali del pacchetto handoff (non ritrascritti dalla chat,
per evitare corruzioni di encoding — vedi nota in `scripts/import-pipeline-fixtures.mjs`):

```
fixtures/oriens/2026-09-02.json
fixtures/oriens/2026-09-11.json
fixtures/oriens/2026-10-05.json
fixtures/oriens/2026-10-08.json
fixtures/digiduu/2026-07-03.json
fixtures/digiduu/2026-07-29.json
fixtures/digiduu/2026-08-07.json
fixtures/digiduu/2026-09-02.json
fixtures/digiduu/2026-09-11.json
fixtures/digiduu/2026-10-05.json
fixtures/digiduu/2026-10-08.json
```

La generazione del 2026-10-05 è la prima con la distinzione "Previsione - Probabile" /
"Previsione - Possibile" al posto dell'unica "Previsione - Offerta" (vedi `source_note` nel
file stesso per il dettaglio della regola Odoo usata).

Poi genera l'SQL di seed con:

```bash
node scripts/import-pipeline-fixtures.mjs
```

Lo script scrive `supabase/seed-pipeline-fixtures.sql`: incollalo nell'SQL
Editor del progetto Supabase (Studio) per popolare `pipeline_generations`.

# Fixtures Report Progetti Digiduu

Stesso pattern, tabella diversa. Copia qui i file originali del pacchetto di
handoff "Report progetti Digiduu" (nome file = data di generazione, niente
sottocartelle per azienda: il report è scoping fisso a Digiduu):

```
fixtures/report-progetti/2026-09-04.json
```

Poi genera l'SQL di seed con:

```bash
node scripts/import-report-progetti-fixtures.mjs
```

Lo script scrive `supabase/seed-report-progetti-fixtures.sql`: incollalo
nell'SQL Editor del progetto Supabase (Studio) per popolare
`report_progetti_generations` (va prima applicata la migration
`20260911150000_report_progetti_generations.sql`).

# Fixtures Report Progetti Oriens

Stesso pattern, tabella diversa (stessa struttura di "Report Progetti Digiduu" ma
scoping fisso a Oriens Consulting). Fase 1: dato statico trascritto dal report di
riferimento, nessuna connessione dal vivo a Odoo in questa fase.

```
fixtures/report-progetti-oriens/2026-09-25.json
```

Poi genera l'SQL di seed con:

```bash
node scripts/import-report-progetti-oriens-fixtures.mjs
```

Lo script scrive `supabase/seed-report-progetti-oriens-fixtures.sql`: incollalo
nell'SQL Editor del progetto Supabase (Studio) per popolare
`report_progetti_oriens_generations` (va prima applicata la migration
`20261007100000_report_progetti_oriens_generations.sql`). Questa tabella ha una
RLS più stretta delle altre: solo utenti `visibility_group='global'` o
superadmin possono leggerla.

# Portfolio Progetti Digiduu

Modulo che ha sostituito "Report Progetti Digiduu" (pagine e voce di menu
rimosse; i soli file di codice condiviso sotto `app/(app)/report-progetti/`
restano, perché questo modulo li riusa), con schema granulare (tabelle
`ppd_*`) e RLS reali per Project Leader, invece di un unico documento jsonb.

```
fixtures/portfolio-progetti-digiduu/2026-10-06.json
```

La generazione del 06/10/2026 è stata risincronizzata dal vivo da Odoo
(sessione Claude + MCP): giornate/ricavi, raggruppamento per Progetto Padre,
storico mensile delle giornate a foglio ore, milestone, fasi di lavoro,
fatture e pianificazione futura sono reali e aggiornati. **I documenti
SAL/Certificato fanno eccezione**: sono ripresi così come trovati nella
generazione precedente di Report Progetti Digiduu
(`fixtures/report-progetti/2026-09-04.json`) — rifare da zero la ricerca su
SharePoint per ogni cliente non era in scope di questo aggiornamento. Vedi i
"Limiti noti" mostrati in fondo alla pagina del modulo per il dettaglio.

```bash
node scripts/import-portfolio-progetti-digiduu-fixtures.mjs
```

Lo script scrive `supabase/seed-portfolio-progetti-digiduu.sql`: incollalo
nell'SQL Editor del progetto Supabase (Studio) per popolare le tabelle `ppd_*`
(va prima applicata la migration
`20261008090000_portfolio_progetti_digiduu.sql`, che aggiunge anche la colonna
`profiles.odoo_partner_id`).

## Progetti attivi per fase (Recap globale, §6.3)

Fixture e tabella separati dal resto del modulo, perché qui si contano i
**singoli progetti Odoo**, non i gruppi/progetti padre (un progetto padre può
unire più progetti con fase diversa):

```
fixtures/portfolio-progetti-digiduu/active-projects-by-phase-2026-10-08.json
```

Dati recuperati dal vivo da Odoo (sessione Claude + MCP) il 06/10/2026 e poi
di nuovo l'08/10/2026, ciascuno riferito allo stesso `ppd_sync_runs` di quella
data. **Nota su "Assistenza"**: per coerenza con il prompt di handoff (§1.1,
§6.3) "Con etichetta Assistenza" conta tutti i progetti con l'etichetta Odoo
"Assistenza" (id 71) — **33** sia nell'aggiornamento del 06/10/2026 sia in
quello dell'08/10/2026 — diverso dai **26** del riferimento storico del
01/10/2026 (che a un controllo risulta aver contato solo il sottoinsieme
"assistenza" nel nome del progetto, cioè la sola categoria "contratti di
assistenza" di §6.3 punto 4c, non tutta l'etichetta). Il numero totale di
progetti attivi era salito da 52 a 84 nei 5 giorni tra la generazione storica
e quella del 06/10/2026 (più probabile crescita reale, es. AMG, Essemec,
Edilklima, che un errore di perimetro); nei 2 giorni tra il 06/10/2026 e
l'08/10/2026 l'insieme dei progetti attivi è invece rimasto identico
(stessi 84 id, stesse fasi, stesso PL, stessa etichetta Assistenza — 10 Da
fare / 74 In corso, 26 senza PL assegnato), coerente con un periodo breve e
senza eventi di sincronizzazione nel mezzo. Non è stato trovato nessun
progetto con l'etichetta o la fase "Non aggiornare" da escludere
ulteriormente (confermato anche nell'aggiornamento dell'08/10/2026).

```bash
node scripts/import-ppd-active-projects-by-phase.mjs
```

Lo script scrive `supabase/seed-ppd-active-projects-by-phase.sql`: incollalo
nell'SQL Editor di Supabase Studio **dopo** aver applicato la migration
`20261009090000_ppd_active_projects_by_phase.sql` e dopo aver già incollato il
seed principale del modulo qui sopra (che crea la riga `ppd_sync_runs`
referenziata).

# Aggiornamento da Odoo (dal 14/10/2026)

Pipeline Commerciale (Oriens + Digiduu) e Portfolio Progetti Digiduu si
rigenerano da zero leggendo Odoo via MCP in una sessione Claude, senza
ricopiare numeri dalle generazioni precedenti. Gli scarichi grezzi
(risultati di `search_records`/`aggregate_records` salvati su disco dal tool,
mai ritrascritti a mano) vanno in una cartella temporanea; l'elenco dei file
e dei campi attesi è in testa a ciascuno script, insieme alle regole di
calcolo (verificate gruppo per gruppo contro la generazione del 08/10/2026).

```bash
node scripts/build-pipeline-fixture.mjs <cartella-scarichi-pipeline> <YYYY-MM-DD>
node scripts/build-portfolio-fixture.mjs <cartella-scarichi-portfolio> <YYYY-MM-DD>
```

Il caricamento su Supabase avviene poi direttamente con la service role (da
`.env.local`), senza SQL da incollare — è una scrittura in produzione, va
lanciato solo dopo conferma:

```bash
node scripts/load-odoo-sync.mjs --pipeline <YYYY-MM-DD> --portfolio <YYYY-MM-DD>
```

Lo script non sovrascrive le versioni Pipeline salvate a mano (con
`snapshot_label`) e non tocca le note di analisi/PL scritte nell'app. Non
vengono da Odoo, e quindi sono riprese dalla generazione precedente: il
target annuo per cliente della Pipeline Digiduu e i documenti
SAL/Certificato del Portfolio.

## Report Progetti Oriens e Capacity Digiduu (dal 20/10/2026)

Anche il Report Progetti Oriens si rigenera da Odoo, non più per trascrizione
manuale: baseline dall'ordine di vendita, actual/bozza da fatture cliente e
fornitore imputate al conto analitico del progetto e dai fogli ore, dettaglio
per consulente dalle righe d'ordine "CONSULENZA A PROGETTO X.COGNOME". Le
anomalie sono regole automatiche; le note scritte a mano nella generazione
precedente restano allegate a ogni progetto come "note storiche". File grezzi
e regole in testa allo script.

```bash
node scripts/build-oriens-report-fixture.mjs <cartella-scarichi-oriens> <YYYY-MM-DD>
node scripts/build-capacity-fixture.mjs <cartella-scarichi-capacity> <YYYY-MM-DD>
node scripts/load-odoo-sync.mjs --oriens-report <YYYY-MM-DD> --capacity <YYYY-MM-DD>
```
