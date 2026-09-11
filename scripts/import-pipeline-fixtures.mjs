#!/usr/bin/env node
// Legge fixtures/<company>/<data>.json e genera un file SQL con gli INSERT
// (idempotenti, ON CONFLICT DO NOTHING) per popolare pipeline_generations.
// Non tocca mai la rete/il progetto Supabase direttamente: l'SQL generato va
// incollato a mano nello SQL Editor di Supabase Studio (nessuna service role
// key necessaria in questa sessione).
//
// Uso: node scripts/import-pipeline-fixtures.mjs

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const FIXTURES_DIR = "fixtures";
const OUT_FILE = join("supabase", "seed-pipeline-fixtures.sql");
const COMPANIES = ["oriens", "digiduu"];

// Marker tipici di un file UTF-8 decodificato erroneamente come Windows-1252
// (mojibake): se compaiono, il file è probabilmente corrotto e va risolto
// alla fonte (non lo "aggiusto" automaticamente per non rischiare di
// introdurre un dato sbagliato su cifre/nomi cliente).
const MOJIBAKE_MARKERS = ["Ã¨", "Ã ", "Ã©", "Ã²", "â‚¬", "Ã¬", "Ã¹"];

function checkMojibake(raw, filePath) {
  const found = MOJIBAKE_MARKERS.filter((m) => raw.includes(m));
  if (found.length) {
    console.warn(
      `⚠️  ${filePath}: possibile mojibake (${found.join(", ")}) — verifica l'encoding del file sorgente prima di usarlo.`
    );
  }
}

function sqlDollarQuote(jsonText) {
  // I nomi cliente/note possono contenere praticamente qualunque carattere;
  // il dollar-quoting evita di dover escapare apici singoli nel JSON.
  let tag = "json";
  let i = 0;
  while (jsonText.includes(`$${tag}$`)) {
    tag = `json${i++}`;
  }
  return `$${tag}$${jsonText}$${tag}$`;
}

function main() {
  const rows = [];

  for (const company of COMPANIES) {
    const dir = join(FIXTURES_DIR, company);
    if (!existsSync(dir)) {
      console.warn(`⚠️  ${dir} non trovata, salto.`);
      continue;
    }
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const date = file.replace(/\.json$/, "");
      const filePath = join(dir, file);
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
        `insert into public.pipeline_generations (company, date, data)\n` +
          `values ('${company}', '${date}', ${jsonLiteral}::jsonb)\n` +
          `on conflict (company, date) do update set data = excluded.data;`
      );
    }
  }

  if (!rows.length) {
    console.error(
      "Nessun fixture trovato. Copia i file in fixtures/oriens/ e fixtures/digiduu/ (vedi fixtures/README.md) e riprova."
    );
    process.exit(1);
  }

  writeFileSync(OUT_FILE, rows.join("\n\n") + "\n", "utf-8");
  console.log(`✅ Scritte ${rows.length} generazioni in ${OUT_FILE}`);
}

main();
