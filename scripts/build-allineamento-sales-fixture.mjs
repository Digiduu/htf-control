#!/usr/bin/env node
// Costruisce il fixture di Allineamenti Sales (dashboard "Allineamento sales
// Digiduu") a partire dagli scarichi grezzi di Odoo fatti via MCP in una
// sessione Claude (solo letture, salvati su disco così come restituiti, mai
// ritrascritti a mano):
//   fixtures/allineamento-sales/<data>.json
// che poi va caricato con scripts/load-odoo-sync.mjs --allineamento-sales <data>.
// Lo schema è quello del template app/(app)/allineamenti-sales/sales-template.ts
// (segnaposto __DATA__). Azienda Digiduu = company_id 6. I datetime di Odoo
// sono UTC: i limiti "da <giorno>" sono la mezzanotte di Roma espressa in UTC.
//
// File attesi in <raw> (M = mese della data di generazione):
// - stages.json: crm.stage, tutte (id, name, sequence, is_won). Serve solo a
//   verificare gli id per nome: Vinta 35, Chiusa persa 36, Proposta 33,
//   Fare preventivo 32 (lo script si ferma se non tornano).
// - leads_open.json: crm.lead [type=opportunity, company_id=6,
//   stage_id not in [35,36]] (solo attive, filtro predefinito).
// - leads_won.json: crm.lead [type=opportunity, company_id=6, stage_id=35,
//   date_closed >= 1° di M−4 00:00 Roma in UTC] (solo attive).
// - leads_lost.json: crm.lead [type=opportunity, company_id=6,
//   active in [true,false], won_status=lost, date_closed >= 1° di M−2
//   00:00 Roma in UTC]. Le archiviate non perse (won_status pending) restano
//   fuori perché nessuna delle tre query le prende.
//   Campi dei tre file: id, name, partner_id, user_id, stage_id, priority,
//   tag_ids, expected_revenue, date_deadline, create_date,
//   date_last_stage_update, write_date, date_closed, lost_reason_id,
//   won_status, active.
// - tags.json: crm.tag, tutte (id, name).
// - tracking.json: mail.tracking.value [mail_message_id.model=crm.lead,
//   field_id.model=crm.lead, field_id.name in [stage_id, expected_revenue,
//   user_id], create_date >= 1° di M−1 00:00 Roma in UTC] (id, field_id,
//   mail_message_id, old/new_value_char, old/new_value_float,
//   old/new_value_integer, create_date).
// - tracking_messages.json: mail.message [model=crm.lead,
//   tracking_value_ids.field_id.name in [stage_id, expected_revenue, user_id],
//   tracking_value_ids.create_date >= stesso limite] (id, res_id, author_id,
//   date) → res_id = opportunità, author_id = autore.
// - activities.json: mail.activity [res_model=crm.lead] (solo aperte; id,
//   res_id, activity_type_id, summary, date_deadline, user_id).
// - invoices.json: account.move [move_type=out_invoice, company_id=6,
//   state != cancel, invoice_date >= 1° gennaio dell'anno di M] (id, name,
//   invoice_date, state, partner_id, commercial_partner_id, invoice_origin,
//   amount_untaxed).
// - invoices_by_month.json: aggregate_records sullo stesso dominio, groupby
//   [invoice_date:month, state], aggregates [amount_untaxed:sum, __count]
//   → solo verifica dei totali (lo script si ferma se non tornano).
// - piano.json: x_piano_fatturazione_d [x_studio_company_id=6] (solo attive,
//   x_active; id, x_name, x_studio_cliente, x_studio_date, x_studio_value,
//   x_studio_many2one_field_WPfGn = ordine, x_studio_kanban_state,
//   x_studio_many2many_field_BuQG5 = Fattibilità, x_active).
// - fattibilita.json: x_fattibilita, tutte (id, display_name): 1 Possibile,
//   2 Probabile.
// - sale_orders.json: sale.order [company_id=6], tutti (id, name, state,
//   opportunity_id, partner_id).
// - partners.json: res.partner attivi e archiviati con id in tutti i
//   partner_id/commercial_partner_id delle fatture e x_studio_cliente del
//   piano (id, name, is_company, commercial_partner_id, digiduu_account_id).
//   Le aziende madri dei contatti figli sono già nell'elenco (lo script si
//   ferma se ne manca una).
//
// Regole (prompt "Allineamento sales Digiduu"):
// - Lead: status open/won/lost; date in Europe/Rome YYYY-MM-DD; partner =
//   nome visualizzato del partner dell'opportunità ("—" se manca); lostReason
//   "—" se la persa non ha motivo (come nel campione).
// - Tracking: S = fase, R = ricavi previsti (numeri), U = addetto. Solo
//   opportunità presenti in leads (quindi solo Digiduu). Le transizioni verso
//   Vinta/Chiusa persa restano nei dati: è il template a non mostrarle come
//   "cambio fase" nel feed (le mostra nello storico del popup).
// - Attività: solo opportunità presenti in leads.
// - Pipeline: dal mese pipeDetailFrom (= M−2) in dettaglio: fatture posted →
//   Fatturato, draft → Contrattualizzato (una riga per mese/stato/cliente/
//   origine, importi sommati); piano Proposta → Offerta probabile/possibile
//   secondo la Fattibilità (senza Fattibilità = possibile), Consuntivi →
//   Consuntivi, Target → Target; gli altri stati del piano si ignorano. Solo
//   anno di M e successivo. Mesi prima di pipeDetailFrom: solo il totale delle
//   fatture confermate (pipeMonthly).
// - Cliente = azienda (commercial partner). Account = digiduu_account_id del
//   contatto, altrimenti dell'azienda madre, altrimenti "Non assegnato".
// - leadOrders: ordini (anche annullati) delle opportunità aperte in Proposta
//   o Fare preventivo. planCovered: quelle opportunità con almeno un ordine
//   con righe del piano in Proposta. planUnlinked: righe del piano in Proposta
//   su ordini senza opportunità, sommate per ordine.
// - budget: 200.000 €/mese, valore fisso del prompt (non viene da Odoo).
//
// Uso: node scripts/build-allineamento-sales-fixture.mjs <raw> <YYYY-MM-DD>

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [raw, dataAsOf] = process.argv.slice(2);
if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(dataAsOf || "")) {
  console.error("Uso: node scripts/build-allineamento-sales-fixture.mjs <raw> <YYYY-MM-DD>");
  process.exit(1);
}
const OUT_DIR = join("fixtures", "allineamento-sales");
const loadFile = (f) => JSON.parse(readFileSync(join(raw, f), "utf-8"));
const load = (f) => loadFile(f).records;
const fail = (msg) => {
  console.error("ERRORE: " + msg);
  process.exit(1);
};

