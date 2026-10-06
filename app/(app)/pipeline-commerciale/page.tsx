"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createClient } from "../../lib/supabase/client";
import type { UserRole, VisibilityGroup } from "../../lib/auth/dal";
import { saveSnapshot } from "./actions";
import type { Company, PipelineDoc, RevenueStep } from "./lib/types";
import {
  STATE_COLOR,
  MESI,
  fmt,
  fmtSigned,
  buildColorMap,
  normalizeHexColor,
  buildPrevCurrentTable,
  mergeOrderRows,
  visibleCellStates,
  type MergedRow,
  type PrevCurrentEntry,
} from "./lib/pipeline-logic";

type FrozenCol = { key: string; label: string; width: number; left: number; last: boolean; num?: boolean };

const FROZEN_DUAL: Omit<FrozenCol, "left" | "last">[] = [
  { key: "account", label: "Account", width: 78 },
  { key: "project_leader", label: "PL", width: 72 },
  { key: "cliente", label: "Cliente", width: 155 },
  { key: "origine", label: "Origine", width: 108 },
  { key: "ordinato", label: "Ordinato", width: 108, num: true },
];

const FROZEN_SINGLE: Omit<FrozenCol, "left" | "last">[] = [
  { key: "referente", label: "Referente", width: 160 },
  { key: "cliente", label: "Cliente", width: 155 },
  { key: "origine", label: "Origine", width: 108 },
  { key: "ordinato", label: "Ordinato", width: 108, num: true },
];

function frozenCols(dual: boolean): FrozenCol[] {
  const cols = dual ? FROZEN_DUAL : FROZEN_SINGLE;
  let left = 0;
  return cols.map((c, i) => {
    const withLeft = { ...c, left, last: i === cols.length - 1 };
    left += c.width;
    return withLeft;
  });
}

function frozenStyle(col: FrozenCol, background: string, extra?: CSSProperties): CSSProperties {
  return {
    position: "sticky",
    left: col.left,
    width: col.width,
    minWidth: col.width,
    maxWidth: col.width,
    background,
    ...extra,
  };
}

// Abbrevia "Nome Cognome" in "Nome C." per le colonne Account e Project
// Leader della tabella Digiduu, per risparmiare spazio — il nome completo
// resta comunque leggibile al passaggio del mouse (title).
function abbreviateName(name: string | null | undefined): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const first = parts[0];
  const lastInitial = parts[parts.length - 1][0];
  return `${first} ${lastInitial}.`;
}

function fmtDateLabel(iso: string) {
  try {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  } catch {
    return iso;
  }
}

const HEADER_BG = "#3d4a55";
const TOTAL_BG = "#44546a";
const CRM_BG = "#fdebd0";
const STRIPE = "#fafaf8";

// Stesso indirizzo controllato lato server in actions.ts: qui serve solo a
// nascondere il pulsante "Salva versione di oggi" a chiunque altro, il vero
// confine di sicurezza resta la riverifica dentro saveSnapshot().
const SNAPSHOT_LABEL_USER_EMAIL = "c.rossetto@oriens.consulting";

