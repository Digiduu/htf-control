#!/usr/bin/env node
// Costruisce il fixture di Capacity Digiduu a partire dagli scarichi grezzi di
// Odoo fatti via MCP in una sessione Claude (solo letture, salvati su disco
// così come restituiti):
//   fixtures/capacity-digiduu/<data>.json
// che poi va caricato con scripts/load-odoo-sync.mjs --capacity <data>.
//
// File attesi in <raw>:
// - planning.json: aggregate_records su planning.slot, domain
//   [company_id=6, start_datetime >= 1° del mese corrente 00:00 Roma in UTC],
//   groupby [resource_id, project_id, start_datetime:month, state],
//   aggregates [allocated_hours:sum]. Il raggruppamento per mese lo fa Odoo
//   nel fuso dell'utente (Europe/Rome), esattamente come la pivot del
//   Planning: conta solo il mese di inizio dello slot, senza spezzarlo sui
//   giorni (il Planning Digiduu usa "bucket" mensili di slot da 1 giorno).
// - employees.json: hr.employee company_id=6, campi name, resource_id,
//   job_title, job_id, x_studio_obiettivo_giornate ("Obiettivo mensile gg").
// - projects.json: project.project company_id=6 attivi e archiviati, campi
//   name, date_start, date, allocated_hours, effective_hours.
//
// Regole:
// - 12 mesi dal mese della data di generazione, giorni lavorativi lun–ven
//   (festività ignorate).
// - Giornate = ore allocate / 8. Slot senza risorsa scartati.
// - Slot su progetti con "Ferie" nel nome: non sono giornate assegnate, si
//   sottraggono all'obiettivo della persona in quel mese.
// - Obiettivo/disponibili = max(0, obiettivo mensile − ferie); obiettivo 0 o
//   vuoto = "non compilato" (null).
// - Chiave progetto "DD10340 · AMG" (codice · cliente), titolo = resto del
//   nome; i nomi che non iniziano con "DD" restano interi.
// - Budget per codice, solo progetti senza "Assistenza" nel nome: ordinate =
//   ore allocate/8 dei soli progetti con più di 16h (sotto è un segnaposto,
//   null se nessuno supera la soglia), registrate = ore effettive/8.
// - Fine per chiave = data fine più lontana tra i progetti con slot.
//
// Uso: node scripts/build-capacity-fixture.mjs <raw> <YYYY-MM-DD>

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [raw, dataAsOf] = process.argv.slice(2);
if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(dataAsOf || "")) {
  console.error("Uso: node scripts/build-capacity-fixture.mjs <raw> <YYYY-MM-DD>");
  process.exit(1);
}
const OUT_DIR = join("fixtures", "capacity-digiduu");
const load = (f) => JSON.parse(readFileSync(join(raw, f), "utf-8"));

const r1 = (n) => Math.round(n * 1000) / 1000;
const displayName = (s) => s.replace(/ Digiduu$/, "");
const isGeneric = (s) => /^(Da assegnare|Risorsa )/i.test(s);

