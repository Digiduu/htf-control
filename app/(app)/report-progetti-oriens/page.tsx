import { requireGlobalVisibility, requireModuleAccess } from "../../lib/auth/dal";
import { createClient } from "../../lib/supabase/server";
import type { OriensReportDoc } from "./lib/types";
import { Kpi, KpiGrid } from "../report-progetti/components/Kpis";
import StrategistSection from "./components/StrategistSection";
import GiornateSection from "./components/GiornateSection";

// Pagina riservata a chi ha visibilità "global" (vede entrambe le aziende) o
// è superadmin: il confine di sicurezza reale è qui (requireGlobalVisibility,
// vedi app/lib/auth/dal.ts) e nella RLS della tabella (vedi la migration),
// non nella Sidebar, che nasconde la voce solo per comodità visiva.
// requireModuleAccess copre anche chi ha visibilità globale ma "Accesso
// moduli" non Oriens (es. solo Digiduu).
//
// Server Component puro, niente "use client": l'espandi/collassa di ogni
// progetto usa <details> nativo e la navigazione per Strategist sono ancore
// #id native, nessuna interattività richiede JavaScript lato client.
export default async function ReportProgettiOriensPage() {
  await requireGlobalVisibility();
  await requireModuleAccess(["oriens"]);

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("report_progetti_oriens_generations")
    .select("date, data")
    .order("date", { ascending: false })
    .limit(1);

  const generatedAt = rows?.[0]?.date as string | undefined;
  const doc = (rows?.[0]?.data as OriensReportDoc | undefined) ?? null;

  return (
    <div className="p-6">
      <div className="mb-1">
        <h1 className="text-xl font-semibold text-gray-900">Report Progetti Oriens</h1>
        <p className="mt-1 text-sm text-gray-500">
          {doc?.sottotitolo}
          {generatedAt ? ` · generazione del ${fmtDate(generatedAt)}` : ""}
        </p>
        {doc?.perimetro && <p className="mt-0.5 text-xs text-gray-400">{doc.perimetro}</p>}
      </div>

      {error && (
        <div className="mb-4 mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Errore nel leggere i dati: {error.message}
        </div>
      )}

      {!error && !doc && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Nessuna generazione ancora disponibile.
        </div>
      )}

      {doc && (
        <>
          <KpiGrid>
            <Kpi label="Progetti attivi" value={String(doc.kpi.progettiAttivi)} sub="perimetro Oriens" />
            <Kpi label="Fatturato (actual)" value={doc.kpi.fatturatoActual} sub="consuntivo" good />
            <Kpi label="Costo (actual)" value={doc.kpi.costoActual} sub="consuntivo" />
            <Kpi
              label="Margine (actual)"
              value={`${doc.kpi.margineActual} (${doc.kpi.margineActualPct})`}
              sub="consuntivo"
              accent
            />
            <Kpi
              label="Anomalie rilevate"
              value={String(doc.kpi.anomalieRilevate)}
              sub="su tutti i progetti"
              critical={doc.kpi.anomalieRilevate > 0}
            />
            <Kpi label="Progetti a fatturato/costo zero" value={String(doc.kpi.progettiZero)} sub="fase iniziale o inattivi" />
          </KpiGrid>

          <nav className="mb-6 flex flex-wrap gap-2">
            {doc.strategists.map((s) => (
              <a
                key={s.slug}
                href={`#${s.slug}`}
                className="rounded-full bg-orange-50 px-3 py-1.5 text-sm font-semibold text-orange-700 hover:bg-orange-100"
              >
                {s.nome} <span className="text-orange-400">{s.navCount}</span>
              </a>
            ))}
            <a
              href="#analisi-giornate"
              className="rounded-full bg-amber-400 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-500"
            >
              Analisi giornate: ordinato vs registrato vs fatturato
            </a>
          </nav>

          {doc.strategists.map((s) => (
            <StrategistSection key={s.slug} strategist={s} />
          ))}

          <GiornateSection intro={doc.giornateIntro} blocks={doc.giornate} />

          <footer className="mt-10 border-t border-gray-200 pt-4 text-xs text-gray-500">
            {doc.footerNotes.map((n, i) => (
              <p key={i} className="mb-1">
                {n}
              </p>
            ))}
          </footer>
        </>
      )}
    </div>
  );
}

function fmtDate(iso: string) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}
