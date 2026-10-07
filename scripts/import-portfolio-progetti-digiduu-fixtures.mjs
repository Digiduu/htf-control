#!/usr/bin/env node
// Legge fixtures/portfolio-progetti-digiduu/<data>.json (array di
// ProjectLeaderReport, con in più un campo monthlyDays per gruppo con le
// giornate registrate a foglio ore per mese) e genera gli INSERT per lo
// schema granulare di Portfolio Progetti Digiduu (tabelle ppd_*, vedi
// migration 20261008090000_portfolio_progetti_digiduu.sql) in
// supabase/seed-portfolio-progetti-digiduu.sql, da incollare a mano in
// Supabase Studio (nessuna chiamata di rete da questo script).
//
// La generazione del 06/10/2026 è stata risincronizzata dal vivo da Odoo
// (sessione Claude + MCP): giornate/ricavi, raggruppamento per Progetto
// Padre, storico mensile, milestone, fasi di lavoro, fatture e
// pianificazione sono reali. I documenti SAL/Certificato restano invece
// ripresi dalla generazione precedente del 04/09/2026 (nessuna nuova
// ricerca SharePoint in questo giro, vedi fixtures/README.md).
//
// Uso: node scripts/import-portfolio-progetti-digiduu-fixtures.mjs

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const FIXTURES_DIR = join("fixtures", "portfolio-progetti-digiduu");
const OUT_FILE = join("supabase", "seed-portfolio-progetti-digiduu.sql");

// Appendice A del prompt di handoff "Portfolio Progetti Digiduu": note di
// analisi scritte a mano, identificate per codice progetto (cercato come
// prefisso nel nome del gruppo). Se un codice non viene trovato nei fixture
// attuali, lo script lo segnala e salta quella nota (non inventa un group_id).
const ANALYSIS_NOTES = [
  {
    code: "DD10013",
    note: "Progetto attivo da agosto 2024: le 49 giornate ordinate non rappresentano più un affiancamento pluriennale, quindi lo sforamento va letto come scope superato più che come problema di consuntivazione. Nessuna fattura specifica per luglio 2026 (probabilmente accorpata in quella di agosto).",
  },
  {
    // Il gruppo è nominato "DD101TBD" (anomalia del dato segnalata nel
    // prompt di handoff §1.2), non "DD10203": il progetto DD10203 è solo un
    // membro al suo interno, il nome del gruppo resta quello del padre.
    code: "DD101TBD",
    note: 'Ancora "In corso" su Odoo ma con fine (31/03/2026) già passata: verificare se va chiuso. Dopo il saldo di marzo ci sono ancora ore registrate fino a luglio, senza fatturato.',
  },
  {
    code: "DD10119",
    note: "Contratto chiuso a novembre 2025 (unica fattura da 6.750 €), ma con ore registrate fino a marzo 2026 senza fatturato corrispondente: margine già negativo in ulteriore peggioramento.",
  },
  {
    code: "DD10201",
    note: 'Giornate spese molto superiori alle ordinate (8), con fine progetto già scaduta. La milestone "Chiusura progetto" (30/09) cade dopo la fine progetto (31/08): va aggiornata una delle due date.',
  },
  {
    code: "DD10314",
    note: "Nessuna giornata registrata a foglio ore nonostante il fatturato emesso: verificare la consuntivazione.",
  },
];

