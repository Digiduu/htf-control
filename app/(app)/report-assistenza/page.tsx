import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { requireReportAssistenzaAccess } from "../../lib/auth/dal";
import { createAdminClient } from "../../lib/supabase/admin";
import type { AssistenzaDoc } from "./lib/types";
import ReportAssistenzaClient from "./components/ReportAssistenzaClient";

// Solo in sviluppo locale: se la tabella su Supabase non esiste ancora (la
// migration va incollata a mano in Supabase Studio) si legge l'ultimo fixture
// in fixtures/report-assistenza/, per poter provare la pagina prima.
function latestLocalFixture(): AssistenzaDoc | null {
  try {
    const dir = join(process.cwd(), "fixtures", "report-assistenza");
    const file = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().pop();
    return file ? (JSON.parse(readFileSync(join(dir, file), "utf-8")) as AssistenzaDoc) : null;
  } catch {
    return null;
  }
}

// Pagina riservata a chi passa requireReportAssistenzaAccess() (lista di
// email in app/lib/auth/dal.ts). La RLS della tabella ammette solo i
// superadmin, quindi la lettura usa il client service role, e solo dopo il
// controllo qui sotto. Legge l'ultima generazione caricata con
// scripts/load-odoo-sync.mjs --assistenza <data>.
export default async function ReportAssistenzaPage() {
  await requireReportAssistenzaAccess();

  const supabase = createAdminClient();
  const { data: rows, error } = await supabase
    .from("report_assistenza_generations")
    .select("date, data")
    .order("date", { ascending: false })
    .limit(1);

  let doc = (rows?.[0]?.data as AssistenzaDoc | undefined) ?? null;
  let localFallback = false;
  if (!doc && process.env.NODE_ENV === "development") {
    doc = latestLocalFixture();
    localFallback = !!doc;
  }

  return (
    <div className="p-6">
      {localFallback && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Anteprima locale: dati letti dal file in fixtures/report-assistenza/, non ancora da Supabase.
        </div>
      )}
      {error && !localFallback && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Errore nel leggere i dati: {error.message}
        </div>
      )}
      {!error && !doc && (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Nessuna generazione del Report Assistenza ancora disponibile.
        </div>
      )}
      {doc && <ReportAssistenzaClient doc={doc} />}
    </div>
  );
}
