#!/usr/bin/env node
// Genera il seed SQL per ppd_active_projects_by_phase ("Progetti attivi per
// fase", prompt di handoff §6.3) a partire da un fixture JSON separato dal
// resto del modulo (fixtures/portfolio-progetti-digiduu/active-projects-by-phase-*.json):
// qui si contano i singoli progetti Odoo, non i gruppi/progetti padre, quindi
// vive in una tabella e in un fixture propri. I dati sono stati recuperati dal
// vivo da Odoo (sessione Claude + MCP) il 06/10/2026 e fanno riferimento allo
// stesso ppd_sync_runs già usato dal resto del modulo per quella data.
//
// Uso:
//   node scripts/import-ppd-active-projects-by-phase.mjs
//
// Scrive supabase/seed-ppd-active-projects-by-phase.sql: incollalo nell'SQL
// Editor di Supabase Studio (dopo aver applicato la migration
// 20261009090000_ppd_active_projects_by_phase.sql e dopo aver già incollato
// il seed principale del modulo, che crea la riga ppd_sync_runs referenziata).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATA_AS_OF = "2026-10-06";
const FIXTURE_PATH = join("fixtures", "portfolio-progetti-digiduu", `active-projects-by-phase-${DATA_AS_OF}.json`);

function sqlStr(s) {
  if (s == null) return "null";
  return `'${String(s).replace(/'/g, "''")}'`;
}

function sqlBool(b) {
  return b ? "true" : "false";
}

function main() {
  const projects = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));
  if (!Array.isArray(projects) || projects.length === 0) {
    throw new Error(`Fixture vuoto o non valido: ${FIXTURE_PATH}`);
  }

  const seenIds = new Set();
  for (const p of projects) {
    if (seenIds.has(p.id)) throw new Error(`Id progetto duplicato nel fixture: ${p.id}`);
    seenIds.add(p.id);
    if (!["Da fare", "In corso"].includes(p.stage)) throw new Error(`Stage non valido per il progetto ${p.id}: ${p.stage}`);
  }

  const statements = [];
  statements.push(`delete from public.ppd_active_projects_by_phase where sync_run_id = (select id from public.ppd_sync_runs where data_as_of = ${sqlStr(DATA_AS_OF)});`);
  for (const p of projects) {
    statements.push(
      `insert into public.ppd_active_projects_by_phase (id, sync_run_id, pl_name, project_name, stage, is_assistenza) values (${p.id}, (select id from public.ppd_sync_runs where data_as_of = ${sqlStr(DATA_AS_OF)}), ${sqlStr(p.pl_name)}, ${sqlStr(p.project_name)}, ${sqlStr(p.stage)}, ${sqlBool(p.is_assistenza)}) on conflict (id) do update set sync_run_id = excluded.sync_run_id, pl_name = excluded.pl_name, project_name = excluded.project_name, stage = excluded.stage, is_assistenza = excluded.is_assistenza;`
    );
  }

  const out = statements.join("\n") + "\n";
  writeFileSync("supabase/seed-ppd-active-projects-by-phase.sql", out, "utf-8");

  const daFare = projects.filter((p) => p.stage === "Da fare").length;
  const inCorso = projects.filter((p) => p.stage === "In corso").length;
  const assistenza = projects.filter((p) => p.is_assistenza).length;
  console.log(`OK: ${projects.length} progetti (${daFare} da fare, ${inCorso} in corso), ${assistenza} con etichetta Assistenza.`);
  console.log(`Scritto supabase/seed-ppd-active-projects-by-phase.sql (${statements.length} istruzioni).`);
}

main();
