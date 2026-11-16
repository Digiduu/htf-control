import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { requireAllineamentiSalesAccess } from "../../lib/auth/dal";
import { createAdminClient } from "../../lib/supabase/admin";
import { ALLINEAMENTO_SALES_TEMPLATE } from "./sales-template";

// Solo in sviluppo locale: se la tabella su Supabase non esiste ancora (la
// migration va incollata a mano in Supabase Studio) si legge l'ultimo fixture
// in fixtures/allineamento-sales/, per poter provare la pagina prima.
function latestLocalFixture(): { date: string; data: unknown } | null {
  try {
    const dir = join(process.cwd(), "fixtures", "allineamento-sales");
    const file = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().pop();
    return file ? { date: file.slice(0, 10), data: JSON.parse(readFileSync(join(dir, file), "utf-8")) } : null;
  } catch {
    return null;
  }
}

// Il JSON finisce dentro un <script>: "<" va scritto come escape unicode, così una
// stringa che contiene "</script>" non può chiudere il tag in anticipo.
function buildHtml(data: unknown): string {
  const json = JSON.stringify(data).replace(/</g, "\\u003c").replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028").replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");
  return ALLINEAMENTO_SALES_TEMPLATE.replace("__DATA__", () => json);
}

// Pagina riservata a chi passa requireAllineamentiSalesAccess() (superadmin,
// visibilità "global" e commerciali Digiduu). La RLS della tabella ammette
// solo i superadmin, quindi la lettura usa il client service role, e solo
// dopo il controllo qui sotto. Legge l'ultima generazione caricata con
// scripts/load-odoo-sync.mjs --allineamento-sales <data>.
//
// La dashboard è il template HTML autonomo (vanilla JS, nessuna libreria)
// incorporato tale e quale in un iframe isolato: sandbox senza
// allow-same-origin, quindi non può leggere cookie né sessione dell'app.
export default async function AllineamentiSalesPage() {
  await requireAllineamentiSalesAccess();

  const supabase = createAdminClient();
  const { data: rows, error } = await supabase
    .from("allineamento_sales_generations")
    .select("date, data")
    .order("date", { ascending: false })
    .limit(1);

  let doc: unknown = rows?.[0]?.data ?? null;
  let localFallback = false;
  if (!doc && process.env.NODE_ENV === "development") {
    doc = latestLocalFixture()?.data ?? null;
    localFallback = !!doc;
  }

  if (!doc) {
    return (
      <div className="p-6">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Errore nel leggere i dati: {error.message}
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
            Nessuna generazione di Allineamenti Sales ancora disponibile.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-screen flex-col">
      {localFallback && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Anteprima locale: dati letti dal file in fixtures/allineamento-sales/, non ancora da Supabase.
        </div>
      )}
      <iframe
        title="Allineamento sales Digiduu"
        srcDoc={buildHtml(doc)}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        className="block w-full flex-1 border-0"
      />
    </div>
  );
}
