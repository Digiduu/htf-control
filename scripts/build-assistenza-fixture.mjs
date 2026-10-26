#!/usr/bin/env node
// Costruisce il fixture del Report Assistenza Digiduu
// (fixtures/report-assistenza/<data>.json) dagli scarichi grezzi di Odoo fatti
// via MCP in una sessione Claude (solo letture, salvati su disco così come
// restituiti, mai ritrascritti a mano). Poi va caricato con
// scripts/load-odoo-sync.mjs --assistenza <data>.
//
// File attesi in <raw>:
// - projects.json      project.project company_id=6, tag_ids in [71 "Assistenza"],
//                      tag_ids not in [58 "Progetti Interni"], is_template=false,
//                      fase "In corso", ordinati per nome (name, partner_id,
//                      allocated_hours, date_start, date, partner_project_leader_id,
//                      user_id, reinvoiced_sale_order_id, sale_order_id, account_id)
// - timesheet.json     aggregate account.analytic.line project_id in <progetti>,
//                      date >= 2024-07-01, groupby [project_id, date:month],
//                      unit_amount:sum (ore)
// - timesheet_no_so.json  come sopra con so_line = false (ore senza riga
//                      d'ordine di vendita)
// - inv_lines.json     account.move.line out_invoice/out_refund, draft+posted,
//                      display_type=product, distribution_analytic_account_ids
//                      in <conti analitici dei progetti> (move_id, date,
//                      parent_state, move_type, balance, analytic_distribution)
// - inv_lines_so.json  stesse righe ma senza distribuzione analitica, collegate
//                      (sale_line_ids.order_id) agli ordini dei progetti
// - so_lines.json      sale.order.line di quelle righe (order_id)
//
// Regole:
// - Fatturato = imponibile delle righe di fattura cliente imputate al conto
//   analitico del progetto (in proporzione alla distribuzione), più quelle
//   senza distribuzione collegate al suo ordine; note di credito sottratte.
//   Mese = data contabile della fattura. Bozze tenute separate (fatturato_bozza).
// - Ore = foglio ore sul progetto; ore_senza_ordine = la parte senza riga
//   d'ordine di vendita.
// - Ore previste = allocated_hours del progetto ("Ore previste" in testata).
//
// Uso: node scripts/build-assistenza-fixture.mjs <raw> <YYYY-MM-DD>

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [raw, dataAsOf] = process.argv.slice(2);
if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(dataAsOf || "")) {
  console.error("Uso: node scripts/build-assistenza-fixture.mjs <raw> <YYYY-MM-DD>");
  process.exit(1);
}
const load = (f) => JSON.parse(readFileSync(join(raw, f), "utf-8"));
const round2 = (n) => Math.round(n * 100) / 100;

const projects = load("projects.json").records;
const byId = new Map();
const byAccount = new Map();
const byOrder = new Map();
const out = projects.map((p) => {
  const codice = /^DD\d+(-\d+)?/.exec(p.name)?.[0] ?? null;
  const order = p.sale_order_id || p.reinvoiced_sale_order_id;
  const row = {
    id: p.id,
    codice,
    nome: p.name.trim(),
    // Senza cliente in Odoo: il secondo pezzo del nome ("DD10013 - Brombal - Assistenza")
    cliente: p.partner_id ? p.partner_id[1].trim() : codice ? p.name.split(" - ")[1]?.trim() ?? null : null,
    project_leader: p.partner_project_leader_id ? p.partner_project_leader_id[1] : null,
    responsabile: p.user_id ? p.user_id[1] : null,
    ordine: order ? order[1] : null,
    ore_previste: p.allocated_hours || 0,
    date_start: p.date_start || null,
    date_end: p.date || null,
    months: {},
  };
  byId.set(p.id, row);
  if (p.account_id) byAccount.set(String(p.account_id[0]), row);
  if (order && !byOrder.has(order[0])) byOrder.set(order[0], row);
  return row;
});

function cell(row, ym) {
  return (row.months[ym] ||= { fatturato: 0, fatturato_bozza: 0, ore: 0, ore_senza_ordine: 0 });
}

for (const g of load("timesheet.json").groups) {
  const row = byId.get(g.project_id[0]);
  if (row) cell(row, g["date:month"][0].slice(0, 7)).ore += g["unit_amount:sum"];
}
for (const g of load("timesheet_no_so.json").groups) {
  const row = byId.get(g.project_id[0]);
  if (row) cell(row, g["date:month"][0].slice(0, 7)).ore_senza_ordine += g["unit_amount:sum"];
}

function addRevenue(row, line, share) {
  const c = cell(row, line.date.slice(0, 7));
  const v = -line.balance * share;
  c.fatturato += v;
  if (line.parent_state === "draft") c.fatturato_bozza += v;
}
let unmatched = 0;
for (const l of load("inv_lines.json").records) {
  let matched = false;
  for (const [key, pct] of Object.entries(l.analytic_distribution || {})) {
    // Le chiavi possono combinare più conti di piani diversi ("931,12")
    const row = key.split(",").map((k) => byAccount.get(k)).find(Boolean);
    if (row) {
      addRevenue(row, l, pct / 100);
      matched = true;
    }
  }
  if (!matched) unmatched++;
}
const orderOfSoLine = new Map(load("so_lines.json").records.map((s) => [s.id, s.order_id[0]]));
for (const l of load("inv_lines_so.json").records) {
  const row = byOrder.get(orderOfSoLine.get(l.sale_line_ids[0]));
  if (row) addRevenue(row, l, 1);
  else unmatched++;
}

for (const row of out) {
  for (const c of Object.values(row.months)) {
    for (const k of Object.keys(c)) c[k] = round2(c[k]);
  }
}

const doc = {
  data_as_of: dataAsOf,
  generated_at: `${dataAsOf}T00:00:00+02:00`,
  source_note: `Rigenerazione del ${dataAsOf} da Odoo via MCP: progetti Digiduu con etichetta Assistenza in fase In corso.`,
  projects: out,
};
mkdirSync(join("fixtures", "report-assistenza"), { recursive: true });
const file = join("fixtures", "report-assistenza", `${dataAsOf}.json`);
writeFileSync(file, JSON.stringify(doc, null, 2) + "\n", "utf-8");

const sum = (k) => round2(out.reduce((a, r) => a + Object.values(r.months).reduce((b, c) => b + c[k], 0), 0));
console.log(`=== Report Assistenza → ${file}`);
console.log(`progetti: ${out.length}  fatturato: ${sum("fatturato")} (bozza ${sum("fatturato_bozza")})  ore: ${sum("ore")} (senza ordine ${sum("ore_senza_ordine")})`);
if (unmatched) console.warn(`⚠️  righe di fattura non attribuite a nessun progetto: ${unmatched}`);
const noDates = out.filter((r) => !r.date_end).map((r) => r.nome);
if (noDates.length) console.log(`  senza data di fine: ${noDates.join(", ")}`);
const noPl = out.filter((r) => !r.project_leader).map((r) => r.nome);
if (noPl.length) console.log(`  senza Project Leader del contatto: ${noPl.join(", ")}`);
