#!/usr/bin/env node
// Ricostruisce il Report Progetti Oriens (fixtures/report-progetti-oriens/<data>.json)
// dagli scarichi grezzi di Odoo fatti via MCP in una sessione Claude (solo
// letture, salvati su disco così come restituiti), invece della trascrizione
// manuale della prima generazione (25/09/2026).
//
// File attesi in <raw>:
// - projects.json      project.project company_id=1, attivi e archiviati
//                      (stage_id, partner_id, user_id, strategist_id,
//                      sale_order_id, reinvoiced_sale_order_id, account_id,
//                      date, is_internal_project, is_template, pf_*)
// - so_lines.json      sale.order.line (display_type=false) degli ordini dei
//                      progetti nel perimetro
// - inv_lines.json     account.move.line out_invoice/out_refund (draft+posted,
//                      display_type=product) con sale_line_ids su quegli ordini
// - inv_lines_analytic.json  stesse righe, ma filtrate per analytic_distribution
//                      sui conti analitici dei progetti nel perimetro (molte
//                      fatture non sono collegate alle righe d'ordine)
// - vendor_lines.json  account.move.line in_invoice/in_refund (draft+posted,
//                      display_type=product) con analytic_distribution sui
//                      conti analitici dei progetti nel perimetro
// - timesheet.json     aggregate account.analytic.line project_id.company_id=1
//                      groupby [project_id, employee_id], unit_amount:sum (ore),
//                      amount:sum (costo standard, negativo)
// - planning.json      aggregate planning.slot sui progetti Oriens da oggi in
//                      avanti groupby [project_id, resource_id] (allocated_hours)
//
// Regole (stessa metodologia della generazione del 25/09: i campi pf_* di
// project.project NON si usano, perché inaffidabili sui progetti padre con più
// conti analitici):
// - Perimetro: progetti attivi in fase "In corso"/"Da fare", non interni, non
//   modelli, con cliente.
// - Baseline: ordine di vendita del progetto. Ricavi = somma imponibile righe;
//   giornate = righe consulente (prodotti "CONSULENZA…", "ASSISTENZA…",
//   "COACHING…", "ASSESSMENT…") in Giorni (Ore ÷ 8); costo = Σ qtà × costo
//   (purchase_price) di tutte le righe.
// - Actual: ricavi = righe di fatture cliente confermate imputate al conto
//   analitico del progetto (in proporzione alla distribuzione analitica),
//   più quelle senza distribuzione collegate alle righe del suo ordine (note
//   di credito sottratte);
//   giornate = foglio ore ÷ 8; costo = costo standard foglio ore dei dipendenti
//   + fatture fornitore confermate imputate al conto analitico del progetto.
// - Bozza: fatture cliente in bozza / fatture fornitore in bozza.
// - Forecast: Actual + Bozza; giornate = registrate + pianificate (Planning).
// - Per consulente: chiave "INIZIALE.COGNOME" ricavata dal nome prodotto
//   ("CONSULENZA A PROGETTO M.PERILLO") o dal nome della persona; esterno se ha
//   fatture fornitore sul progetto, altrimenti interno. Ricavo pro-quota =
//   ricavi actual × quota delle giornate lavorate (max tra registrate e
//   fatturate) sul totale del progetto.
// - Anomalie: solo regole automatiche (elenco in anomaliesFor). Le note scritte
//   a mano nella generazione precedente restano allegate al progetto come
//   "note storiche", per codice progetto.
//
// Uso: node scripts/build-oriens-report-fixture.mjs <raw> <YYYY-MM-DD>

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const [raw, dataAsOf] = process.argv.slice(2);
if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(dataAsOf || "")) {
  console.error("Uso: node scripts/build-oriens-report-fixture.mjs <raw> <YYYY-MM-DD>");
  process.exit(1);
}
const OUT_DIR = join("fixtures", "report-progetti-oriens");
const load = (f) => JSON.parse(readFileSync(join(raw, f), "utf-8"));
const [Y, M, D] = dataAsOf.split("-");
const asOfIt = `${D}/${M}/${Y}`;

