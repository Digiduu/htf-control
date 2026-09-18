# Fixtures Pipeline Commerciale

Copia qui i file originali del pacchetto handoff (non ritrascritti dalla chat,
per evitare corruzioni di encoding — vedi nota in `scripts/import-pipeline-fixtures.mjs`):

```
fixtures/oriens/2026-09-02.json
fixtures/oriens/2026-09-11.json
fixtures/digiduu/2026-07-03.json
fixtures/digiduu/2026-07-29.json
fixtures/digiduu/2026-08-07.json
fixtures/digiduu/2026-09-02.json
fixtures/digiduu/2026-09-11.json
```

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
