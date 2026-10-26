#!/usr/bin/env node
// Costruisce i fixture della Pipeline Commerciale (fixtures/<company>/<data>.json)
// a partire dagli scarichi grezzi di Odoo fatti via MCP in una sessione Claude
// (risultati di search_records salvati su disco così come restituiti, mai
// ritrascritti a mano). Regole: skill "pipeline-commerciale-odoo" + schema a
// stati introdotto il 05/10/2026 (Previsione - Probabile/Possibile via
// Fattibilità) + note di credito incluse dal 08/10/2026.
//
// File attesi nella cartella <raw>:
//   inv_oriens.json, inv_digiduu.json  account.move out_invoice+out_refund
//                                       dell'anno, state != cancel, per azienda
//                                       (name, move_type, partner_id,
//                                       commercial_partner_id, invoice_origin,
//                                       invoice_date, state, amount_untaxed_signed)
//   piano.json      x_piano_fatturazione_d, entrambe le aziende, kanban_state
//                   in Proposta/Consuntivi/Target, x_studio_date nell'anno
//   crm.json        crm.lead opportunità in fase "Fare preventivo", entrambe
//   projects.json   project.project non interni/non template (gli archiviati
//                   vengono ignorati), nell'ordinamento predefinito di Odoo
//   partners.json   res.partner di tutti i clienti coinvolti (+ loro
//                   commercial_partner_id), con user_id, digiduu_account_id,
//                   project_leader_id
//   so_tipo.json    (facoltativo, solo Digiduu) sale.order company_id=6 con
//                   tag_ids != false o opportunity_id.tag_ids != false
//                   (name, tag_ids, opportunity_id)
//   lead_tipo.json  (facoltativo, solo Digiduu) crm.lead company_id=6, attive
//                   e archiviate, tag_ids != false (name, tag_ids)
//   crm_tags.json   (facoltativo) crm.tag, tutte (name)
//                   → campo tipi_progetto delle righe (filtro "Tipo progetto")
//
// Uso: node scripts/build-pipeline-fixture.mjs <raw> <data YYYY-MM-DD> "<source_note oriens>" "<source_note digiduu>"
// Il target annuo per cliente (solo Digiduu) non viene da Odoo: è ripreso
// dalla tabellina target_table dell'ultimo fixture Digiduu esistente.

import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const [raw, dataAsOf, noteOriens, noteDigiduu] = process.argv.slice(2);
if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(dataAsOf || "")) {
  console.error("Uso: node scripts/build-pipeline-fixture.mjs <raw> <YYYY-MM-DD> [note oriens] [note digiduu]");
  process.exit(1);
}
const YEAR = Number(dataAsOf.slice(0, 4));
const load = (f) => JSON.parse(readFileSync(join(raw, f), "utf-8")).records;

const MONTHS = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const STATI = [
  ["Bozza - Contrattualizzato", "BDD7EE"],
  ["Confermata - Fatturato", "C6E0B4"],
  ["Previsione - Probabile", "FFC000"],
  ["Previsione - Possibile", "FFF2CC"],
  ["Consuntivi", "FFFF00"],
  ["Target", "CCC0DA"],
];
// Ordine delle righe dello stesso ordine di vendita
const ROW_ORDER = ["Confermata - Fatturato", "Bozza - Contrattualizzato", "Previsione - Probabile", "Previsione - Possibile", "Consuntivi", "Target"];
// x_fattibilita: id 2 = Probabile, id 1 = Possibile
const FATTIBILITA_PROBABILE = 2;

const round2 = (n) => Math.round(n * 100) / 100;

const partners = new Map(load("partners.json").map((p) => [p.id, p]));
const projects = load("projects.json");
const piano = load("piano.json");
const crm = load("crm.json");