// --- Mesi e giorni lavorativi ---------------------------------------------
const [y0, m0] = dataAsOf.split("-").map(Number);
const months = [];
const wd = [];
for (let i = 0; i < 12; i++) {
  const d = new Date(Date.UTC(y0, m0 - 1 + i, 1));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  months.push(`${y}-${String(m + 1).padStart(2, "0")}`);
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  let n = 0;
  for (let g = 1; g <= days; g++) {
    const dow = new Date(Date.UTC(y, m, g)).getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  wd.push(n);
}
const monthIdx = new Map(months.map((m, i) => [m, i]));

// Il gruppo mese di Odoo arriva come ["2026-09-30 22:00:00", "ottobre 2026"]:
// il primo valore è la mezzanotte di Roma del 1° del mese espressa in UTC,
// quindi basta riportarla a Roma (+1h/+2h) per ottenere il mese giusto.
function monthOfGroup(v) {
  const utc = new Date(`${v[0].replace(" ", "T")}Z`);
  const rome = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" }).format(utc);
  return rome.slice(0, 7);
}

// --- Chiavi progetto -------------------------------------------------------
function splitProjectName(name) {
  const parts = name.split(" - ").map((s) => s.trim());
  if (/^DD/.test(name) && parts.length >= 2) {
    return { code: parts[0], client: parts[1], key: `${parts[0]} · ${parts[1]}`, title: parts.slice(2).join(" - ") };
  }
  return { code: null, client: null, key: name.trim(), title: "" };
}

// --- Dipendenti ------------------------------------------------------------
const employees = load("employees.json").records;
const personByResource = new Map();
const people = [];
for (const e of employees) {
  if (!e.resource_id) continue;
  const name = displayName(e.name);
  const role = (e.job_id && e.job_id[1]) || e.job_title || "Senza ruolo";
  const goal = e.x_studio_obiettivo_giornate || null;
  const p = { name, ggsett: goal, roles: [role], avail: [], ferie: months.map(() => 0), generic: isGeneric(e.name) };
  personByResource.set(e.resource_id[0], p);
  people.push(p);
}

// --- Planning --------------------------------------------------------------
const groups = load("planning.json").groups;
const items = [];
const titles = {};
const keysWithSlots = new Set();
const projectIdsWithSlots = new Set();
let skippedNoResource = 0;
for (const g of groups) {
  if (!g.resource_id) {
    skippedNoResource++;
    continue;
  }
  const month = monthOfGroup(g["start_datetime:month"]);
  const mi = monthIdx.get(month);
  if (mi === undefined) continue;
  const days = g["allocated_hours:sum"] / 8;
  let person = personByResource.get(g.resource_id[0]);
  if (!person) {
    // Risorsa di Planning senza dipendente Digiduu: la teniamo comunque,
    // senza obiettivo (finisce tra i "non compilati" o tra le generiche).
    person = { name: displayName(g.resource_id[1]), ggsett: null, roles: ["Senza ruolo"], avail: [], ferie: months.map(() => 0), generic: isGeneric(g.resource_id[1]) };
    personByResource.set(g.resource_id[0], person);
    people.push(person);
  }
  const projName = g.project_id ? g.project_id[1] : "Senza progetto";
  if (/Ferie/i.test(projName)) {
    person.ferie[mi] += days;
    continue;
  }
  const { key, title } = splitProjectName(projName);
  titles[key] = title;
  keysWithSlots.add(key);
  if (g.project_id) projectIdsWithSlots.add(g.project_id[0]);
  items.push([person.name, month, projName, g.state === "published" ? "p" : "s", r1(days), key, title]);
}
for (const p of people) {
  p.ferie = p.ferie.map(r1);
  p.avail = p.ferie.map((f) => (p.ggsett ? r1(Math.max(0, p.ggsett - f)) : null));
}

// --- Budget e date di fine -------------------------------------------------
const projects = load("projects.json").records;
const budget = {};
const ends = {};
for (const pr of projects) {
  const { code, client, key, title } = splitProjectName(pr.name);
  if (projectIdsWithSlots.has(pr.id) && pr.date && (!ends[key] || pr.date > ends[key])) ends[key] = pr.date;
  if (!code || /Assistenza/i.test(pr.name)) continue;
  const b = (budget[code] ||= { ord: null, reg: 0, client, title });
  if (pr.allocated_hours > 16) b.ord = r1((b.ord || 0) + pr.allocated_hours / 8);
  b.reg = r1(b.reg + (pr.effective_hours || 0) / 8);
}

const [yy, mm, dd] = dataAsOf.split("-");
const out = { months, wd, people, items, titles, budget, ends, asof: `${dd}/${mm}/${yy}` };
mkdirSync(OUT_DIR, { recursive: true });
const file = join(OUT_DIR, `${dataAsOf}.json`);
writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`Scritto ${file}: ${people.length} persone, ${items.length} righe, ${Object.keys(budget).length} codici budget, ${skippedNoResource} gruppi senza risorsa scartati.`);
