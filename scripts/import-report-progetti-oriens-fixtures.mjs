#!/usr/bin/env node
// Legge fixtures/report-progetti-oriens/<data>.json e genera un file SQL con
// gli INSERT (idempotenti, ON CONFLICT DO UPDATE) per popolare
// report_progetti_oriens_generations. Non tocca mai la rete/il progetto
// Supabase direttamente: l'SQL generato va incollato a mano nello SQL Editor
// di Supabase Studio (nessuna service role key necessaria in questa sessione).
// Porting diretto di scripts/import-report-progetti-fixtures.mjs, stessa
// struttura senza asse "company" (il report è scoping fisso a Oriens Consulting).
//
// Uso: node scripts/import-report-progetti-oriens-fixtures.mjs

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const FIXTURES_DIR = join("fixtures", "report-progetti-oriens");
const OUT_FILE = join("supabase", "seed-report-progetti-oriens-fixtures.sql");
const GENERATED_BY = "Sessione Claude + MCP (Odoo interno + SharePoint/Teams)";

// Marker tipici di un file UTF-8 decodificato erroneamente come Windows-1252
// (mojibake): se compaiono, il file è probabilmente corrotto e va risolto
// alla fonte (non lo "aggiusto" automaticamente per non rischiare di
// introdurre un dato sbagliato su cifre/nomi cliente/PL).
const MOJIBAKE_MARKERS = ["Ã¨", "Ã ", "Ã©", "Ã²", "â‚¬", "Ã¬", "Ã¹", "Â·"];

function checkMojibake(raw, filePath) {
  const found = MOJIBAKE_MARKERS.filter((m) => raw.includes(m));
  if (found.length) {
    console.warn(
      `⚠️  ${filePath}: possibile mojibake (${found.join(", ")}) — verifica l'encoding del file sorgente prima di usarlo.`
    );
  }
}

function sqlDollarQuote(jsonText) {
  // I nomi cliente/progetto/note possono contenere praticamente qualunque
  // carattere; il dollar-quoting evita di dover escapare apici singoli nel JSON.
  let tag = "json";
  let i = 0;
  while (jsonText.includes(`$${tag}$`)) {
    tag = `json${i++}`;
  }
  return `$${tag}$${jsonText}$${tag}$`;
}

function main() {
  if (!existsSync(FIXTURES_DIR)) {
    console.error(
      `❌ ${FIXTURES_DIR} non trovata. Copia i file in fixtures/report-progetti-oriens/ (nome file = data YYYY-MM-DD.json) e riprova.`
    );
    process.exit(1);
  }

  const rows = [];
  for (const file of readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json"))) {
    const date = file.replace(/\.json$/, "");
    const filePath = join(FIXTURES_DIR, file);
    const raw = readFileSync(filePath, "utf-8");
    checkMojibake(raw, filePath);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error(`❌ ${filePath}: JSON non valido (${err.message}), salto.`);
      continue;
    }

    const jsonLiteral = sqlDollarQuote(JSON.stringify(parsed));
    rows.push(
      `insert into public.report_progetti_oriens_generations (date, data, generated_by)\n` +
        `values ('${date}', ${jsonLiteral}::jsonb, '${GENERATED_BY}')\n` +
        `on conflict (date) do update set data = excluded.data, generated_by = excluded.generated_by;`
    );
  }

  if (!rows.length) {
    console.error(
      "Nessun fixture trovato. Copia i file in fixtures/report-progetti-oriens/ (vedi fixtures/README.md) e riprova."
    );
    process.exit(1);
  }

  writeFileSync(OUT_FILE, rows.join("\n\n") + "\n", "utf-8");
  console.log(`✅ Scritte ${rows.length} generazioni in ${OUT_FILE}`);
}

main();