// Filtro "Tipo progetto" (solo Digiduu): tutte le etichette CRM
// dell'opportunità collegata all'ordine e dell'ordine stesso, col nome che
// hanno in Odoo. Righe senza etichette = tipi_progetto vuoto, cioè "Senza
// etichetta" nella pagina.
const hasTipo = ["so_tipo.json", "lead_tipo.json", "crm_tags.json"].every((f) => existsSync(join(raw, f)));
const tagNames = new Map(hasTipo ? load("crm_tags.json").map((t) => [t.id, t.name.trim()]) : []);
const toTipi = (ids) => [...new Set(ids)].map((id) => tagNames.get(id) ?? `Etichetta ${id}`).sort((a, b) => a.localeCompare(b, "it"));
const leadTagIds = new Map(hasTipo ? load("lead_tipo.json").map((l) => [l.id, l.tag_ids]) : []);
const orderTipi = new Map(
  hasTipo
    ? load("so_tipo.json").map((o) => [o.name, toTipi([...o.tag_ids, ...(o.opportunity_id ? leadTagIds.get(o.opportunity_id[0]) || [] : [])])])
    : []
);

function commercial(pid) {
  const p = partners.get(pid);
  if (!p) return null;
  return p.commercial_partner_id ? p.commercial_partner_id[0] : p.id;
}
function clientName(pid) {
  const c = partners.get(commercial(pid));
  return c ? c.name.trim() : partners.get(pid)?.name?.trim() ?? "n.d.";
}
// Valore di un campo m2o sul contatto, con priorità al valore del contatto
// figlio e roll-up sull'azienda madre (commercial_partner_id).
function partnerUser(pid, field) {
  const p = partners.get(pid);
  if (p && p[field]) return p[field][1];
  const c = partners.get(commercial(pid));
  if (c && c[field]) return c[field][1];
  return null;
}