const BUDGET = 200000;
const COMPANY = "Digiduu S.r.l.";
const ODOO_URL = "https://oriens-consulting.odoo.com/odoo/crm/";
const STAGE = { Vinta: 35, "Chiusa persa": 36, Proposta: 33, "Fare preventivo": 32 };
const STAGES_CLOSE = ["Proposta", "Fare preventivo"];
const SO_STATE = { draft: "bozza", sent: "inviato", sale: "confermato", cancel: "annullato" };
const TRACK_KIND = { "Fase (Lead)": "S", "Ricavi previsti (Lead)": "R", "Addetto vendite (Lead)": "U" };

const round2 = (n) => Math.round(n * 100) / 100;
const romeFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });
// "2026-10-01 14:19:41" (UTC) → "2026-10-01" a Roma
const romeDate = (s) => (s ? romeFmt.format(new Date(`${s.replace(" ", "T")}Z`)) : null);
const m2oName = (v, dflt = "—") => (v ? String(v[1]).trim() : dflt);

const [Y, Mo] = dataAsOf.split("-").map(Number);
const monthKey = (y, m) => {
  const d = new Date(Date.UTC(y, m - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const PIPE_DETAIL_FROM = monthKey(Y, Mo - 2);
const PIPE_FIRST = `${Y}-01`;
const PIPE_LAST = `${Y + 1}-12`;

// --- Verifiche sugli id delle fasi ------------------------------------------
const stageById = new Map(load("stages.json").map((s) => [s.id, s.name]));
for (const [name, id] of Object.entries(STAGE)) {
  if (stageById.get(id) !== name) fail(`la fase ${id} non è "${name}" ma "${stageById.get(id)}"`);
}

// --- Opportunità -------------------------------------------------------------
const tagName = new Map(load("tags.json").map((t) => [t.id, t.name.trim()]));
const base = (l) => ({
  id: l.id,
  name: l.name.trim(),
  partner: m2oName(l.partner_id),
  user: m2oName(l.user_id),
  stage: m2oName(l.stage_id),
  prio: Number(l.priority || 0),
  tags: (l.tag_ids || []).map((t) => tagName.get(t) ?? String(t)),
  rev: l.expected_revenue || 0,
});
const openRaw = load("leads_open.json");
const wonRaw = load("leads_won.json");
const lostRaw = load("leads_lost.json");
const byIdAsc = (a, b) => a.id - b.id;
const leads = [
  ...[...openRaw].sort(byIdAsc).map((l) => ({
    ...base(l),
    created: romeDate(l.create_date),
    stageUpd: romeDate(l.date_last_stage_update),
    updated: romeDate(l.write_date),
    deadline: l.date_deadline || null,
    status: "open",
  })),
  ...[...wonRaw].sort(byIdAsc).map((l) => ({ ...base(l), closed: romeDate(l.date_closed), deadline: l.date_deadline || null, status: "won" })),
  ...[...lostRaw].sort(byIdAsc).map((l) => ({
    ...base(l),
    closed: romeDate(l.date_closed),
    lostReason: m2oName(l.lost_reason_id),
    deadline: l.date_deadline || null,
    status: "lost",
  })),
];
const leadIds = new Set(leads.map((l) => l.id));
if (leadIds.size !== leads.length) fail("opportunità duplicate tra aperte/vinte/perse");
const leadById = new Map(leads.map((l) => [l.id, l]));

// --- Storico modifiche -------------------------------------------------------
const msgById = new Map(load("tracking_messages.json").map((m) => [m.id, m]));
const tracking = [];
let trackSkipped = 0;
for (const t of load("tracking.json")) {
  const msg = msgById.get(t.mail_message_id[0]);
  if (!msg) fail(`messaggio ${t.mail_message_id[0]} del tracking ${t.id} mancante in tracking_messages.json`);
  if (!leadIds.has(msg.res_id)) {
    trackSkipped++;
    continue;
  }
  const kind = TRACK_KIND[t.field_id[1]];
  if (!kind) fail(`campo tracking inatteso: ${t.field_id[1]}`);
  const isR = kind === "R";
  tracking.push({
    _id: t.id,
    lead: msg.res_id,
    date: romeDate(msg.date),
    kind,
    old: isR ? t.old_value_float || 0 : t.old_value_char || "—",
    new: isR ? t.new_value_float || 0 : t.new_value_char || "—",
    author: m2oName(msg.author_id),
  });
}
// più recenti prima, come nel campione
tracking.sort((a, b) => b.date.localeCompare(a.date) || b._id - a._id);
tracking.forEach((t) => delete t._id);

// --- Attività aperte ---------------------------------------------------------
const activities = load("activities.json")
  .filter((a) => leadIds.has(a.res_id))
  .sort((a, b) => a.res_id - b.res_id || a.id - b.id)
  .map((a) => ({
    lead: a.res_id,
    type: m2oName(a.activity_type_id),
    summary: a.summary ? a.summary.trim() : "",
    date: a.date_deadline,
    user: m2oName(a.user_id),
  }));

// --- Clienti e account -------------------------------------------------------
const partners = new Map(load("partners.json").map((p) => [p.id, p]));
const commercialOf = (pid) => {
  const p = partners.get(pid);
  if (!p) fail(`partner ${pid} mancante in partners.json`);
  const cid = p.commercial_partner_id ? p.commercial_partner_id[0] : p.id;
  if (!partners.has(cid)) fail(`azienda madre ${cid} del partner ${pid} mancante in partners.json`);
  return partners.get(cid);
};
const clientName = (pid) => commercialOf(pid).name.trim();
const accountOf = (pid) => {
  const p = partners.get(pid);
  if (p.digiduu_account_id) return p.digiduu_account_id[1];
  const c = commercialOf(pid);
  return c.digiduu_account_id ? c.digiduu_account_id[1] : "Non assegnato";
};

// --- Pipeline commerciale ----------------------------------------------------
const invoices = load("invoices.json");
// verifica totali contro il read_group di Odoo
{
  const agg = {};
  for (const i of invoices) {
    const k = `${i.invoice_date.slice(0, 7)}|${i.state}`;
    agg[k] = (agg[k] || 0) + i.amount_untaxed;
  }
  for (const g of loadFile("invoices_by_month.json").groups) {
    const k = `${g["invoice_date:month"][0].slice(0, 7)}|${g.state}`;
    if (Math.abs((agg[k] || 0) - g["amount_untaxed:sum"]) > 0.01) fail(`totale fatture ${k}: ${agg[k]} ≠ ${g["amount_untaxed:sum"]}`);
    delete agg[k];
  }
  if (Object.keys(agg).length) fail(`gruppi fatture non presenti nel read_group: ${Object.keys(agg).join(", ")}`);
}

const pipeMonthly = {};
const invCells = new Map();
for (const i of invoices) {
  if (!["posted", "draft"].includes(i.state)) continue;
  const month = i.invoice_date.slice(0, 7);
  if (month < PIPE_FIRST || month > PIPE_LAST) continue;
  if (month < PIPE_DETAIL_FROM) {
    if (i.state === "posted") pipeMonthly[month] = (pipeMonthly[month] || 0) + i.amount_untaxed;
    continue;
  }
  const pid = (i.partner_id || i.commercial_partner_id)[0];
  const state = i.state === "posted" ? "Fatturato" : "Contrattualizzato";
  const order = (i.invoice_origin || i.name || "").trim();
  const partner = clientName(pid);
  const key = [month, state, partner, order].join("|");
  if (!invCells.has(key)) {
    invCells.set(key, { month, state, partner, order, desc: i.state === "posted" ? "Fattura confermata" : "Fattura in bozza", value: 0, account: accountOf(pid) });
  }
  invCells.get(key).value += i.amount_untaxed;
}
for (const k of Object.keys(pipeMonthly)) pipeMonthly[k] = round2(pipeMonthly[k]);

const fattName = new Map(load("fattibilita.json").map((f) => [f.id, f.display_name]));
const PROBABILE = [...fattName].find(([, n]) => n === "Probabile")?.[0];
const POSSIBILE = [...fattName].find(([, n]) => n === "Possibile")?.[0];
if (PROBABILE == null || POSSIBILE == null) fail("Fattibilità Probabile/Possibile non trovate in fattibilita.json");
const fattOf = (ids) => (ids.includes(PROBABILE) ? "Probabile" : ids.includes(POSSIBILE) ? "Possibile" : "");

const piano = load("piano.json").filter((r) => r.x_active !== false);
const planRows = [];
for (const r of piano) {
  const ks = r.x_studio_kanban_state;
  if (!["Proposta", "Consuntivi", "Target"].includes(ks) || !r.x_studio_date) continue;
  const month = r.x_studio_date.slice(0, 7);
  if (month < PIPE_DETAIL_FROM || month > PIPE_LAST) continue;
  const fatt = fattOf(r.x_studio_many2many_field_BuQG5 || []);
  const state = ks === "Proposta" ? (fatt === "Probabile" ? "Offerta probabile" : "Offerta possibile") : ks;
  const pid = r.x_studio_cliente[0];
  planRows.push({
    month,
    state,
    partner: clientName(pid),
    order: m2oName(r.x_studio_many2one_field_WPfGn, "n.d."),
    desc: (r.x_name || "").trim(),
    value: round2(r.x_studio_value || 0),
    account: accountOf(pid),
    fatt,
  });
}
const GROUP = { Fatturato: 0, Contrattualizzato: 1, Consuntivi: 2, "Offerta probabile": 3, "Offerta possibile": 3, Target: 4 };
const pipeline = [...[...invCells.values()].map((c) => ({ ...c, value: round2(c.value) })), ...planRows].sort(
  (a, b) => a.month.localeCompare(b.month) || GROUP[a.state] - GROUP[b.state] || a.partner.localeCompare(b.partner) || a.order.localeCompare(b.order)
);

// --- Opportunità ↔ preventivi ↔ piano ---------------------------------------
const orders = load("sale_orders.json");
const closeLeads = new Set(leads.filter((l) => l.status === "open" && STAGES_CLOSE.includes(l.stage)).map((l) => l.id));
const leadOrders = {};
for (const o of [...orders].sort((a, b) => a.id - b.id)) {
  if (!o.opportunity_id || !closeLeads.has(o.opportunity_id[0])) continue;
  (leadOrders[o.opportunity_id[0]] ||= []).push([o.name, SO_STATE[o.state] ?? o.state]);
}
const orderById = new Map(orders.map((o) => [o.id, o]));
const propostaRows = piano.filter((r) => r.x_studio_kanban_state === "Proposta" && r.x_studio_many2one_field_WPfGn);
const planCovered = {};
const unlinked = new Map();
for (const r of propostaRows) {
  const o = orderById.get(r.x_studio_many2one_field_WPfGn[0]);
  if (!o) fail(`ordine ${r.x_studio_many2one_field_WPfGn[0]} del piano ${r.id} non è un ordine Digiduu`);
  if (o.opportunity_id) {
    const lid = o.opportunity_id[0];
    if (!closeLeads.has(lid)) continue;
    const list = (planCovered[lid] ||= []);
    if (!list.includes(o.name)) list.push(o.name);
  } else {
    const u = unlinked.get(o.name) || { order: o.name, partner: clientName(r.x_studio_cliente[0]), value: 0 };
    u.value += r.x_studio_value || 0;
    unlinked.set(o.name, u);
  }
}
const sortKeys = (obj) => Object.fromEntries(Object.keys(obj).sort((a, b) => Number(a) - Number(b)).map((k) => [k, obj[k]]));
const planUnlinked = [...unlinked.values()].map((u) => ({ ...u, value: round2(u.value) })).sort((a, b) => a.order.localeCompare(b.order));

// --- Documento ---------------------------------------------------------------
const doc = {
  extracted: dataAsOf,
  company: COMPANY,
  budget: BUDGET,
  odooUrl: ODOO_URL,
  leads,
  tracking,
  activities,
  pipeline,
  pipeMonthly,
  pipeDetailFrom: PIPE_DETAIL_FROM,
  leadOrders: sortKeys(leadOrders),
  planCovered: sortKeys(planCovered),
  planUnlinked,
};

mkdirSync(OUT_DIR, { recursive: true });
const file = join(OUT_DIR, `${dataAsOf}.json`);
writeFileSync(file, JSON.stringify(doc, null, 2) + "\n");

// --- Riepilogo e segnalazioni ------------------------------------------------
const count = (a, f) => a.reduce((n, x) => ((n[f(x)] = (n[f(x)] || 0) + 1), n), {});
console.log(`Scritto ${file}`);
console.log("leads:", count(leads, (l) => l.status));
console.log("aperte per fase:", count(leads.filter((l) => l.status === "open"), (l) => l.stage));
console.log(`tracking: ${tracking.length} (scartati ${trackSkipped} di opportunità non in leads)`, count(tracking, (t) => t.kind));
console.log(`activities: ${activities.length}`);
console.log(`pipeline: ${pipeline.length} righe, pipeDetailFrom ${PIPE_DETAIL_FROM}`, count(pipeline, (p) => p.state));
console.log("pipeMonthly:", pipeMonthly);
console.log(`leadOrders: ${Object.keys(leadOrders).length}, planCovered: ${Object.keys(planCovered).length}, planUnlinked: ${planUnlinked.length}`);
const noAccount = [...new Set(pipeline.filter((p) => p.account === "Non assegnato").map((p) => p.partner))].sort();
console.log("Clienti senza Account:", noAccount.join(", ") || "nessuno");
console.log("Perse senza motivo:", leads.filter((l) => l.status === "lost" && l.lostReason === "—").map((l) => `${l.id} ${l.name}`).join("; ") || "nessuna");
console.log("Piano in Proposta su ordini senza opportunità:", planUnlinked.map((u) => `${u.order} ${u.partner} ${u.value}`).join("; ") || "nessuno");
const draftKeys = new Set(pipeline.filter((p) => p.state === "Contrattualizzato").map((p) => `${p.month}|${p.order}`));
const dup = pipeline.filter((p) => p.state.startsWith("Offerta") && draftKeys.has(`${p.month}|${p.order}`));
console.log("Possibili doppi conteggi (bozza + Proposta stesso ordine e mese):", dup.map((p) => `${p.month} ${p.order} ${p.partner} ${p.value}`).join("; ") || "nessuno");
