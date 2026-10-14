#!/usr/bin/env node
// Costruisce da zero i fixture di Portfolio Progetti Digiduu a partire dagli
// scarichi grezzi di Odoo fatti via MCP in una sessione Claude (risultati di
// search_records/aggregate_records salvati su disco così come restituiti):
//   fixtures/portfolio-progetti-digiduu/<data>.json
//   fixtures/portfolio-progetti-digiduu/active-projects-by-phase-<data>.json
// che poi vanno caricati con gli script di import già esistenti.
//
// Regole (ricostruite e verificate gruppo per gruppo contro la generazione
// del 08/10/2026, che era stata prodotta a mano in sessione):
// - Perimetro: progetti Digiduu (company_id=6), attivi e archiviati, esclusi
//   solo i modelli (is_template) e i progetti in fase "Non aggiornare" (i
//   progetti interni restano, come nelle generazioni precedenti).
// - Gruppo = conto analitico del progetto -> campo x_studio_progetto_padre;
//   senza padre il progetto è un gruppo a sé. Id e nome del gruppo: il
//   progetto il cui nome coincide col padre, altrimenti il primo membro
//   nell'ordinamento predefinito di Odoo (projects.json va scaricato così).
// - Numeri: somma dei campi pf_* dei membri; giornate/ricavi Baseline
//   (pf_proposal_*) contati una sola volta per ordine di vendita
//   (reinvoiced_sale_order_id), i membri doppi finiscono in baseline_excluded.
// - Stato/cliente/PL/chiusura dal progetto canonico; attivo se almeno un
//   membro è attivo; date = minima inizio e massima fine tra i membri.
// - Ordini: sale_order_id + reinvoiced_sale_order_id dei membri; fatture =
//   invoice_ids di quegli ordini (escluse le annullate), importo imponibile.
// - Pianificazione futura: planning.slot con inizio >= data di generazione,
//   ore/8 per risorsa, ruolo e mese.
// - Ore mensili e giornate Omaggio/Sospese: account.analytic.line, ore/8.
// - Documenti SAL/Certificato: non vengono da Odoo, ripresi per id gruppo
//   dall'ultima generazione esistente.
//
// File attesi in <raw>: projects.json, analytic.json, projects_so.json,
// sale_orders.json, moves.json, planning.json, milestones.json, tasks.json,
// tags.json, ts_monthly.json, ts_nota.json (vedi fixtures/README.md).
//
// Uso: node scripts/build-portfolio-fixture.mjs <raw> <YYYY-MM-DD>

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const [raw, dataAsOf] = process.argv.slice(2);
if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(dataAsOf || "")) {
  console.error("Uso: node scripts/build-portfolio-fixture.mjs <raw> <YYYY-MM-DD>");
  process.exit(1);
}
const OUT_DIR = join("fixtures", "portfolio-progetti-digiduu");
const load = (f) => JSON.parse(readFileSync(join(raw, f), "utf-8"));
const recs = (f) => load(f).records;

const NO_PL = "Nessun PL assegnato";
const ROLE_LABEL = {
  Developer: "SVILUPPO",
  "Solution Specialist": "APP SPECIALIST",
  "Project Leader": "PL",
  "Business Analyst": "BUSINESS ANALYST",
};
const ASSISTENZA_TAG_ID = 71;
const NON_AGGIORNARE_TAG_ID = 66;

// projects.json è già scaricato con domain company_id = 6
const projects = recs("projects.json");
const order = new Map(projects.map((p, i) => [p.id, i]));
const soLinks = new Map(recs("projects_so.json").map((p) => [p.id, p]));
const analytic = new Map(recs("analytic.json").map((a) => [a.id, a]));
const saleOrders = new Map(recs("sale_orders.json").map((s) => [s.id, s]));
const moves = new Map(recs("moves.json").map((m) => [m.id, m]));
const slots = recs("planning.json");
const milestones = recs("milestones.json");
const tasks = recs("tasks.json");
const tagNames = new Map(recs("tags.json").map((t) => [t.id, t.name]));
const tsMonthly = load("ts_monthly.json").groups;
const tsNota = load("ts_nota.json").groups;

const m2oName = (v) => (v ? v[1] : null);
const asciiSort = (arr) => [...arr].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

const inScope = (p) => !p.is_template && p.stage_id?.[1] !== "Non aggiornare";

// --- Gruppi per Progetto Padre -------------------------------------------
const buckets = new Map();
for (const p of projects.filter(inScope)) {
  const padre = p.account_id ? analytic.get(p.account_id[0])?.x_studio_progetto_padre : null;
  const key = padre || `__self__${p.id}`;
  if (!buckets.has(key)) buckets.set(key, { padre: padre || null, members: [] });
  buckets.get(key).members.push(p);
}

