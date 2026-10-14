#!/usr/bin/env node
// Carica direttamente su Supabase (service role, credenziali da .env.local)
// i fixture prodotti da build-pipeline-fixture.mjs e build-portfolio-fixture.mjs,
// al posto dei file SQL da incollare a mano in Supabase Studio. Scrive in
// produzione: va lanciato solo dopo conferma esplicita.
//
// Uso:
//   node scripts/load-odoo-sync.mjs [--local] --pipeline 2026-10-08 2026-10-14 --portfolio 2026-10-14
// (--local = Supabase locale avviato con `npx supabase start`)
//
// Pipeline: upsert di pipeline_generations per oriens+digiduu a quelle date,
// ma salta le righe già esistenti con snapshot_label (versioni salvate a
// mano dal pulsante "Salva versione di oggi").
// Portfolio: crea/aggiorna ppd_sync_runs, upsert dei gruppi, sostituisce le
// righe figlie dei gruppi presenti nel fixture, sostituisce per intero la
// tabella ppd_active_projects_by_phase. Non tocca ppd_analysis_notes né
// ppd_pl_notes (scritte a mano, non vengono da Odoo).

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const pipelineDates = [];
let portfolioDate = null;
for (let i = 0, mode = null; i < args.length; i++) {
  if (args[i] === "--local") continue;
  if (args[i] === "--pipeline") mode = "pipeline";
  else if (args[i] === "--portfolio") mode = "portfolio";
  else if (mode === "pipeline") pipelineDates.push(args[i]);
  else if (mode === "portfolio") portfolioDate = args[i];
}
if (!pipelineDates.length && !portfolioDate) {
  console.error("Uso: node scripts/load-odoo-sync.mjs [--pipeline <data>...] [--portfolio <data>]");
  process.exit(1);
}

const parseEnv = (text) =>
  Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
      })
  );
// --local: Supabase locale (credenziali da `supabase status`), altrimenti il
// progetto remoto di .env.local.
const local = args.includes("--local");
let url, serviceKey;
if (local) {
  const env = parseEnv(execSync("npx supabase status -o env", { encoding: "utf-8" }));
  url = env.API_URL;
  serviceKey = env.SERVICE_ROLE_KEY;
} else {
  const env = parseEnv(readFileSync(".env.local", "utf-8"));
  url = env.NEXT_PUBLIC_SUPABASE_URL;
  serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
}
console.log(`Destinazione: ${local ? "Supabase LOCALE" : "Supabase REMOTO"} (${url})`);
const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const readJson = (p) => JSON.parse(readFileSync(p, "utf-8"));
function check(res, what) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}
async function insertChunks(table, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    check(await supabase.from(table).insert(rows.slice(i, i + 500)), `insert ${table}`);
  }
}

async function loadPipeline(date) {
  for (const company of ["oriens", "digiduu"]) {
    const file = join("fixtures", company, `${date}.json`);
    if (!existsSync(file)) {
      console.warn(`⚠️  Pipeline ${company} ${date}: nessun fixture, salto.`);
      continue;
    }
    const data = readJson(file);
    const existing = check(
      await supabase.from("pipeline_generations").select("snapshot_label").eq("company", company).eq("date", date).maybeSingle(),
      "lettura pipeline_generations"
    );
    if (existing?.snapshot_label) {
      console.warn(`⚠️  Pipeline ${company} ${date}: esiste già una versione salvata a mano ("${existing.snapshot_label}"), non la sovrascrivo.`);
      continue;
    }
    check(await supabase.from("pipeline_generations").upsert({ company, date, data }, { onConflict: "company,date" }), "upsert pipeline_generations");
    console.log(`✅ Pipeline ${company} ${date}: ${data.rows.length} righe`);
  }
}