// Solo progetti attivi; se più progetti attivi puntano allo stesso ordine vale
// l'ultimo nell'ordinamento predefinito di Odoo (stesso esito delle generazioni
// precedenti).
function projectFallback(companyId, orderName, commercialId) {
  const own = projects.filter((p) => p.company_id?.[0] === companyId && p.active !== false);
  const linked = own.findLast((p) => p.reinvoiced_sale_order_id && p.reinvoiced_sale_order_id[1] === orderName && p.user_id);
  if (linked) return linked.user_id[1];
  // Clienti confrontati per nome: i contatti duplicati (stesso nome, id
  // diversi) contano come lo stesso cliente.
  const counts = {};
  for (const p of own) {
    if (p.user_id && p.partner_id && clientName(p.partner_id[0]) === clientName(commercialId)) {
      counts[p.user_id[1]] = (counts[p.user_id[1]] || 0) + 1;
    }
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

// Digiduu: il nome dell'opportunità perde il prefisso "<cliente> - " (la
// colonna Cliente lo mostra già); Oriens lo tiene. Nome non ripulito dagli
// spazi interni, come nelle generazioni precedenti.
function crmOrigin(name, cliente, isDig) {
  if (!isDig) return name;
  const i = name.indexOf(" - ");
  if (i < 0) return name;
  const head = name.slice(0, i).toLowerCase();
  const c = cliente.toLowerCase();
  return c.startsWith(head) || head.startsWith(c) ? name.slice(i + 3) : name;
}

function build(company) {
  const isDig = company === "digiduu";
  const companyId = isDig ? 6 : 1;
  // key cliente|origine|stato → { partnerId, months[] }
  const cells = new Map();
  const add = (partnerId, origine, stato, monthIdx, amount, isInvoice) => {
    const cliente = clientName(partnerId);
    const key = `${cliente}|${origine}|${stato}`;
    if (!cells.has(key)) cells.set(key, { cliente, origine, stato, partnerId, months: Array(12).fill(0), isInvoice });
    cells.get(key).months[monthIdx] += amount;
  };

  for (const inv of load(isDig ? "inv_digiduu.json" : "inv_oriens.json")) {
    if (!["draft", "posted"].includes(inv.state)) continue;
    const stato = inv.state === "draft" ? "Bozza - Contrattualizzato" : "Confermata - Fatturato";
    const m = Number(inv.invoice_date.slice(5, 7)) - 1;
    const pid = (inv.partner_id || inv.commercial_partner_id)[0];
    add(pid, inv.invoice_origin || "n.d.", stato, m, inv.amount_untaxed_signed, true);
  }
  for (const r of piano) {
    if (r.x_studio_company_id?.[0] !== companyId) continue;
    if (!r.x_studio_date || Number(r.x_studio_date.slice(0, 4)) !== YEAR) continue;
    let stato;
    if (r.x_studio_kanban_state === "Proposta") {
      stato = (r.x_studio_many2many_field_BuQG5 || []).includes(FATTIBILITA_PROBABILE) ? "Previsione - Probabile" : "Previsione - Possibile";
    } else if (r.x_studio_kanban_state === "Consuntivi") stato = "Consuntivi";
    else if (r.x_studio_kanban_state === "Target") stato = "Target";
    else continue;
    const m = Number(r.x_studio_date.slice(5, 7)) - 1;
    add(r.x_studio_cliente[0], r.x_studio_many2one_field_WPfGn ? r.x_studio_many2one_field_WPfGn[1] : "n.d.", stato, m, r.x_studio_value || 0, false);
  }

  const rows = [];
  for (const c of cells.values()) {
    const months = c.months.map((v) => (Math.abs(v) < 0.005 ? null : round2(v)));
    const totale = round2(c.months.reduce((a, b) => a + b, 0));
    if (months.every((v) => v === null)) continue;
    const comm = commercial(c.partnerId);
    const fb = () => (c.origine !== "n.d." ? projectFallback(companyId, c.origine, comm) : projectFallback(companyId, null, comm));
    rows.push({
      account: isDig ? partnerUser(c.partnerId, "digiduu_account_id") ?? "Non assegnato" : null,
      cliente: c.cliente,
      crm_comment: null,
      is_crm: false,
      months,
      nota: null,
      ordinato: c.isInvoice ? totale : 0,
      origine: c.origine,
      project_leader: isDig ? partnerUser(c.partnerId, "project_leader_id") ?? fb() ?? "Non assegnato" : null,
      referente: isDig ? null : partnerUser(c.partnerId, "user_id") ?? fb() ?? "Non assegnato",
      stato: c.stato,
      ...(isDig && hasTipo ? { tipi_progetto: orderTipi.get(c.origine) || [] } : {}),
      totale,
    });
  }

  // Opportunità CRM "Fare preventivo" di clienti non ancora in pipeline
  const present = new Set(rows.map((r) => r.cliente.toLowerCase()));
  const crmAdded = [];
  for (const l of crm) {
    if (l.company_id?.[0] !== companyId || !l.partner_id) continue;
    const cliente = clientName(l.partner_id[0]);
    if (present.has(cliente.toLowerCase())) continue;
    const comm = commercial(l.partner_id[0]);
    const imp = l.expected_revenue
      ? `Importo stimato ${l.expected_revenue.toLocaleString("it-IT")} EUR. ma la riga resta senza valori: è ancora una stima non quotata. non un ordine o un piano di fatturazione.`
      : "Nessun importo/piano di fatturazione ancora associato in Odoo.";
    const fb = () => projectFallback(companyId, null, comm) ?? l.user_id?.[1] ?? null;
    const row = {
      account: isDig ? partnerUser(l.partner_id[0], "digiduu_account_id") ?? "Non assegnato" : null,
      cliente,
      crm_comment: `Opportunità CRM "${l.name.trim()}" - fase "Fare preventivo". ${imp}`,
      is_crm: true,
      months: Array(12).fill(null),
      nota: null,
      ordinato: null,
      origine: `${crmOrigin(l.name, cliente, isDig)} (opp. CRM)`,
      project_leader: isDig ? partnerUser(l.partner_id[0], "project_leader_id") ?? fb() ?? "Non assegnato" : null,
      referente: isDig ? null : partnerUser(l.partner_id[0], "user_id") ?? fb() ?? "Non assegnato",
      stato: "Previsione - Possibile",
      ...(isDig && hasTipo ? { tipi_progetto: toTipi(leadTagIds.get(l.id) || []) } : {}),
      totale: null,
    };
    rows.push(row);
    crmAdded.push(row);
  }

  const coll = (a, b) => (a || "").localeCompare(b || "", "it", { sensitivity: "base" });
  rows.sort((a, b) =>
    (isDig ? 0 : coll(a.referente, b.referente)) ||
    coll(a.cliente, b.cliente) ||
    (a.is_crm === b.is_crm ? 0 : a.is_crm ? 1 : -1) ||
    coll(a.origine === "n.d." ? "￿" : a.origine, b.origine === "n.d." ? "￿" : b.origine) ||
    ROW_ORDER.indexOf(a.stato) - ROW_ORDER.indexOf(b.stato)
  );

  const stato_summary = STATI.map(([stato, color]) => {
    const months = Array(12).fill(0);
    for (const r of rows) if (r.stato === stato && !r.is_crm) r.months.forEach((v, i) => (months[i] += v || 0));
    return { stato, color, months: months.map(round2), totale: round2(months.reduce((a, b) => a + b, 0)) };
  });
  const overallMonths = Array(12).fill(0);
  rows.forEach((r) => r.months.forEach((v, i) => (overallMonths[i] += v || 0)));
  const overall = {
    months: overallMonths.map(round2),
    ordinato: round2(rows.reduce((a, r) => a + (r.ordinato || 0), 0)),
    totale: round2(rows.reduce((a, r) => a + (r.totale || 0), 0)),
  };

  let target_table = [];
  if (isDig) {
    const prevFile = readdirSync(join("fixtures", company)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f < `${dataAsOf}.json`).sort().pop();
    const prev = JSON.parse(readFileSync(join("fixtures", company, prevFile), "utf-8"));
    target_table = prev.target_table.map((t) => {
      const ordinato = t.cliente.startsWith("Altri") && !rows.some((r) => r.cliente === t.cliente)
        ? 0
        : round2(rows.filter((r) => r.cliente === t.cliente).reduce((a, r) => a + (r.ordinato || 0), 0));
      return { cliente: t.cliente, ordinato, target: t.target, differenza: round2(t.target - ordinato) };
    });
    const orphan = target_table.filter((t) => !t.cliente.startsWith("Altri") && !rows.some((r) => r.cliente === t.cliente));
    if (orphan.length) console.warn(`⚠️  ${company}: target senza righe in pipeline: ${orphan.map((t) => t.cliente).join(", ")}`);
  }

  const headers = isDig
    ? ["Account", "Project Leader", "Cliente", "Origine", "Ordinato", ...MONTHS, `TOTALE ${YEAR}`, "Cliente", `Ordinato ${YEAR}`, "Target", "Differenza"]
    : ["Referente", "Cliente", "Origine", "Ordinato", ...MONTHS, `TOTALE ${YEAR}`];

  const out = {
    dual_mode: isDig,
    generated_at: `${dataAsOf}T00:00:00+02:00`,
    headers,
    label: isDig ? "Digiduu" : "Oriens Consulting",
    overall,
    revenue_summary: null,
    rows,
    source_note: (isDig ? noteDigiduu : noteOriens) || `Rigenerazione live del ${dataAsOf} da Odoo via MCP.`,
    stato_summary,
    target_table,
    year: YEAR,
  };
  const file = join("fixtures", company, `${dataAsOf}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2) + "\n", "utf-8");

  console.log(`\n=== ${out.label} → ${file}`);
  console.log(`righe: ${rows.length} (di cui ${crmAdded.length} da opportunità CRM)`);
  console.log(`ordinato: ${overall.ordinato}  totale: ${overall.totale}`);
  for (const s of stato_summary) console.log(`  ${s.stato}: ${s.totale}`);
  for (const k of isDig ? ["account", "project_leader"] : ["referente"]) {
    const na = [...new Set(rows.filter((r) => r[k] === "Non assegnato").map((r) => r.cliente))];
    if (na.length) console.log(`  ${k} "Non assegnato": ${na.join(", ")}`);
  }
  if (isDig && hasTipo) {
    for (const t of [...new Set(rows.flatMap((r) => r.tipi_progetto))].sort()) {
      const o = [...new Set(rows.filter((r) => r.tipi_progetto.includes(t)).map((r) => r.origine))];
      console.log(`  ${t}: ${o.join(", ") || "nessuna riga"}`);
    }
  }
  const neg = rows.filter((r) => (r.totale || 0) < 0);
  if (neg.length) console.log(`  righe con totale negativo: ${neg.map((r) => `${r.cliente} ${r.origine} ${r.totale}`).join("; ")}`);
}

build("oriens");
build("digiduu");