// --- Formattazione italiana -------------------------------------------------
// Separatore delle migliaia anche sotto le 10.000 (toLocaleString "it-IT" lo
// omette per i numeri di 4 cifre), come nel report di riferimento.
const nf = (n, d) => {
  const [int, dec] = Math.abs(n).toFixed(d).split(".");
  return `${n < 0 && Number(Math.abs(n).toFixed(d)) !== 0 ? "-" : ""}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${dec ? `,${dec}` : ""}`;
};
const eur = (n) => `${nf(Math.round(n), 0)} €`;
const eur2 = (n) => `${nf(n, 2)} €`;
const days = (n) => (Math.abs(n) < 0.005 ? "0" : nf(Math.round(n * 100) / 100, Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2));
const pct = (num, den) => (den ? `${nf((num / den) * 100, 1)}%` : "—");
const marg = (rev, cost) => `${eur2(rev - cost)}${rev ? ` (${pct(rev - cost, rev)})` : ""}`;
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const sum = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);

// --- Chiavi consulente ------------------------------------------------------
const cleanPerson = (s) => (s || "").replace(/\s+(Oriens|Digiduu|WSO|CANCELLARE)$/i, "").trim();
// Chiavi candidate "G.DEBEI", "G.LAROSA"…: iniziale del nome + cognome senza
// spazi, provando sia il cognome lungo sia le sole ultime parole (nomi doppi
// come "Gian Luca La Rosa").
const personKeys = (name) => {
  const parts = cleanPerson(name).split(/\s+/);
  if (parts.length < 2) return [];
  const out = [];
  for (let k = 1; k < parts.length; k++) out.push(`${parts[0][0]}.${parts.slice(k).join("")}`.toUpperCase());
  return out;
};
const personKey = (name) => personKeys(name)[0] || null;
// Alias osservati in Odoo: "AA.BERTOLDI" è Nicolas Bertoldi
const KEY_ALIAS = { "AA.BERTOLDI": "N.BERTOLDI" };
const CONSULTING = /^(CONSULENZA|ASSISTENZA|COACHING|ASSESSMENT)/i;
function productKey(prodName) {
  if (!prodName) return null;
  const paren = prodName.match(/\(([^)]+)\)\s*$/);
  if (paren) return personKey(paren[1]);
  const tok = prodName.trim().split(/\s+/).pop();
  if (/^[A-Z]{1,2}\.[A-Z'À-Ü]+$/.test(tok)) return KEY_ALIAS[tok] || tok;
  return null;
}
// "D.FAVARETTO" -> "D. Favaretto" quando la persona non compare per esteso
const prettyKey = (k) => k.replace(/^([A-Z]{1,2})\.(.+)$/, (_, i, s) => `${i}. ${s.charAt(0)}${s.slice(1).toLowerCase()}`);
const toDays = (qty, uom) => (/ore/i.test(uom || "") ? qty / 8 : qty);

// --- Dati -------------------------------------------------------------------
const projects = load("projects.json").records;
const soLines = load("so_lines.json").records;
const invLines = [...new Map([...load("inv_lines.json").records, ...load("inv_lines_analytic.json").records].map((l) => [l.id, l])).values()];
const vendorLines = load("vendor_lines.json").records;
const timesheet = load("timesheet.json").groups;
const planning = load("planning.json").groups || [];

// Nome completo per chiave, da tutti i fogli ore e i fornitori persona fisica
// (così una riga d'ordine "G.PIAZZA" senza ore mostra comunque "Giuseppe Piazza").
const fullNameByKey = new Map();
for (const n of [...timesheet.map((g) => g.employee_id?.[1]), ...vendorLines.map((l) => l.partner_id?.[1])]) {
  if (!n) continue;
  for (const k of personKeys(n)) if (!fullNameByKey.has(k)) fullNameByKey.set(k, cleanPerson(n));
}

const inScope = (p) => p.active && !p.is_template && !p.is_internal_project && ["In corso", "Da fare"].includes(p.stage_id?.[1]) && p.partner_id;
const perimeter = projects.filter(inScope);
const perimeterAccounts = new Set(perimeter.map((p) => p.account_id && String(p.account_id[0])).filter(Boolean));
const planningInUse = planning.some((g) => perimeter.some((p) => p.id === g.project_id?.[0]));

// Generazione precedente: note storiche e report dedicati per codice
const prevFile = readdirSync(OUT_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f < `${dataAsOf}.json`).sort().pop();
const prevByCode = new Map();
let prevDate = null;
if (prevFile) {
  prevDate = prevFile.slice(0, 10).split("-").reverse().join("/");
  const prev = JSON.parse(readFileSync(join(OUT_DIR, prevFile), "utf-8"));
  for (const s of prev.strategists) for (const pm of s.pmGroups) for (const p of pm.progetti) prevByCode.set(p.codice, p);
}

const codeOf = (name) => name.split(/\s+-\s+|\s+/)[0];
const titleOf = (name) => {
  const parts = name.split(" - ").map((s) => s.trim());
  return parts.length > 1 ? parts.slice(1).join(" — ") : name;
};

function anomaliesFor(x) {
  const a = [];
  if (!x.soId) a.push("Nessun ordine di vendita collegato al progetto: baseline non disponibile.");
  else if (x.base.rev === 0) a.push("Ordine di vendita senza importi: baseline ricavi a zero.");
  if (x.base.days > 0 && x.act.days > x.base.days * 1.1)
    a.push(`Giornate registrate (${days(x.act.days)}) oltre le giornate ordinate (${days(x.base.days)}): +${days(x.act.days - x.base.days)} gg.`);
  // Ordine non ancora tutto fatturato: è un'anomalia solo a progetto scaduto
  // (prima è il normale avanzamento delle tranche).
  if (x.base.rev > 0 && x.fc.rev < x.base.rev - 1 && x.date && x.date < dataAsOf)
    a.push(`Progetto scaduto con ${eur(x.base.rev - x.fc.rev)} dell'ordine non ancora fatturati né in bozza (forecast ${eur(x.fc.rev)} su baseline ${eur(x.base.rev)}).`);
  if (x.base.rev > 0 && x.fc.rev > x.base.rev + 1) a.push(`Ricavi forecast ${eur(x.fc.rev)} superiori alla baseline ${eur(x.base.rev)} (+${eur(x.fc.rev - x.base.rev)}).`);
  if (x.fc.rev > 0 && x.fc.rev - x.fc.cost < 0) a.push(`Margine forecast negativo: ${eur2(x.fc.rev - x.fc.cost)}.`);
  else if (x.base.rev > 0 && x.fc.rev > 0) {
    const mb = (x.base.rev - x.base.cost) / x.base.rev;
    const mf = (x.fc.rev - x.fc.cost) / x.fc.rev;
    if (mb - mf > 0.1) a.push(`Margine forecast ${pct(x.fc.rev - x.fc.cost, x.fc.rev)} sotto il margine di baseline ${pct(x.base.rev - x.base.cost, x.base.rev)} di oltre 10 punti.`);
  }
  if (x.draft.cost > 0) a.push(`Costi fornitore in bozza per ${eur2(x.draft.cost)} (fatture da ricevere/confermare).`);
  for (const c of x.consulenti) {
    // Solo per chi usa il foglio ore: molti esterni lavorano solo a fattura.
    if (c.esterno && c.regGg > 0 && Math.abs(c.regGg - (c.fattGg + c.fattDraftGg)) > 0.5)
      a.push(`${c.nome}: registrate a foglio ore ${days(c.regGg)} gg, fatturate dal fornitore ${days(c.fattGg + c.fattDraftGg)} gg.`);
    if (c.ordGg > 0 && c.regGg > c.ordGg * 1.1 && !c.esterno) a.push(`${c.nome}: registrate ${days(c.regGg)} gg su ${days(c.ordGg)} ordinate.`);
    if (!c.esterno && c.regGg >= 1 && c.tsCost === 0)
      a.push(`${c.nome}: ${days(c.regGg)} gg registrate senza costo (né costo standard a foglio ore né fatture fornitore imputate al progetto): margine sovrastimato.`);
  }
  // Giornate ordinate residue senza Planning: segnalata solo se il Planning è
  // in uso su almeno un progetto (oggi Oriens non lo usa: lo dice il footer).
  const residuo = x.base.days - x.act.days;
  if (planningInUse && x.stage === "In corso" && residuo >= 1 && x.planned === 0)
    a.push(`Nessuna giornata pianificata nel Planning Odoo a fronte di ${days(residuo)} giornate ordinate ancora da svolgere.`);
  if (!x.strategist) a.push("Strategist non assegnato in Odoo.");
  if (!x.pm) a.push("Responsabile progetto (PM) non assegnato in Odoo.");
  if (x.date && x.date < dataAsOf && x.stage === "In corso") a.push(`Data di fine progetto (${x.date.split("-").reverse().join("/")}) già passata con il progetto ancora "In corso".`);
  if (x.stage === "Da fare" && (x.act.rev > 0 || x.act.days > 0)) a.push(`Progetto ancora "Da fare" ma con ${x.act.rev > 0 ? "fatture" : "ore registrate"}.`);
  return a;
}

// --- Calcolo per progetto ---------------------------------------------------
const built = perimeter.map((p) => {
  const so = p.sale_order_id || p.reinvoiced_sale_order_id;
  const soId = so ? so[0] : null;
  const lines = soLines.filter((l) => soId && l.order_id?.[0] === soId);
  const lineIds = new Set(lines.map((l) => l.id));
  const accId = p.account_id ? String(p.account_id[0]) : null;
  const inv = invLines
    .map((l) => {
      const dist = l.analytic_distribution || {};
      if (accId && dist[accId]) return { ...l, share: dist[accId] / 100 };
      // Collegata all'ordine ma imputata a un conto fuori perimetro (o a
      // nessuno): conta qui, senza rischio di doppio conteggio su un altro
      // progetto del report.
      const elsewhere = Object.keys(dist).some((k) => perimeterAccounts.has(k));
      return !elsewhere && (l.sale_line_ids || []).some((id) => lineIds.has(id)) ? { ...l, share: 1 } : null;
    })
    .filter(Boolean);
  const sign = (l) => (l.move_type === "out_refund" ? -1 : 1) * l.share;
  const vend = vendorLines
    .filter((l) => accId && l.analytic_distribution && l.analytic_distribution[accId])
    .map((l) => ({ ...l, share: l.analytic_distribution[accId] / 100 }));
  const ts = timesheet.filter((g) => g.project_id?.[0] === p.id && g.employee_id);
  const planned = sum(planning.filter((g) => g.project_id?.[0] === p.id), (g) => g["allocated_hours:sum"]) / 8;

  // Consulenti
  const cons = new Map();
  // Una persona del foglio ore/fornitore si aggancia alla chiave già creata
  // dalle righe d'ordine se una delle sue chiavi candidate coincide.
  const keyFor = (name) => personKeys(name).find((k) => cons.has(k)) || personKey(name) || cleanPerson(name).toUpperCase();
  const get = (key, nome) => {
    if (!cons.has(key)) cons.set(key, { key, nome: nome || fullNameByKey.get(key) || prettyKey(key), ordGg: 0, regGg: 0, tsCost: 0, fattGg: 0, fattDraftGg: 0, fattCost: 0, fattDraftCost: 0, esterno: false });
    const c = cons.get(key);
    if (nome && c.nome === key) c.nome = nome;
    return c;
  };
  for (const l of lines) {
    const prod = l.product_id?.[1];
    if (!prod || !CONSULTING.test(prod)) continue;
    const k = productKey(prod);
    if (!k) continue;
    get(k).ordGg += toDays(l.product_uom_qty || 0, l.product_uom_id?.[1]);
  }
  for (const g of ts) {
    const nome = cleanPerson(g.employee_id[1]);
    const c = get(keyFor(nome), nome);
    c.regGg += g["unit_amount:sum"] / 8;
    c.tsCost += -g["amount:sum"];
  }
  const otherCosts = new Map();
  for (const l of vend) {
    const prod = l.product_id?.[1] || l.name || "";
    const amount = (l.balance || 0) * l.share;
    const isDraft = l.parent_state === "draft";
    const k = CONSULTING.test(prod) ? productKey(prod) || keyFor(l.partner_id?.[1]) : null;
    if (k) {
      const isPerson = personKeys(l.partner_id?.[1]).includes(k);
      const c = get(k, isPerson ? cleanPerson(l.partner_id[1]) : undefined);
      c.esterno = true;
      const gg = toDays((l.quantity || 0) * l.share, l.product_uom_id?.[1]);
      if (isDraft) {
        c.fattDraftGg += gg;
        c.fattDraftCost += amount;
      } else {
        c.fattGg += gg;
        c.fattCost += amount;
      }
    } else {
      const label = `${l.partner_id?.[1] || "n.d."} — ${prod.split("\n")[0]}`;
      const o = otherCosts.get(label) || { posted: 0, draft: 0 };
      if (isDraft) o.draft += amount;
      else o.posted += amount;
      otherCosts.set(label, o);
    }
  }

  const base = {
    rev: sum(lines, (l) => l.price_subtotal),
    days: sum(lines.filter((l) => CONSULTING.test(l.product_id?.[1] || "")), (l) => toDays(l.product_uom_qty || 0, l.product_uom_id?.[1])),
    cost: sum(lines, (l) => (l.product_uom_qty || 0) * (l.purchase_price || 0)),
  };
  const consList = [...cons.values()];
  const internalCost = sum(consList.filter((c) => !c.esterno), (c) => c.tsCost);
  const act = {
    rev: sum(inv.filter((l) => l.parent_state === "posted"), (l) => sign(l) * l.price_subtotal),
    days: sum(ts, (g) => g["unit_amount:sum"]) / 8,
    cost: internalCost + sum(vend.filter((l) => l.parent_state === "posted"), (l) => l.balance * l.share),
  };
  const draft = {
    rev: sum(inv.filter((l) => l.parent_state === "draft"), (l) => sign(l) * l.price_subtotal),
    cost: sum(vend.filter((l) => l.parent_state === "draft"), (l) => l.balance * l.share),
  };
  const fc = { rev: act.rev + draft.rev, days: act.days + planned, cost: act.cost + draft.cost };

  // Ricavo pro-quota per consulente
  const worked = (c) => Math.max(c.regGg, c.fattGg);
  const totWorked = sum(consList, worked);
  for (const c of consList) c.ricavo = totWorked ? (act.rev * worked(c)) / totWorked : 0;

  const x = {
    p,
    codice: codeOf(p.name),
    soId,
    stage: p.stage_id[1],
    strategist: p.strategist_id ? p.strategist_id[1] : null,
    pm: p.user_id ? p.user_id[1] : null,
    date: p.date || null,
    base,
    act,
    draft,
    fc,
    planned,
    consulenti: consList.sort((a, b) => worked(b) + b.ordGg - (worked(a) + a.ordGg)),
    otherCosts,
  };
  x.anomalie = anomaliesFor(x);
  return x;
});

// --- Documento --------------------------------------------------------------
function progettoDoc(x) {
  const prev = prevByCode.get(x.codice);
  const bafo = [
    x.base.rev || x.base.days
      ? { riga: "Baseline", ricavi: eur2(x.base.rev), giornate: days(x.base.days), ricavoMedio: x.base.days ? eur2(x.base.rev / x.base.days) : "—", costo: eur2(x.base.cost), margine: marg(x.base.rev, x.base.cost) }
      : { riga: "Baseline", nd: "n/d — nessun ordine di vendita con importi collegato al progetto" },
    { riga: "Actual", ricavi: eur2(x.act.rev), giornate: days(x.act.days), ricavoMedio: x.act.days ? eur2(x.act.rev / x.act.days) : "—", costo: eur2(x.act.cost), margine: marg(x.act.rev, x.act.cost) },
    { riga: "Bozza", ricavi: eur2(x.draft.rev), giornate: "—", ricavoMedio: "—", costo: eur2(x.draft.cost), margine: eur2(x.draft.rev - x.draft.cost) },
    {
      riga: "Forecast",
      ricavi: eur2(x.fc.rev),
      giornate: x.planned ? `${days(x.fc.days)} (di cui ${days(x.planned)} pianificate)` : days(x.fc.days),
      ricavoMedio: x.fc.days ? eur2(x.fc.rev / x.fc.days) : "—",
      costo: eur2(x.fc.cost),
      margine: marg(x.fc.rev, x.fc.cost),
    },
  ];
  const consulenti = x.consulenti.map((c) => {
    const costAct = c.esterno ? c.fattCost : c.tsCost;
    const row = {
      consulente: `${c.nome} (${c.esterno ? "esterno" : "interno"})`,
      ordinate: c.ordGg ? days(c.ordGg) : "—",
      registrate: c.regGg ? days(c.regGg) : "—",
      fatturate: c.esterno ? `${days(c.fattGg)} confermate${c.fattDraftGg ? ` / ${days(c.fattDraftGg)} bozza (${eur(c.fattDraftCost)})` : ""}` : "—",
      costo: c.esterno ? `${eur2(c.fattCost)}${c.fattDraftCost ? ` actual · ${eur2(c.fattDraftCost)} bozza` : ""}` : `${eur2(c.tsCost)} (interno)`,
      ricavoProQuota: eur2(c.ricavo),
      margine: eur2(c.ricavo - costAct),
    };
    if (c.esterno && c.regGg > 0) row.fatturateDq = Math.abs(c.regGg - (c.fattGg + c.fattDraftGg)) <= 0.5 ? "ok" : "warn";
    return row;
  });
  const altriCosti = [...x.otherCosts.entries()].map(
    ([label, o]) => `${label}: ${eur2(o.posted)} confermati${o.draft ? ` · ${eur2(o.draft)} in bozza` : ""}`
  );
  const noteStoriche = prev ? [...(prev.anomalie || []), ...(prev.nota ? [prev.nota] : [])] : [];
  const out = {
    codice: x.codice,
    nome: titleOf(x.p.name),
    cliente: x.p.partner_id[1],
    stato: x.stage,
    fatturatoLabel: eur(x.act.rev),
    margineLabel: `${eur(x.act.rev - x.act.cost)}${x.act.rev ? ` (${pct(x.act.rev - x.act.cost, x.act.rev)})` : ""}`,
    margineNeg: x.act.rev - x.act.cost < 0,
    nAnomalie: x.anomalie.length,
    bafo,
    consulenti,
    altriCosti,
    anomalie: x.anomalie,
  };
  if (prev?.dedicatedReport) out.dedicatedReport = prev.dedicatedReport;
  if (noteStoriche.length) {
    out.noteStoriche = noteStoriche;
    out.noteStoricheData = prevDate;
  }
  return out;
}

const NO_STRAT = "Senza strategist assegnato";
const NO_PM = "Senza PM assegnato";
const byStrat = new Map();
for (const x of built) {
  const s = x.strategist || NO_STRAT;
  if (!byStrat.has(s)) byStrat.set(s, new Map());
  const pms = byStrat.get(s);
  const pm = x.pm || NO_PM;
  if (!pms.has(pm)) pms.set(pm, []);
  pms.get(pm).push(x);
}
const totals = (xs) => ({ rev: sum(xs, (x) => x.act.rev), cost: sum(xs, (x) => x.act.cost) });
const strategists = [...byStrat.entries()]
  .map(([nome, pms]) => {
    const all = [...pms.values()].flat();
    const t = totals(all);
    const pmGroups = [...pms.entries()]
      .map(([pmNome, xs]) => ({
        slug: `${slug(nome)}-${slug(pmNome)}`,
        nome: pmNome,
        countLabel: `${xs.length} ${xs.length === 1 ? "progetto" : "progetti"} · ${eur(totals(xs).rev)} fatturato`,
        progetti: xs.sort((a, b) => b.act.rev - a.act.rev).map(progettoDoc),
        _rev: totals(xs).rev,
      }))
      .sort((a, b) => b._rev - a._rev)
      .map((g) => (delete g._rev, g));
    return {
      slug: slug(nome),
      nome,
      navCount: all.length,
      riepilogo: `${all.length} ${all.length === 1 ? "progetto" : "progetti"} · fatturato ${eur(t.rev)} · costo ${eur(t.cost)} · margine ${eur(t.rev - t.cost)} (${pct(t.rev - t.cost, t.rev)})`,
      pmGroups,
      _rev: t.rev,
    };
  })
  .sort((a, b) => (a.nome === NO_STRAT) - (b.nome === NO_STRAT) || b._rev - a._rev)
  .map((s) => (delete s._rev, s));

// Analisi giornate: solo consulenti esterni
const giornate = strategists
  .map((s) => ({
    strategist: s.nome,
    rows: built
      .filter((x) => (x.strategist || NO_STRAT) === s.nome)
      .flatMap((x) =>
        x.consulenti
          .filter((c) => c.esterno)
          .map((c) => {
            const fatt = c.fattGg + c.fattDraftGg;
            let tone = null;
            let title;
            if (c.regGg > 0 || fatt > 0) {
              if (fatt > c.regGg + 0.5) {
                tone = "over";
                title = `fatturato dal fornitore (${days(fatt)} gg) superiore al registrato a foglio ore (${days(c.regGg)} gg)`;
              } else if (c.regGg > fatt + 0.5) {
                tone = "under";
                title = `registrato a foglio ore (${days(c.regGg)} gg) superiore al fatturato (${days(fatt)} gg): giornate lavorate non ancora fatturate dal fornitore`;
              } else {
                tone = "ok";
                title = "foglio ore ≈ fatturato fornitore";
              }
            }
            return {
              codice: x.codice,
              progetto: titleOf(x.p.name),
              pm: x.pm || NO_PM,
              consulente: `${c.nome} (esterno)`,
              ordinato: c.ordGg ? days(c.ordGg) : "—",
              registrato: c.regGg ? days(c.regGg) : "—",
              fatturato: `${days(c.fattGg)} confermate${c.fattDraftGg ? ` / ${days(c.fattDraftGg)} bozza (${eur(c.fattDraftCost)})` : ""}`,
              fatturatoTone: tone,
              ...(title ? { fatturatoTitle: title } : {}),
            };
          })
      ),
  }))
  .filter((b) => b.rows.length);

const T = totals(built);
const totalPlanned = sum(built, (x) => x.planned);
const doc = {
  sottotitolo: `Report a consuntivo per Strategist → Project Manager → progetto, ricalcolato da Odoo il ${asOfIt} (ordini di vendita, fatture cliente e fornitore, fogli ore, Planning).`,
  perimetro: `Perimetro: ${built.length} progetti attivi (fase "In corso"/"Da fare", con cliente, non interni) al ${asOfIt}.`,
  kpi: {
    progettiAttivi: built.length,
    fatturatoActual: eur(T.rev),
    costoActual: eur(T.cost),
    margineActual: eur(T.rev - T.cost),
    margineActualPct: pct(T.rev - T.cost, T.rev),
    anomalieRilevate: sum(built, (x) => x.anomalie.length),
    progettiZero: built.filter((x) => x.act.rev === 0 && x.act.cost === 0).length,
  },
  strategists,
  giornateIntro:
    "Confronto, per ogni consulente esterno (con fatture fornitore imputate al progetto), tra le giornate ordinate a riga d'ordine, le giornate registrate a foglio ore e le giornate fatturate dal fornitore (confermate e in bozza). Il bollino segnala la coerenza tra foglio ore e fatturato fornitore.",
  giornate,
  footerNotes: [
    `Dati letti da Odoo il ${asOfIt} e ricalcolati con scripts/build-oriens-report-fixture.mjs: baseline dall'ordine di vendita, actual e bozza da fatture cliente/fornitore e fogli ore (stessa metodologia della generazione precedente, campi pf_* di project.project non utilizzati).`,
    `Giornate pianificate: ${totalPlanned ? `${days(totalPlanned)} giornate nel Planning Odoo sui progetti del perimetro, incluse nel Forecast.` : "nessuno slot del Planning Odoo è collegato ai progetti Oriens del perimetro, quindi il Forecast in giornate coincide con le giornate registrate."}`,
    "Le anomalie sono generate da regole automatiche; le note scritte a mano nella generazione precedente sono riportate a parte in ogni progetto come note storiche.",
    "Costo interno = costo standard del foglio ore; costo esterno = fatture fornitore imputate al conto analitico del progetto (le note spese non sono incluse).",
    "Ogni progetto è espandibile: cliccare sulla riga per il dettaglio baseline/actual/bozza/forecast, breakdown per consulente e anomalie.",
  ],
};
const file = join(OUT_DIR, `${dataAsOf}.json`);
writeFileSync(file, JSON.stringify(doc, null, 1) + "\n", "utf-8");
console.log(`✅ ${built.length} progetti, ${strategists.length} strategist, ${doc.kpi.anomalieRilevate} anomalie → ${file}`);
console.log(`   fatturato ${doc.kpi.fatturatoActual} · costo ${doc.kpi.costoActual} · margine ${doc.kpi.margineActual} (${doc.kpi.margineActualPct}) · pianificate ${days(totalPlanned)} gg`);