async function loadPortfolio(date) {
  const report = readJson(join("fixtures", "portfolio-progetti-digiduu", `${date}.json`));
  const active = readJson(join("fixtures", "portfolio-progetti-digiduu", `active-projects-by-phase-${date}.json`));

  const run = check(
    await supabase
      .from("ppd_sync_runs")
      .upsert(
        { data_as_of: date, generated_by: "Sessione Claude + MCP Odoo (sync dal vivo, scripts/build-portfolio-fixture.mjs); documenti SAL/Certificato ripresi dalla generazione del 2026-09-04" },
        { onConflict: "data_as_of" }
      )
      .select("id")
      .single(),
    "upsert ppd_sync_runs"
  );

  const groups = report.flatMap((pl) => pl.groups.map((g) => ({ pl_name: pl.pl_name, g })));
  const ids = groups.map(({ g }) => g.id);
  check(
    await supabase.from("ppd_project_groups").upsert(
      groups.map(({ pl_name, g }) => ({
        id: g.id,
        sync_run_id: run.id,
        pl_name,
        client_name: g.partner,
        name: g.name,
        active: g.active,
        stage: g.stage,
        date_start: g.date_start,
        date_end: g.date_end,
        chiusura: g.chiusura,
        prop_days: g.prop_days,
        prop_price: g.prop_price,
        act_days: g.act_days,
        act_rev: g.act_rev,
        draft_rev: g.draft_rev,
        plan_days: g.plan_days,
        fc_rev: g.fc_rev,
        member_ids: g.ids,
        member_names: g.members,
        baseline_excluded: g.baseline_excluded,
        tags: g.tags,
        invoiced_total: g.invoiced_total,
        draft_total: g.draft_total,
        paid_total: g.paid_total,
        overdue_total: g.overdue_total,
        overdue_count: g.overdue_count,
        task_total: g.task_total,
        omaggio_days: g.omaggio_days ?? 0,
        sospese_days: g.sospese_days ?? 0,
      })),
      { onConflict: "id" }
    ),
    "upsert ppd_project_groups"
  );

  const children = {
    ppd_timesheet_monthly: groups.flatMap(({ g }) => Object.entries(g.monthlyDays || {}).map(([month, days]) => ({ group_id: g.id, month, days }))),
    ppd_sale_orders: groups.flatMap(({ g }) => g.sale_orders.map((so) => ({ group_id: g.id, order_id: so.id, name: so.name, date_start: so.date_start, date_end: so.date_end }))),
    ppd_invoices: groups.flatMap(({ g }) =>
      g.invoices.map((inv) => ({
        group_id: g.id,
        invoice_date: inv.date,
        due_date: inv.due_date,
        state: inv.state,
        amount: inv.amount,
        number: inv.number,
        payment_state: inv.payment_state,
        is_credit_note: inv.is_credit_note,
        is_overdue: inv.is_overdue,
      }))
    ),
    ppd_planning_future: groups.flatMap(({ g }) =>
      g.planning_future.by_resource.flatMap((r) => Object.entries(r.days).map(([month, days]) => ({ group_id: g.id, resource: r.resource, role: r.role, month, days })))
    ),
    ppd_milestones: groups.flatMap(({ g }) =>
      g.milestones.map((ms) => ({ group_id: g.id, name: ms.name, deadline: ms.deadline, is_reached: ms.is_reached, reached_date: ms.reached_date, source: ms.source }))
    ),
    ppd_task_stages: groups.flatMap(({ g }) => g.task_stages.map((ts) => ({ group_id: g.id, stage: ts.stage, count: ts.count }))),
    ppd_documents: groups.flatMap(({ g }) => [
      ...g.sal_docs.map((d) => ({ group_id: g.id, kind: "sal", name: d.name, location: d.location, doc_date: d.date, note: d.note })),
      ...g.cert_docs.map((d) => ({ group_id: g.id, kind: "certificato", name: d.name, location: d.location, doc_date: d.date, note: d.note })),
    ]),
  };
  for (const [table, rows] of Object.entries(children)) {
    check(await supabase.from(table).delete().in("group_id", ids), `delete ${table}`);
    await insertChunks(table, rows);
    console.log(`✅ ${table}: ${rows.length} righe`);
  }
  console.log(`✅ ppd_project_groups: ${groups.length} gruppi (sync ${date})`);

  check(
    await supabase.from("ppd_active_projects_by_phase").upsert(
      active.map((p) => ({ ...p, sync_run_id: run.id })),
      { onConflict: "id" }
    ),
    "upsert ppd_active_projects_by_phase"
  );
  check(
    await supabase.from("ppd_active_projects_by_phase").delete().not("id", "in", `(${active.map((p) => p.id).join(",")})`),
    "pulizia ppd_active_projects_by_phase"
  );
  console.log(`✅ ppd_active_projects_by_phase: ${active.length} progetti`);
}

for (const d of pipelineDates) await loadPipeline(d);
if (portfolioDate) await loadPortfolio(portfolioDate);