// Documenti SAL/Certificato dall'ultima generazione precedente
const prevFile = readdirSync(OUT_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f < `${dataAsOf}.json`).sort().pop();
const prevDocs = new Map();
if (prevFile) {
  for (const pl of JSON.parse(readFileSync(join(OUT_DIR, prevFile), "utf-8"))) {
    for (const g of pl.groups) prevDocs.set(g.id, { sal_docs: g.sal_docs || [], cert_docs: g.cert_docs || [] });
  }
}

const sum = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);
const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

const groups = [];
for (const { padre, members } of buckets.values()) {
  members.sort((a, b) => order.get(a.id) - order.get(b.id));
  const canon = (padre && members.find((m) => m.name === padre)) || members[0];
  const ids = members.map((m) => m.id);
  const idSet = new Set(ids);

  // Baseline una sola volta per ordine di vendita
  const seenSo = new Set();
  const base = [];
  const excluded = [];
  for (const m of members) {
    const so = m.reinvoiced_sale_order_id?.[0];
    if (so && seenSo.has(so)) excluded.push(m);
    else {
      base.push(m);
      if (so) seenSo.add(so);
    }
  }

  // Ordini e fatture
  const soIds = [];
  for (const m of members) {
    const l = soLinks.get(m.id) || m;
    for (const f of ["sale_order_id", "reinvoiced_sale_order_id"]) {
      if (l[f] && !soIds.includes(l[f][0])) soIds.push(l[f][0]);
    }
  }
  const sale_orders = soIds.map((id) => {
    const s = saleOrders.get(id);
    return { id, name: s?.name ?? null, date_start: s?.date_order ? s.date_order.slice(0, 10) : null, date_end: s?.x_studio_data_fine_progetto || null };
  });
  const invIds = [...new Set(soIds.flatMap((id) => saleOrders.get(id)?.invoice_ids || []))];
  const invoices = invIds
    .map((id) => moves.get(id))
    .filter((m) => m && m.state !== "cancel")
    .map((m) => {
      const is_credit_note = m.move_type === "out_refund";
      const due = m.invoice_date_due || null;
      return {
        date: m.invoice_date || null,
        due_date: due,
        state: m.state,
        amount: m.amount_untaxed,
        number: m.state === "posted" ? m.name : null,
        payment_state: m.payment_state,
        is_credit_note,
        is_overdue: m.state === "posted" && !is_credit_note && ["not_paid", "partial"].includes(m.payment_state) && !!due && due < dataAsOf,
      };
    })
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const signed = (i) => (i.is_credit_note ? -i.amount : i.amount);
  const posted = invoices.filter((i) => i.state === "posted");
  const overdue = invoices.filter((i) => i.is_overdue);
  // Incassato: fatture pagate/in pagamento meno le note di credito, ma una
  // nota di credito che storna una fattura "reversed" si compensa con essa
  // (nessuna delle due conta).
  const sumAmt = (arr) => sum(arr, (i) => i.amount);
  const paidInv = sumAmt(posted.filter((i) => !i.is_credit_note && ["paid", "in_payment"].includes(i.payment_state)));
  const reversedInv = sumAmt(posted.filter((i) => !i.is_credit_note && i.payment_state === "reversed"));
  const creditNotes = sumAmt(posted.filter((i) => i.is_credit_note));

  // Pianificazione futura
  const future = slots.filter((s) => idSet.has(s.project_id?.[0]) && s.start_datetime && s.start_datetime.slice(0, 10) >= dataAsOf);
  const byRes = new Map();
  for (const s of future) {
    const resource = m2oName(s.resource_id) || "Non assegnato";
    const role = ROLE_LABEL[m2oName(s.role_id)] || (m2oName(s.role_id) || "").toUpperCase() || null;
    const key = `${resource}|${role}`;
    if (!byRes.has(key)) byRes.set(key, { resource, role, days: {}, total: 0 });
    const r = byRes.get(key);
    const month = s.start_datetime.slice(0, 7);
    const days = (s.allocated_hours || 0) / 8;
    r.days[month] = round((r.days[month] || 0) + days);
    r.total = round(r.total + days);
  }
  const by_resource = [...byRes.values()];
  const planning_future = {
    months: asciiSort([...new Set(future.map((s) => s.start_datetime.slice(0, 7)))]),
    by_resource,
    total_days: round(sum(by_resource, (r) => r.total)),
    slot_count: future.length,
  };

  // Milestone, fasi dei lavori, ore
  const ms = milestones
    .filter((x) => idSet.has(x.project_id?.[0]))
    .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999") || a.sequence - b.sequence || a.id - b.id)
    .map((x) => ({ name: x.name, deadline: x.deadline || null, is_reached: !!x.is_reached, reached_date: x.reached_date || null, source: x.project_id[1] }));
  const stageCount = new Map();
  for (const t of tasks) {
    if (!idSet.has(t.project_id?.[0]) || !t.stage_id) continue;
    const [sid, sname] = t.stage_id;
    const cur = stageCount.get(sname) || { sid, count: 0 };
    cur.sid = Math.min(cur.sid, sid);
    cur.count++;
    stageCount.set(sname, cur);
  }
  const task_stages = [...stageCount.entries()].sort((a, b) => a[1].sid - b[1].sid).map(([stage, v]) => ({ stage, count: v.count }));
  const monthlyDays = {};
  for (const r of tsMonthly) {
    if (!idSet.has(r.project_id?.[0])) continue;
    const month = r["date:month"][0].slice(0, 7);
    monthlyDays[month] = (monthlyDays[month] || 0) + r["unit_amount:sum"] / 8;
  }
  const notaDays = (kind) => sum(tsNota.filter((r) => idSet.has(r.project_id?.[0]) && r.x_studio_nota === kind), (r) => r["unit_amount:sum"]) / 8;

  const starts = members.map((m) => m.date_start).filter(Boolean).sort();
  const ends = members.map((m) => m.date).filter(Boolean).sort();
  const docs = prevDocs.get(canon.id) || { sal_docs: [], cert_docs: [] };

  groups.push({
    pl_name: m2oName(canon.partner_project_leader_id) || NO_PL,
    group: {
      id: canon.id,
      ids,
      name: padre || canon.name,
      partner: m2oName(canon.partner_id),
      active: members.some((m) => m.active),
      stage: m2oName(canon.stage_id),
      date_start: starts[0] || null,
      date_end: ends[ends.length - 1] || null,
      chiusura: canon.x_studio_data_chiusura_progetto || null,
      prop_days: round(sum(base, (m) => m.pf_proposal_days)),
      prop_price: round(sum(base, (m) => m.pf_proposal_price), 2),
      act_days: round(sum(members, (m) => m.pf_actual_days)),
      act_rev: round(sum(members, (m) => m.pf_actual_revenue), 2),
      draft_rev: round(sum(members, (m) => m.pf_draft_revenue), 2),
      plan_days: round(sum(members, (m) => m.pf_planned_days)),
      fc_rev: round(sum(members, (m) => m.pf_forecast_revenue), 2),
      days_to_plan: round(sum(members, (m) => m.pf_days_to_plan)),
      members: members.map((m) => m.name),
      member_count: members.length,
      baseline_excluded: excluded.map((m) => m.name),
      sale_orders,
      invoices,
      invoiced_total: round(sum(posted, signed), 2),
      draft_total: round(sum(invoices.filter((i) => i.state === "draft"), signed), 2),
      paid_total: round(paidInv - Math.max(0, creditNotes - reversedInv), 2),
      planning_future,
      tags: asciiSort(new Set(members.flatMap((m) => (m.tag_ids || []).map((t) => tagNames.get(t)).filter(Boolean)))),
      milestones: ms,
      task_stages,
      task_total: sum(task_stages, (s) => s.count),
      sal_docs: docs.sal_docs,
      cert_docs: docs.cert_docs,
      overdue_total: round(sum(overdue, (i) => i.amount), 2),
      overdue_count: overdue.length,
      monthlyDays,
      omaggio_days: notaDays("Omaggio"),
      sospese_days: notaDays("Sospese"),
    },
  });
}

