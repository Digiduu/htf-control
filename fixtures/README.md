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