export default function PipelineCommercialePage() {
  const supabase = useMemo(() => createClient(), []);

  const [company, setCompany] = useState<Company | null>(null);
  const [scope, setScope] = useState<{
    visibilityGroup: VisibilityGroup;
    projectLeaderName: string | null;
    role: UserRole;
    email: string | null;
  } | null>(null);
  const [snapshotPanelOpen, setSnapshotPanelOpen] = useState(false);
  const [snapshotLabelInput, setSnapshotLabelInput] = useState("");
  const [snapshotPending, setSnapshotPending] = useState(false);
  const [snapshotMessage, setSnapshotMessage] = useState<string | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [datesByCompany, setDatesByCompany] = useState<Record<Company, string[]>>({ oriens: [], digiduu: [] });
  // Etichette facoltative assegnate ai salvataggi manuali, per data: null per
  // le generazioni importate da fixture/Odoo (vedi migration
  // 20261006120000_pipeline_generations_snapshot_label.sql).
  const [labelsByCompany, setLabelsByCompany] = useState<Record<Company, Record<string, string | null>>>({
    oriens: {},
    digiduu: {},
  });
  const [selectedDate, setSelectedDate] = useState("");
  const [doc, setDoc] = useState<PipelineDoc | null>(null);
  // compareDate è gestita separatamente da selectedDate: cambiare la data
  // principale ripropone un default ragionevole (la generazione immediatamente
  // precedente), ma l'utente può sempre scegliere un'altra generazione di
  // confronto dal menu "Confronta con".
  const [compareDate, setCompareDate] = useState("");
  const [compareDoc, setCompareDoc] = useState<PipelineDoc | null>(null);
  const [docSnapshotLabel, setDocSnapshotLabel] = useState<string | null>(null);
  const [plFilter, setPlFilter] = useState("");
  const [filterText, setFilterText] = useState("");
  const [disabledStates, setDisabledStates] = useState<Set<string>>(new Set());
  const [tipologiaOpen, setTipologiaOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Scroll orizzontale della tabella principale: all'apertura (o al cambio
  // generazione) deve partire dal mese corrente reale, non da gennaio —
  // vedi l'effect più sotto che la posiziona dopo ogni render della tabella.
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const monthHeaderRefs = useRef<(HTMLTableCellElement | null)[]>([]);

  // Il filtro Tipologia si azzera al cambio azienda: gli stati disponibili
  // (nomi ed elenco) sono specifici di ciascuna azienda/generazione, quindi
  // una selezione fatta su Oriens non ha senso riapplicata a Digiduu. Reset
  // fatto durante il render (non in un effect) per evitare il doppio render
  // che scatterebbe con un setState sincrono dentro useEffect.
  const [filterResetCompany, setFilterResetCompany] = useState(company);
  if (company !== filterResetCompany) {
    setFilterResetCompany(company);
    setDisabledStates(new Set());
    setTipologiaOpen(false);
  }

  // Ambito di visibilità dell'utente corrente: un utente globale vede tutto
  // (comportamento invariato, azienda di default "oriens"), gli altri gruppi
  // sono forzati su Digiduu — unica azienda con dettaglio Project Leader
  // (vedi migration 20260911140000_visibility_groups.sql). L'accesso reale ai
  // dati di un'altra azienda resta comunque bloccato dalla RLS a prescindere
  // da questo stato, che serve solo a scegliere cosa mostrare in UI.
  useEffect(() => {
    let cancelled = false;
    async function loadScope() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("visibility_group, project_leader_name, role")
        .eq("id", user.id)
        .single();
      if (cancelled) return;
      const visibilityGroup = (profile?.visibility_group ?? "global") as VisibilityGroup;
      const projectLeaderName = profile?.project_leader_name ?? null;
      const role = (profile?.role ?? "std_user") as UserRole;
      setScope({ visibilityGroup, projectLeaderName, role, email: user.email ?? null });
      setCompany(visibilityGroup === "global" ? "oriens" : "digiduu");
    }
    loadScope();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Elenco date disponibili per l'azienda selezionata (ascendente) + selezione
  // di default sull'ultima (più recente), come nell'Artifact originale.
  useEffect(() => {
    if (!company) return;
    const activeCompany = company;
    let cancelled = false;
    async function loadDates() {
      setError(null);
      // Via RPC, non una lettura diretta della tabella: la funzione calcola da
      // sola (dal profilo dell'utente autenticato) a quali aziende ha
      // accesso — vedi migration 20261009130000_pipeline_generations_real_pl_rls.sql.
      const { data, error: err } = await supabase.rpc("pipeline_generation_dates", { p_company: activeCompany });
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      const dates = (data || []).map((r: { date: string }) => r.date);
      setDatesByCompany((prev) => ({ ...prev, [activeCompany]: dates }));
      const labels: Record<string, string | null> = {};
      for (const r of data || []) labels[r.date as string] = (r.snapshot_label as string | null) ?? null;
      setLabelsByCompany((prev) => ({ ...prev, [activeCompany]: labels }));
      if (dates.length) {
        setSelectedDate(dates[dates.length - 1]);
      } else {
        setSelectedDate("");
        setDoc(null);
        setCompareDate("");
        setLoading(false);
      }
    }
    loadDates();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company]);

  // Documento della data selezionata: cambiare data ricarica interamente la
  // tabella con i dati di quella sola generazione, senza mai mescolare
  // generazioni diverse. Il default di "Confronta con" torna alla
  // generazione immediatamente precedente ogni volta che si cambia data
  // principale — l'utente può poi sceglierne un'altra dal relativo menu.
  useEffect(() => {
    if (!selectedDate || !company) return;
    const activeCompany = company;
    let cancelled = false;
    async function loadDoc() {
      setLoading(true);
      setError(null);
      // Via RPC, non una lettura diretta della tabella: per un Project Leader
      // la funzione restituisce già solo le proprie righe (vedi migration
      // 20261009130000_pipeline_generations_real_pl_rls.sql) — qui non c'è
      // più nessun filtro di sicurezza da applicare lato client.
      const { data, error: err } = await supabase.rpc("pipeline_generation_for_viewer", {
        p_company: activeCompany,
        p_date: selectedDate,
      });
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      const row = data?.[0] as { data: PipelineDoc; snapshot_label: string | null } | undefined;
      const currentDoc = row?.data;
      setDoc(currentDoc ?? null);
      setDocSnapshotLabel(row?.snapshot_label ?? null);
      setPlFilter("");

      const asc = datesByCompany[activeCompany] || [];
      const idx = asc.indexOf(selectedDate);
      setCompareDate(idx > 0 ? asc[idx - 1] : "");
      setLoading(false);
    }
    loadDoc();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, company]);

  // Generazione di confronto (selettore "Confronta con"): usata SOLO per la
  // tabellina "Mese precedente/attuale" — non altera mai i valori mostrati
  // nella tabella principale.
  useEffect(() => {
    if (!compareDate || !company) return;
    const activeCompany = company;
    let cancelled = false;
    async function loadCompareDoc() {
      const { data } = await supabase.rpc("pipeline_generation_for_viewer", {
        p_company: activeCompany,
        p_date: compareDate,
      });
      const row = data?.[0] as { data: PipelineDoc } | undefined;
      if (!cancelled) setCompareDoc(row?.data ?? null);
    }
    loadCompareDoc();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareDate, company]);

  const dual = !!doc?.dual_mode;
  const cols = useMemo(() => frozenCols(dual), [dual]);

  // Apre la tabella sul mese corrente reale (non sulla data della
  // generazione): se l'anno della generazione è l'anno in corso, scorre
  // orizzontalmente in modo che quel mese sia il primo subito dopo le
  // colonne congelate, lasciando i mesi precedenti scorribili a sinistra.
  // Negli altri anni (storico non dell'anno corrente) non ha senso un "mese
  // corrente": resta semplicemente aperta da gennaio.
  useEffect(() => {
    if (!doc) return;
    if (doc.year !== new Date().getFullYear()) return;
    const container = tableScrollRef.current;
    const th = monthHeaderRefs.current[new Date().getMonth()];
    if (!container || !th) return;
    const frozenWidth = cols.reduce((s, c) => s + c.width, 0);
    const delta = th.getBoundingClientRect().left - container.getBoundingClientRect().left;
    container.scrollLeft = Math.max(0, container.scrollLeft + delta - frozenWidth);
  }, [doc, cols]);

  const plNames = useMemo(() => {
    if (!doc || !dual) return [];
    const names = new Set<string>();
    for (const r of doc.rows || []) {
      if (r.project_leader) names.add(r.project_leader);
    }
    return [...names].sort((a, b) => a.localeCompare(b, "it"));
  }, [doc, dual]);

  // Un Project Leader resta sempre bloccato sul proprio nome (non può
  // allargare la vista alle commesse altrui): calcolato direttamente in
  // render, non con un effect che copia scope dentro plFilter.
  const effectivePlFilter = scope?.visibilityGroup === "project_leader" ? scope.projectLeaderName ?? "" : plFilter;
  const plActive = company === "digiduu" && dual && !!effectivePlFilter;

  const mergedRows = useMemo<MergedRow[]>(() => {
    if (!doc) return [];
    let rows = mergeOrderRows(doc.rows || []);
    if (plActive) {
      rows = rows.filter((r) => r.project_leader === effectivePlFilter);
    }
    return rows;
  }, [doc, plActive, effectivePlFilter]);

  // compareDate vuoto ("Confronta con: nessuna") azzera il confronto anche se
  // compareDoc contiene ancora l'ultimo documento caricato: niente setState
  // di pulizia dentro l'effect, si ignora qui il valore non più pertinente.
  const effectiveCompareDoc = compareDate ? compareDoc : null;

  // Colori letti dalla generazione corrente (doc.stato_summary), non da una
  // mappa statica: così ogni generazione storica mostra i propri colori
  // originali anche se lo schema degli stati è cambiato nel tempo.
  const colorMap = useMemo(() => buildColorMap(doc), [doc]);

  // Elenco stati disponibili per il filtro Tipologia, nello stesso ordine e
  // con gli stessi colori del Riepilogo per stato di questa generazione.
  const availableStates = useMemo(
    () => (doc?.stato_summary || []).map((s) => ({ stato: s.stato, color: normalizeHexColor(s.color) })),
    [doc]
  );
  const stateFilterActive = disabledStates.size > 0;

  // Le righe CRM (opportunità senza importo, stato nullo in Odoo perché non
  // hanno un campo Fattibilità) appartengono alla "famiglia" Previsione: col
  // filtro Tipologia attivo restano visibili solo finché resta acceso almeno
  // uno stato il cui nome inizia per "Previsione".
  const previsioneFamilyVisible =
    !stateFilterActive || availableStates.some((s) => s.stato.startsWith("Previsione") && !disabledStates.has(s.stato));

  const visibleRows = useMemo(
    () =>
      mergedRows.filter(
        (r) =>
          (!filterText || (r.cliente || "").toLowerCase().includes(filterText.toLowerCase())) &&
          (!r.is_crm || previsioneFamilyVisible)
      ),
    [mergedRows, filterText, previsioneFamilyVisible]
  );

  const anyFilter = plActive || !!filterText || stateFilterActive;

  const totals = useMemo(() => {
    if (!anyFilter) return doc?.overall ?? { ordinato: 0, months: new Array(12).fill(0), totale: 0 };
    const months = new Array(12).fill(0);
    let ordinato = 0;
    let totale = 0;
    for (const r of visibleRows) {
      // Le righe CRM non hanno mai un importo nei mesi/totale (solo, se
      // esiste, una stima nel tooltip): non vanno mai sommate nei totali.
      if (r.is_crm) continue;
      ordinato += r.ordinato || 0;
      if (stateFilterActive) {
        let rowTotale = 0;
        for (let i = 0; i < 12; i++) {
          const v = visibleCellStates(r._cellStates?.[i] || [], disabledStates).reduce((s, x) => s + x.val, 0);
          months[i] += v;
          rowTotale += v;
        }
        totale += rowTotale;
      } else {
        totale += r.totale || 0;
        for (let i = 0; i < 12; i++) months[i] += r.months[i] || 0;
      }
    }
    return { ordinato, months, totale };
  }, [anyFilter, doc, visibleRows, stateFilterActive, disabledStates]);

  // Etichetta della riga TOTALE: combina Project Leader e Tipologia quando
  // entrambi i filtri sono attivi (es. "TOTALE MARIO ROSSI · 3/6 TIPOLOGIE").
  const totalLabel = useMemo(() => {
    const parts: string[] = [];
    if (plActive) parts.push(plFilter.toUpperCase());
    if (stateFilterActive) parts.push(`${availableStates.length - disabledStates.size}/${availableStates.length} TIPOLOGIE`);
    if (!parts.length) return "TOTALE GENERALE";
    return plActive ? `TOTALE ${parts.join(" · ")}` : `TOTALE GENERALE · ${parts.join(" · ")}`;
  }, [plActive, plFilter, stateFilterActive, availableStates, disabledStates]);

  const descDates = useMemo(
    () => [...((company ? datesByCompany[company] : []) || [])].reverse(),
    [datesByCompany, company]
  );

  // Opzioni per il selettore "Confronta con": tutte le generazioni storiche
  // tranne quella attualmente selezionata (confrontare una generazione con
  // se stessa non avrebbe senso).
  const compareDateOptions = useMemo(() => descDates.filter((d) => d !== selectedDate), [descDates, selectedDate]);

  // Tabellina "Mese precedente/Mese attuale": cosa diceva la generazione di
  // confronto nei due mesi più recenti secondo LA SUA data di generazione.
  const prevCurrentTable = useMemo(() => {
    if (!doc || !effectiveCompareDoc) return null;
    const entries = buildPrevCurrentTable(doc, effectiveCompareDoc);
    if (!entries || !plActive) return entries;
    return entries.filter((e) => e.projectLeader === effectivePlFilter);
  }, [doc, effectiveCompareDoc, plActive, effectivePlFilter]);

  // Duplica l'ultima generazione disponibile sotto la data di oggi (vedi
  // actions.ts: non esiste un collegamento live a Odoo da qui, quindi
  // "fotografare la situazione di oggi" significa portare avanti l'ultimo
  // dato noto). Il controllo "esiste già una versione di oggi?" avviene qui,
  // lato client, usando le date già caricate, per poter chiedere conferma
  // PRIMA di sovrascrivere — la action stessa sovrascrive senza ulteriori
  // domande una volta invocata.
  async function handleSaveSnapshot() {
    if (!company) return;
    const today = new Date().toISOString().slice(0, 10);
    const alreadyExists = (datesByCompany[company] || []).includes(today);
    if (alreadyExists) {
      const proceed = window.confirm(
        `Esiste già una versione salvata per oggi (${fmtDateLabel(today)}). Sovrascriverla con i dati più recenti?`
      );
      if (!proceed) return;
    }
    setSnapshotPending(true);
    setSnapshotMessage(null);
    setSnapshotError(null);
    const result = await saveSnapshot(company, snapshotLabelInput);
    setSnapshotPending(false);
    if ("error" in result) {
      setSnapshotError(result.error);
      return;
    }
    setDatesByCompany((prev) => {
      const existing = (prev[company] || []).filter((d) => d !== result.date);
      return { ...prev, [company]: [...existing, result.date].sort() };
    });
    setLabelsByCompany((prev) => ({ ...prev, [company]: { ...prev[company], [result.date]: result.label } }));
    setSelectedDate(result.date);
    setSnapshotPanelOpen(false);
    setSnapshotLabelInput("");
    setSnapshotMessage(
      result.overwritten
        ? `Versione di oggi (${fmtDateLabel(result.date)}) aggiornata${result.label ? ` — "${result.label}"` : ""}.`
        : `Nuova versione salvata per il ${fmtDateLabel(result.date)}${result.label ? ` — "${result.label}"` : ""}.`
    );
  }

  return (
    <div className="p-6">
      <div className="mb-1 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Pipeline Commerciale</h1>
          <p className="mt-1 text-sm text-gray-500">
            {doc
              ? `${doc.label} ${doc.year} — ${fmtDateLabel(selectedDate)}${docSnapshotLabel ? ` "${docSnapshotLabel}"` : ""}${
                  doc.generated_at ? ` · generato ${new Date(doc.generated_at).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" })}` : ""
                } · ${(doc.rows || []).length} righe`
              : loading
                ? "Caricamento…"
                : "Nessuna generazione disponibile."}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        {/* Nessun hook ancora presente per un eventuale terzo tab "Riepilogo
            Direzione" (nascosto/non ancora attivo nell'Artifact di
            riferimento al 05/10/2026): se e quando verrà richiesto, va
            aggiunto qui come terza opzione accanto a company, con la sua
            propria vista aggregata (non confonderlo con /sintesi-pipeline,
            già esistente in questo progetto ma su una pagina separata). */}
        {scope?.visibilityGroup === "global" && (
          <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            {(["oriens", "digiduu"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCompany(c)}
                className={`px-4 py-2 text-sm font-semibold ${
                  company === c ? "bg-violet-50 text-violet-700" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {c === "oriens" ? "Oriens Consulting" : "Digiduu"}
              </button>
            ))}
          </div>
        )}
        {scope && scope.visibilityGroup !== "global" && (
          <span className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm">
            Digiduu
          </span>
        )}

        <select
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-violet-500 focus:outline-none"
        >
          {descDates.length === 0 && <option>Nessuno storico disponibile</option>}
          {descDates.map((d) => (
            <option key={d} value={d}>
              {fmtDateLabel(d)}
              {company && labelsByCompany[company]?.[d] ? ` — ${labelsByCompany[company][d]}` : ""}
            </option>
          ))}
        </select>

        {compareDateOptions.length > 0 && (
          <select
            value={compareDate}
            onChange={(e) => setCompareDate(e.target.value)}
            title="Generazione usata solo per la tabellina Mese precedente/attuale: non cambia i valori della tabella principale"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-violet-500 focus:outline-none"
          >
            <option value="">Confronta con: nessuna</option>
            {compareDateOptions.map((d) => (
              <option key={d} value={d}>
                Confronta con: {fmtDateLabel(d)}
                {company && labelsByCompany[company]?.[d] ? ` — ${labelsByCompany[company][d]}` : ""}
              </option>
            ))}
          </select>
        )}

        {scope?.role === "superadmin" && scope.email === SNAPSHOT_LABEL_USER_EMAIL && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setSnapshotPanelOpen((v) => !v)}
              disabled={snapshotPending || !doc}
              title="Salva una copia dei dati più recenti con la data di oggi, per tenerne traccia nello storico"
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:border-violet-400 hover:text-violet-700 disabled:opacity-50"
            >
              {snapshotPending ? "Salvataggio…" : "📸 Salva versione di oggi"}
            </button>
            {snapshotPanelOpen && (
              <div className="absolute left-0 z-20 mt-1 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Nome versione (facoltativo)
                </label>
                <input
                  type="text"
                  autoFocus
                  value={snapshotLabelInput}
                  onChange={(e) => setSnapshotLabelInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveSnapshot();
                    if (e.key === "Escape") setSnapshotPanelOpen(false);
                  }}
                  placeholder={`es. "Rigenerazione sera"`}
                  className="mb-2.5 w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm text-gray-900 focus:border-violet-500 focus:outline-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSnapshotPanelOpen(false)}
                    className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50"
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSnapshot}
                    disabled={snapshotPending}
                    className="rounded-md bg-violet-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
                  >
                    {snapshotPending ? "Salvataggio…" : "Salva"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {dual && plNames.length > 0 && scope?.visibilityGroup !== "project_leader" && (
          <select
            value={plFilter}
            onChange={(e) => setPlFilter(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-violet-500 focus:outline-none"
          >
            <option value="">Tutti i Project Leader</option>
            {plNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
        {scope?.visibilityGroup === "project_leader" && (
          <span className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm">
            Project Leader: {scope.projectLeaderName}
          </span>
        )}

        <div className="flex-1" />

        {availableStates.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setTipologiaOpen((v) => !v)}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold shadow-sm ${
                stateFilterActive
                  ? "border-violet-300 bg-violet-50 text-violet-700"
                  : "border-gray-200 bg-white text-gray-700 hover:border-violet-400 hover:text-violet-700"
              }`}
            >
              Tipologia{stateFilterActive ? ` (${availableStates.length - disabledStates.size}/${availableStates.length})` : ""}
            </button>
            {tipologiaOpen && (
              <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Filtra per tipologia</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-xs font-semibold text-violet-700 hover:underline"
                      onClick={() => setDisabledStates(new Set())}
                    >
                      Tutti
                    </button>
                    <button
                      type="button"
                      className="text-xs font-semibold text-violet-700 hover:underline"
                      onClick={() => setDisabledStates(new Set(availableStates.map((s) => s.stato)))}
                    >
                      Nessuno
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  {availableStates.map((s) => (
                    <label key={s.stato} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={!disabledStates.has(s.stato)}
                        onChange={(e) =>
                          setDisabledStates((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.delete(s.stato);
                            else next.add(s.stato);
                            return next;
                          })
                        }
                      />
                      <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                      {s.stato}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filtra per cliente…"
          className="w-56 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-violet-500 focus:outline-none"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Errore nel leggere i dati: {error}
        </div>
      )}
      {snapshotError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Errore nel salvare lo snapshot: {snapshotError}
        </div>
      )}
      {snapshotMessage && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {snapshotMessage}
        </div>
      )}

      {doc?.revenue_summary && !plActive && <RevenueSummaryPanel doc={doc} />}

      <Legend doc={doc} />

      {doc?.source_note && <p className="mb-3.5 text-xs text-gray-500">{doc.source_note}</p>}

      {!doc && !loading && !error && (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Nessuna generazione ancora disponibile per {company === "oriens" ? "Oriens Consulting" : "Digiduu"}.
        </div>
      )}

      {doc && scope?.visibilityGroup === "project_leader" && !dual && (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Nessun dettaglio Project Leader disponibile per questa generazione.
        </div>
      )}

      {doc && !(scope?.visibilityGroup === "project_leader" && !dual) && (
        <>
          {/* La tabella principale e il pannello "Mese precedente/attuale"
              stanno affiancati, come nell'Artifact di riferimento — il
              pannello non altera mai i valori della tabella principale, è
              solo un confronto rapido su cosa diceva l'ultima generazione. */}
          <div className="flex items-start gap-4">
          <div
            ref={tableScrollRef}
            className="min-w-0 flex-1 overflow-auto rounded-lg border border-gray-200 shadow-sm"
            style={{ maxHeight: "72vh" }}
          >
            <table className="w-full border-separate border-spacing-0 whitespace-nowrap text-[12.5px]">
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th
                      key={c.key}
                      title={c.key === "project_leader" ? "Project Leader" : undefined}
                      className={`px-2.5 py-2 text-left font-semibold text-white ${c.num ? "text-right" : ""}`}
                      style={frozenStyle(c, HEADER_BG, {
                        top: 0,
                        // Deve restare sopra alle colonne mese (z-10, sticky
                        // solo in verticale): altrimenti scorrendo
                        // orizzontalmente queste ultime coprono le colonne
                        // congelate invece di scorrere sotto di esse — bug
                        // rimasto invisibile finché la tabella si apriva
                        // sempre da gennaio (scrollLeft 0, nessuna sovrapposizione).
                        zIndex: c.last ? 21 : 20,
                        boxShadow: c.last ? "4px 0 6px -4px rgba(0,0,0,.28)" : undefined,
                      })}
                    >
                      {c.label}
                    </th>
                  ))}
                  {MESI.map((m, i) => (
                    <th
                      key={m}
                      ref={(el) => {
                        monthHeaderRefs.current[i] = el;
                      }}
                      className="sticky top-0 z-10 px-2.5 py-2 text-right font-semibold text-white"
                      style={{ background: HEADER_BG }}
                    >
                      {m}
                    </th>
                  ))}
                  <th className="sticky top-0 z-10 px-2.5 py-2 text-right font-semibold text-white" style={{ background: HEADER_BG }}>
                    Totale {doc.year}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r, rowIdx) => {
                  const rowBg = rowIdx % 2 === 0 ? "#ffffff" : STRIPE;
                  // Con il filtro Tipologia attivo il totale di riga si ricalcola
                  // sommando solo gli stati rimasti spuntati (non è più il totale
                  // pre-calcolato in doc.rows, che copre tutti gli stati).
                  const rowTotale = stateFilterActive
                    ? Array.from({ length: 12 }).reduce(
                        (sum: number, _, i) =>
                          sum + visibleCellStates(r._cellStates?.[i] || [], disabledStates).reduce((a, x) => a + x.val, 0),
                        0
                      ) || null
                    : r.totale;
                  return (
                    <tr key={`${r.origine ?? "x"}-${r.cliente}-${rowIdx}`} className={r.is_crm ? "" : undefined}>
                      {cols.map((c) => {
                        const isCliente = c.key === "cliente";
                        const isOrigine = c.key === "origine";
                        const isAbbreviatedName = c.key === "account" || c.key === "project_leader";
                        const cellBg = isCliente && r.is_crm ? CRM_BG : rowBg;
                        const rawValue = (r as unknown as Record<string, string | null>)[c.key] || "";
                        let value: string | number | null = "";
                        if (c.key === "ordinato") value = fmt(r.ordinato);
                        else if (isAbbreviatedName) value = abbreviateName(rawValue);
                        else value = rawValue;
                        const cellTitle = isCliente && r.is_crm && r.crm_comment
                          ? r.crm_comment
                          : isOrigine
                            ? r.origine_titolo || undefined
                            : isAbbreviatedName
                              ? rawValue || undefined
                              : undefined;
                        return (
                          <td
                            key={c.key}
                            title={cellTitle}
                            className={`border-b border-gray-200 px-2.5 py-1.5 text-gray-900 ${
                              c.num ? "text-right font-bold tabular-nums" : ""
                            } ${isCliente ? "whitespace-normal font-medium" : "overflow-hidden text-ellipsis"} ${c.key === "origine" ? "text-gray-500" : ""}`}
                            style={frozenStyle(c, cellBg, {
                              zIndex: 1,
                              boxShadow: c.last ? "4px 0 6px -4px rgba(0,0,0,.28)" : undefined,
                            })}
                          >
                            {value}
                          </td>
                        );
                      })}
                      {Array.from({ length: 12 }).map((_, i) => {
                        const rawStates = r._cellStates?.[i] || [];
                        const states = stateFilterActive ? visibleCellStates(rawStates, disabledStates) : rawStates;
                        const cellVal = stateFilterActive ? states.reduce((s, x) => s + x.val, 0) || null : r.months[i];
                        // Nessuno stato in quel mese: niente sfondo di stato, resta il
                        // colore di base della riga (alternanza zebrata), non trasparente.
                        let style: CSSProperties = { background: rowBg };
                        let title: string | undefined;
                        if (states.length === 1) {
                          style = { background: colorMap[states[0].stato || ""] || "transparent" };
                        } else if (states.length > 1) {
                          const sorted = [...states].sort((a, b) => b.val - a.val);
                          const c1 = colorMap[sorted[0].stato || ""] || "transparent";
                          const c2 = colorMap[(sorted[1] || sorted[0]).stato || ""] || c1;
                          style = { background: `linear-gradient(135deg, ${c1} 50%, ${c2} 50%)` };
                          title = states.map((s) => `${s.stato}: ${fmt(s.val)}`).join(" + ");
                        }
                        return (
                          <td key={i} className="border-b border-gray-200 px-2.5 py-1.5 text-right tabular-nums text-gray-900" style={style} title={title}>
                            {fmt(cellVal)}
                          </td>
                        );
                      })}
                      <td className="border-b border-gray-200 px-2.5 py-1.5 text-right font-bold tabular-nums text-gray-900">{fmt(rowTotale)}</td>
                    </tr>
                  );
                })}

                <tr>
                  <td
                    colSpan={cols.length - 1}
                    className="px-2.5 py-2 font-bold text-white"
                    style={{ position: "sticky", left: 0, width: cols.slice(0, -1).reduce((s, x) => s + x.width, 0), background: TOTAL_BG }}
                  >
                    {totalLabel}
                  </td>
                  <td
                    className="px-2.5 py-2 text-right font-bold tabular-nums text-white"
                    style={frozenStyle(cols[cols.length - 1], TOTAL_BG, { boxShadow: "4px 0 6px -4px rgba(0,0,0,.28)" })}
                  >
                    {fmt(totals.ordinato)}
                  </td>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <td key={i} className="px-2.5 py-2 text-right font-bold tabular-nums text-white" style={{ background: TOTAL_BG }}>
                      {fmt(totals.months[i])}
                    </td>
                  ))}
                  <td className="px-2.5 py-2 font-bold tabular-nums text-white" style={{ background: TOTAL_BG }}>
                    {fmt(totals.totale)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {prevCurrentTable && prevCurrentTable.length > 0 && (
            <PrevCurrentPanel entries={prevCurrentTable} compareDate={compareDate} />
          )}
          </div>

          {!plActive && doc.stato_summary?.length > 0 && (
            <div className="mt-5 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <h2 className="border-b border-gray-200 px-3.5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Riepilogo per stato</h2>
              <div className="overflow-auto">
                <table className="w-full border-separate border-spacing-0 text-[12.5px]">
                  <thead>
                    <tr>
                      <th className="px-2.5 py-2 text-left font-semibold text-white" style={{ background: HEADER_BG }}>
                        Stato
                      </th>
                      {MESI.map((m) => (
                        <th key={m} className="px-2.5 py-2 text-right font-semibold text-white" style={{ background: HEADER_BG }}>
                          {m}
                        </th>
                      ))}
                      <th className="px-2.5 py-2 text-right font-semibold text-white" style={{ background: HEADER_BG }}>
                        Totale {doc.year}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(stateFilterActive ? doc.stato_summary.filter((s) => !disabledStates.has(s.stato)) : doc.stato_summary).map((s) => {
                      const color = normalizeHexColor(s.color);
                      return (
                      <tr key={s.stato}>
                        <td className="border-b border-gray-100 px-2.5 py-1.5 font-semibold" style={{ background: `${color}22` }}>
                          {s.stato}
                        </td>
                        {s.months.map((v, i) => (
                          <td key={i} className="border-b border-gray-100 px-2.5 py-1.5 text-right tabular-nums" style={{ background: v ? `${color}33` : undefined }}>
                            {fmt(v)}
                          </td>
                        ))}
                        <td className="border-b border-gray-100 px-2.5 py-1.5 text-right font-bold tabular-nums" style={{ background: `${color}33` }}>
                          {fmt(s.totale)}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!plActive && doc.target_table?.length > 0 && (
            <div className="mt-5 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <h2 className="border-b border-gray-200 px-3.5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Target {doc.year}</h2>
              <div className="overflow-auto">
                <table className="w-full border-separate border-spacing-0 text-[12.5px]">
                  <thead>
                    <tr>
                      <th className="px-2.5 py-2 text-left font-semibold text-white" style={{ background: HEADER_BG }}>
                        Cliente
                      </th>
                      <th className="px-2.5 py-2 text-right font-semibold text-white" style={{ background: HEADER_BG }}>
                        Ordinato
                      </th>
                      <th className="px-2.5 py-2 text-right font-semibold text-white" style={{ background: HEADER_BG }}>
                        Target
                      </th>
                      <th className="px-2.5 py-2 text-right font-semibold text-white" style={{ background: HEADER_BG }}>
                        Differenza
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc.target_table.map((t, i) => {
                      const totOrd = doc.target_table.reduce((s, x) => s + (x.ordinato || 0), 0);
                      const totTgt = doc.target_table.reduce((s, x) => s + (x.target || 0), 0);
                      const totDiff = doc.target_table.reduce((s, x) => s + (x.differenza || 0), 0);
                      const isLast = i === doc.target_table.length - 1;
                      return (
                        <Fragment key={t.cliente ?? t.label ?? i}>
                          <tr>
                            <td className="whitespace-normal border-b border-gray-100 px-2.5 py-1.5 font-medium">{t.cliente || t.label || "Altri"}</td>
                            <td className="border-b border-gray-100 px-2.5 py-1.5 text-right tabular-nums">{fmt(t.ordinato)}</td>
                            <td className="border-b border-gray-100 px-2.5 py-1.5 text-right tabular-nums">{fmt(t.target)}</td>
                            <td
                              className={`border-b border-gray-100 px-2.5 py-1.5 text-right font-bold tabular-nums ${
                                t.differenza > 0 ? "text-emerald-700" : t.differenza < 0 ? "text-red-700" : ""
                              }`}
                            >
                              {fmtSigned(t.differenza)}
                            </td>
                          </tr>
                          {isLast && (
                            <tr className="font-bold text-white" style={{ background: TOTAL_BG }}>
                              <td className="px-2.5 py-1.5">TOTALE</td>
                              <td className="px-2.5 py-1.5 text-right tabular-nums">{fmt(totOrd)}</td>
                              <td className="px-2.5 py-1.5 text-right tabular-nums">{fmt(totTgt)}</td>
                              <td className="px-2.5 py-1.5 text-right tabular-nums">{fmtSigned(totDiff)}</td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Nascosto del tutto dal chiamante quando il filtro Project Leader è attivo
// (vedi il punto "revenue_summary + PL" della spec Artifact del 05/10/2026):
// niente più dettaglio per-PL qui dentro, solo il totale aziendale.
function RevenueSummaryPanel({ doc }: { doc: PipelineDoc }) {
  const rs = doc.revenue_summary!;
  const steps: RevenueStep[] = rs.steps;
  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <h2 className="border-b border-gray-200 px-3.5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Previsione fatturato {rs.year}
      </h2>
      <div className="flex flex-wrap items-center gap-1.5 p-3.5">
        {steps.map((s, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="flex min-w-[20px] items-center justify-center text-base font-bold text-gray-400">{s.op === "-" ? "−" : s.op === "=" ? "=" : "+"}</span>}
            <span
              className={`flex min-w-[118px] flex-col justify-center rounded-md px-3 py-2 ${
                s.highlight ? "bg-violet-700 text-white" : s.bold ? "bg-violet-50" : "bg-gray-50"
              }`}
            >
              <span className={`text-[10.5px] uppercase tracking-wide leading-tight ${s.highlight ? "text-violet-100" : "text-gray-500"}`}>{s.label}</span>
              <span className="text-[15px] font-bold tabular-nums">{fmt(s.value)}</span>
            </span>
          </span>
        ))}
      </div>
      {rs.source_note && <p className="-mt-1 px-3.5 pb-3 text-[11.5px] text-gray-500">{rs.source_note}</p>}
    </div>
  );
}

// Verde tenue se il valore è ancora presente nella generazione corrente
// (previsione confermata), rosso tenue se è sparito/cambiato rispetto a
// quanto diceva la generazione di confronto. Nessun colore su una cella
// vuota: non c'è nulla da confermare o smentire.
function confirmBg(v: number | null, confirmed: boolean): string {
  if (!v) return "";
  return confirmed ? "bg-emerald-50" : "bg-red-50";
}

// Tabellina "Mese precedente/Mese attuale": cosa diceva la generazione di
// confronto sui due mesi calendario REALI di oggi (non sul mese in cui quella
// generazione è stata creata) — un controllo rapido su cosa riportavano i
// dati l'ultima volta per i mesi che contano adesso. Affiancata alla tabella
// principale (vedi Artifact di riferimento), non sotto: stessa altezza
// massima e scroll verticale indipendente.
function PrevCurrentPanel({ entries, compareDate }: { entries: PrevCurrentEntry[]; compareDate: string }) {
  const month = new Date().getMonth();
  const curLabel = MESI[month];
  const prevLabel = MESI[month - 1];
  const totPrev = entries.reduce((s, e) => s + (e.prevVal || 0), 0);
  const totCur = entries.reduce((s, e) => s + (e.curVal || 0), 0);
  return (
    <div className="w-[480px] shrink-0 overflow-hidden rounded-lg border border-gray-200 shadow-sm" style={{ maxHeight: "72vh" }}>
      <div className="overflow-auto" style={{ maxHeight: "72vh" }}>
        <table className="w-full border-separate border-spacing-0 whitespace-nowrap text-[12.5px]">
          <thead>
            <tr>
              <th className="sticky top-0 z-10 px-2.5 py-2 text-left font-semibold text-white" style={{ background: HEADER_BG }}>
                Cliente
              </th>
              <th className="sticky top-0 z-10 px-2.5 py-2 text-left font-semibold text-white" style={{ background: HEADER_BG }}>
                Origine
              </th>
              <th
                className="sticky top-0 z-10 px-2.5 py-2 text-right font-semibold text-white"
                style={{ background: HEADER_BG }}
                title={`${prevLabel}, secondo i dati della generazione del ${fmtDateLabel(compareDate)}`}
              >
                Mese prec.
                <br />
                <span className="font-normal normal-case text-[10px] text-gray-300">{prevLabel}</span>
              </th>
              <th
                className="sticky top-0 z-10 px-2.5 py-2 text-right font-semibold text-white"
                style={{ background: HEADER_BG }}
                title={`${curLabel}, secondo i dati della generazione del ${fmtDateLabel(compareDate)}`}
              >
                Mese attuale
                <br />
                <span className="font-normal normal-case text-[10px] text-gray-300">{curLabel}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={`${e.cliente}-${e.origine}-${i}`}>
                <td className="whitespace-normal border-b border-gray-100 px-2.5 py-1.5 font-medium">{e.cliente}</td>
                <td className="border-b border-gray-100 px-2.5 py-1.5 text-gray-500">{e.origine || ""}</td>
                <td
                  className={`border-b border-gray-100 px-2.5 py-1.5 text-right tabular-nums ${confirmBg(e.prevVal, e.prevConfirmed)}`}
                  title={e.prevVal ? (e.prevConfirmed ? "Confermato nella generazione attuale" : "Non più presente nella generazione attuale") : undefined}
                >
                  {fmt(e.prevVal)}
                </td>
                <td
                  className={`border-b border-gray-100 px-2.5 py-1.5 text-right tabular-nums ${confirmBg(e.curVal, e.curConfirmed)}`}
                  title={e.curVal ? (e.curConfirmed ? "Confermato nella generazione attuale" : "Non più presente nella generazione attuale") : undefined}
                >
                  {fmt(e.curVal)}
                </td>
              </tr>
            ))}
            <tr>
              <td className="px-2.5 py-2 font-bold text-white" style={{ background: TOTAL_BG }}>
                TOTALE
              </td>
              <td style={{ background: TOTAL_BG }} />
              <td className="px-2.5 py-2 text-right font-bold tabular-nums text-white" style={{ background: TOTAL_BG }}>
                {fmt(totPrev)}
              </td>
              <td className="px-2.5 py-2 text-right font-bold tabular-nums text-white" style={{ background: TOTAL_BG }}>
                {fmt(totCur)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// I colori mostrati sono quelli registrati nella generazione corrente
// (doc.stato_summary), non una mappa statica: prima che un documento sia
// caricato si mostra la palette di riserva STATE_COLOR come anteprima.
function Legend({ doc }: { doc: PipelineDoc | null }) {
  const entries: [string, string][] = doc?.stato_summary?.length
    ? doc.stato_summary.map((s): [string, string] => [s.stato, normalizeHexColor(s.color)])
    : Object.entries(STATE_COLOR);
  return (
    <div className="mb-3.5 flex flex-wrap gap-2">
      {entries.map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11.5px] text-gray-500">
          <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
          {label}
        </span>
      ))}
      <span className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11.5px] text-gray-500">
        <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CRM_BG }} />
        Opportunità CRM (senza importo)
      </span>
    </div>
  );
}
