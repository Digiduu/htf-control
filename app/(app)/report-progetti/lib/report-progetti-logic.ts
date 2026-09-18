// Logica di calcolo pura, portata 1:1 da
// reference/report-progetti-digiduu-reference.html (stesso algoritmo
// dell'Artifact claude.ai originale — vedi BUSINESS-LOGIC.md del pacchetto di
// handoff per la spiegazione di ogni regola). Nessuna dipendenza da React:
// testabile direttamente contro i fixture in fixtures/report-progetti/.
import type { Alert, Group, ProjectLeaderReport, RiepSummary } from "./types";

export function fmtEUR(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return Math.round(n).toLocaleString("it-IT") + " €";
}

export function fmtEUR2(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

export function fmtDays(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

export function fmtMonth(m: string): string {
  const [y, mm] = m.split("-");
  return `${MESI[parseInt(mm, 10) - 1]} ${y.slice(2)}`;
}

// Slug usato negli URL /report-progetti/[pl] — stessa funzione dell'Artifact
// di riferimento (normalizza, rimuove diacritici, sostituisce non-alfanumerici).
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Regola "barra giornate": verde se spese/ordinate ≤ 100%, giallo se ≤ 120%,
// rosso oltre (BUSINESS-LOGIC.md §13).
export function daysBarInfo(g: Group): { ratio: number | null; className: "good" | "warning" | "critical" | "neutral"; widthPct: number } {
  const ratio = g.prop_days ? g.act_days / g.prop_days : null;
  let className: "good" | "warning" | "critical" | "neutral" = "neutral";
  if (ratio != null) {
    if (ratio <= 1) className = "good";
    else if (ratio <= 1.2) className = "warning";
    else className = "critical";
  }
  const widthPct = ratio != null ? Math.min(ratio * 100, 100) : 0;
  return { ratio, className, widthPct };
}

// Alert calcolati a runtime, mai persistiti (BUSINESS-LOGIC.md §10 / DATA-SCHEMA.md).
export function getAlerts(g: Group): Alert[] {
  const alerts: Alert[] = [];
  if (g.prop_days > 0 && g.act_days > g.prop_days) {
    const pct = Math.round((g.act_days / g.prop_days) * 100) - 100;
    alerts.push({
      key: "sforamento",
      label: "Giornate sforate",
      detail: `Giornate spese (${fmtDays(g.act_days)}) superano le giornate ordinate (${fmtDays(g.prop_days)}) del ${pct}%`,
    });
  }
  if (!g.sal_docs || g.sal_docs.length === 0) {
    alerts.push({ key: "sal", label: "SAL assente", detail: "Nessun documento di SAL/stato avanzamento lavori trovato per questo cliente" });
  }
  if (!g.cert_docs || g.cert_docs.length === 0) {
    alerts.push({ key: "certificato", label: "Certificato assente", detail: 'Nessun documento "Certificato" trovato per questo cliente' });
  }
  return alerts;
}

export type FilterKey = "tutti" | "attivi" | "in-corso" | "completato" | "archiviato" | "alert";

export interface FilterDef {
  key: FilterKey;
  label: string;
  fn: (g: Group) => boolean;
}

// Filtri disponibili nella pagina di dettaglio PL (BUSINESS-LOGIC.md §12),
// stesso ordine e default ("attivi") dell'Artifact di riferimento.
export const FILTERS: FilterDef[] = [
  { key: "tutti", label: "Tutti", fn: () => true },
  { key: "attivi", label: "Attivi", fn: (g) => g.active },
  { key: "in-corso", label: "In corso", fn: (g) => g.active && g.stage === "In corso" },
  { key: "completato", label: "Completati", fn: (g) => g.active && g.stage === "Completato" },
  { key: "archiviato", label: "Archiviati", fn: (g) => !g.active },
  { key: "alert", label: "Con alert", fn: (g) => getAlerts(g).length > 0 },
];

// Vista Riepilogo (BUSINESS-LOGIC.md §11): solo i progetti padre attivi
// contano nei totali per Project Leader.
export function riepSummary(pl: ProjectLeaderReport): RiepSummary {
  const active = pl.groups.filter((g) => g.active);
  const sum = (key: keyof Group) => active.reduce((a, g) => a + ((g[key] as number) || 0), 0);
  return {
    activeCount: active.length,
    totalCount: pl.groups.length,
    prop_days: sum("prop_days"),
    prop_price: sum("prop_price"),
    act_rev: sum("act_rev"),
    fc_rev: sum("fc_rev"),
    invoiced_total: sum("invoiced_total"),
    alertCount: active.filter((g) => getAlerts(g).length > 0).length,
  };
}

export const PAYMENT_STATE_LABELS: Record<string, string> = {
  paid: "Pagata",
  in_payment: "In pagamento",
  partial: "Parziale",
  not_paid: "Non pagata",
  reversed: "Stornata",
  blocked: "Bloccata",
  invoicing_legacy: "—",
};