function esc(v) {
  return String(v).replace(/'/g, "''");
}
function sqlStr(v) {
  return v === null || v === undefined ? "null" : `'${esc(v)}'`;
}
function sqlNum(v) {
  return v === null || v === undefined || Number.isNaN(v) ? "null" : String(v);
}
function sqlBool(v) {
  return v ? "true" : "false";
}
function sqlDate(v) {
  return v ? `'${esc(v)}'` : "null";
}
function sqlTextArray(arr) {
  if (!arr || !arr.length) return "'{}'::text[]";
  return `ARRAY[${arr.map((s) => sqlStr(s)).join(",")}]::text[]`;
}
function sqlIntArray(arr) {
  if (!arr || !arr.length) return "'{}'::integer[]";
  return `ARRAY[${arr.map((n) => sqlNum(n)).join(",")}]::integer[]`;
}

function buildInserts(report, dataAsOf) {
  const statements = [];
  // data_as_of è unique: il riferimento sotto trova sempre la stessa riga,
  // anche rieseguendo lo script più volte (idempotente, come il resto dell'app).
  const syncRunVar = `(select id from public.ppd_sync_runs where data_as_of = ${sqlDate(dataAsOf)})`;

  statements.push(
    `insert into public.ppd_sync_runs (data_as_of, generated_by, notes)\n` +
      `values (${sqlDate(dataAsOf)}, 'Sessione Claude + MCP Odoo (sync dal vivo); documenti SAL/Certificato ripresi dalla generazione del 2026-09-04', null)\n` +
      `on conflict (data_as_of) do update set generated_by = excluded.generated_by;`
  );

  const foundCodes = new Set();

  for (const pl of report) {
    if (pl.notes && pl.notes.length) {
      for (const note of pl.notes) {
        statements.push(
          `insert into public.ppd_pl_notes (pl_name, note) values (${sqlStr(pl.pl_name)}, ${sqlStr(note)});`
        );
      }
    }

    for (const g of pl.groups) {
      statements.push(
        `insert into public.ppd_project_groups (id, sync_run_id, pl_name, client_name, name, active, stage, date_start, date_end, chiusura, prop_days, prop_price, act_days, act_rev, draft_rev, plan_days, fc_rev, member_ids, member_names, baseline_excluded, tags, invoiced_total, draft_total, paid_total, overdue_total, overdue_count, task_total, omaggio_days, sospese_days)\n` +
          `values (${sqlNum(g.id)}, ${syncRunVar}, ${sqlStr(pl.pl_name)}, ${sqlStr(g.partner)}, ${sqlStr(g.name)}, ${sqlBool(g.active)}, ${sqlStr(g.stage)}, ${sqlDate(g.date_start)}, ${sqlDate(g.date_end)}, ${sqlDate(g.chiusura)}, ${sqlNum(g.prop_days)}, ${sqlNum(g.prop_price)}, ${sqlNum(g.act_days)}, ${sqlNum(g.act_rev)}, ${sqlNum(g.draft_rev)}, ${sqlNum(g.plan_days)}, ${sqlNum(g.fc_rev)}, ${sqlIntArray(g.ids)}, ${sqlTextArray(g.members)}, ${sqlTextArray(g.baseline_excluded)}, ${sqlTextArray(g.tags)}, ${sqlNum(g.invoiced_total)}, ${sqlNum(g.draft_total)}, ${sqlNum(g.paid_total)}, ${sqlNum(g.overdue_total)}, ${sqlNum(g.overdue_count)}, ${sqlNum(g.task_total)}, ${sqlNum(g.omaggio_days ?? 0)}, ${sqlNum(g.sospese_days ?? 0)})\n` +
          `on conflict (id) do update set sync_run_id = excluded.sync_run_id, pl_name = excluded.pl_name, client_name = excluded.client_name, name = excluded.name, active = excluded.active, stage = excluded.stage, date_start = excluded.date_start, date_end = excluded.date_end, chiusura = excluded.chiusura, prop_days = excluded.prop_days, prop_price = excluded.prop_price, act_days = excluded.act_days, act_rev = excluded.act_rev, draft_rev = excluded.draft_rev, plan_days = excluded.plan_days, fc_rev = excluded.fc_rev, member_ids = excluded.member_ids, member_names = excluded.member_names, baseline_excluded = excluded.baseline_excluded, tags = excluded.tags, invoiced_total = excluded.invoiced_total, draft_total = excluded.draft_total, paid_total = excluded.paid_total, overdue_total = excluded.overdue_total, overdue_count = excluded.overdue_count, task_total = excluded.task_total, omaggio_days = excluded.omaggio_days, sospese_days = excluded.sospese_days;`
      );

      statements.push(`delete from public.ppd_timesheet_monthly where group_id = ${sqlNum(g.id)};`);
      for (const [month, days] of Object.entries(g.monthlyDays || {})) {
        statements.push(
          `insert into public.ppd_timesheet_monthly (group_id, month, days) values (${sqlNum(g.id)}, ${sqlStr(month)}, ${sqlNum(days)});`
        );
      }

      statements.push(`delete from public.ppd_sale_orders where group_id = ${sqlNum(g.id)};`);
      for (const so of g.sale_orders || []) {
        statements.push(
          `insert into public.ppd_sale_orders (group_id, order_id, name, date_start, date_end) values (${sqlNum(g.id)}, ${sqlNum(so.id)}, ${sqlStr(so.name)}, ${sqlDate(so.date_start)}, ${sqlDate(so.date_end)});`
        );
      }

      statements.push(`delete from public.ppd_invoices where group_id = ${sqlNum(g.id)};`);
      for (const inv of g.invoices || []) {
        statements.push(
          `insert into public.ppd_invoices (group_id, invoice_date, due_date, state, amount, number, payment_state, is_credit_note, is_overdue) values (${sqlNum(g.id)}, ${sqlDate(inv.date)}, ${sqlDate(inv.due_date)}, ${sqlStr(inv.state)}, ${sqlNum(inv.amount)}, ${sqlStr(inv.number)}, ${sqlStr(inv.payment_state)}, ${sqlBool(inv.is_credit_note)}, ${sqlBool(inv.is_overdue)});`
        );
      }

      statements.push(`delete from public.ppd_planning_future where group_id = ${sqlNum(g.id)};`);
      for (const r of g.planning_future?.by_resource || []) {
        for (const [month, days] of Object.entries(r.days || {})) {
          statements.push(
            `insert into public.ppd_planning_future (group_id, resource, role, month, days) values (${sqlNum(g.id)}, ${sqlStr(r.resource)}, ${sqlStr(r.role)}, ${sqlStr(month)}, ${sqlNum(days)});`
          );
        }
      }

      statements.push(`delete from public.ppd_milestones where group_id = ${sqlNum(g.id)};`);
      for (const ms of g.milestones || []) {
        statements.push(
          `insert into public.ppd_milestones (group_id, name, deadline, is_reached, reached_date, source) values (${sqlNum(g.id)}, ${sqlStr(ms.name)}, ${sqlDate(ms.deadline)}, ${sqlBool(ms.is_reached)}, ${sqlDate(ms.reached_date)}, ${sqlStr(ms.source)});`
        );
      }

      statements.push(`delete from public.ppd_task_stages where group_id = ${sqlNum(g.id)};`);
      for (const ts of g.task_stages || []) {
        statements.push(
          `insert into public.ppd_task_stages (group_id, stage, count) values (${sqlNum(g.id)}, ${sqlStr(ts.stage)}, ${sqlNum(ts.count)});`
        );
      }

      statements.push(`delete from public.ppd_documents where group_id = ${sqlNum(g.id)};`);
      for (const d of g.sal_docs || []) {
        statements.push(
          `insert into public.ppd_documents (group_id, kind, name, location, doc_date, note) values (${sqlNum(g.id)}, 'sal', ${sqlStr(d.name)}, ${sqlStr(d.location)}, ${sqlDate(d.date)}, ${sqlStr(d.note)});`
        );
      }
      for (const d of g.cert_docs || []) {
        statements.push(
          `insert into public.ppd_documents (group_id, kind, name, location, doc_date, note) values (${sqlNum(g.id)}, 'certificato', ${sqlStr(d.name)}, ${sqlStr(d.location)}, ${sqlDate(d.date)}, ${sqlStr(d.note)});`
        );
      }

      for (const an of ANALYSIS_NOTES) {
        if (g.name && g.name.startsWith(an.code)) {
          foundCodes.add(an.code);
          statements.push(
            `insert into public.ppd_analysis_notes (group_id, note, updated_by) values (${sqlNum(g.id)}, ${sqlStr(an.note)}, 'Appendice A — prompt di handoff')\n` +
              `on conflict (group_id) do update set note = excluded.note, updated_by = excluded.updated_by, updated_at = now();`
          );
        }
      }
    }
  }

  for (const an of ANALYSIS_NOTES) {
    if (!foundCodes.has(an.code)) {
      console.warn(`⚠️  Nota di analisi per ${an.code}: nessun gruppo trovato con questo codice, nota saltata.`);
    }
  }

  return statements;
}

function main() {
  if (!existsSync(FIXTURES_DIR)) {
    console.error(`❌ ${FIXTURES_DIR} non trovata.`);
    process.exit(1);
  }

  // Solo fixture datate "YYYY-MM-DD.json": la cartella contiene anche
  // "active-projects-by-phase-*.json" (dati di un'altra sezione, forma
  // diversa — §6.3), che qui andrebbe saltato, non processato come generazione.
  const files = readdirSync(FIXTURES_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  if (!files.length) {
    console.error(`❌ Nessun fixture .json trovato in ${FIXTURES_DIR}.`);
    process.exit(1);
  }

  const allStatements = [];
  let groupCount = 0;
  let plCount = 0;

  for (const file of files) {
    const dataAsOf = file.replace(/\.json$/, "");
    const filePath = join(FIXTURES_DIR, file);
    const raw = readFileSync(filePath, "utf-8");
    let report;
    try {
      report = JSON.parse(raw);
    } catch (err) {
      console.error(`❌ ${filePath}: JSON non valido (${err.message}), salto.`);
      continue;
    }

    plCount += report.length;
    groupCount += report.reduce((a, pl) => a + pl.groups.length, 0);
    allStatements.push(...buildInserts(report, dataAsOf));
  }

  writeFileSync(OUT_FILE, allStatements.join("\n") + "\n", "utf-8");
  console.log(`✅ Scritte ${allStatements.length} istruzioni SQL in ${OUT_FILE} (${plCount} Project Leader, ${groupCount} gruppi).`);
}

main();