// Raggruppa per Project Leader (stessa forma delle generazioni precedenti)
const byPl = new Map();
for (const { pl_name, group } of groups) {
  if (!byPl.has(pl_name)) byPl.set(pl_name, { pl_name, groups: [], notes: [] });
  byPl.get(pl_name).groups.push(group);
}
const report = [...byPl.values()];
for (const pl of report) pl.groups.sort((a, b) => a.name.localeCompare(b.name, "it"));
writeFileSync(join(OUT_DIR, `${dataAsOf}.json`), JSON.stringify(report, null, 1) + "\n", "utf-8");

// Progetti attivi per fase (Recap globale): singoli progetti, non gruppi
const active = projects
  .filter((p) => p.active && !p.is_template && ["Da fare", "In corso"].includes(p.stage_id?.[1]) && !(p.tag_ids || []).includes(NON_AGGIORNARE_TAG_ID))
  .map((p) => ({
    id: p.id,
    pl_name: m2oName(p.partner_project_leader_id) || NO_PL,
    project_name: p.name,
    stage: p.stage_id[1],
    is_assistenza: (p.tag_ids || []).includes(ASSISTENZA_TAG_ID),
  }));
writeFileSync(join(OUT_DIR, `active-projects-by-phase-${dataAsOf}.json`), JSON.stringify(active, null, 2) + "\n", "utf-8");

console.log(`✅ ${groups.length} gruppi, ${report.length} Project Leader → ${join(OUT_DIR, `${dataAsOf}.json`)}`);
console.log(`✅ ${active.length} progetti attivi (${active.filter((p) => p.stage === "Da fare").length} Da fare / ${active.filter((p) => p.stage === "In corso").length} In corso, ${active.filter((p) => p.is_assistenza).length} con etichetta Assistenza)`);
