import { Figtree } from "next/font/google";
import { requireCapacityAccess } from "../../lib/auth/dal";
import { createAdminClient } from "../../lib/supabase/admin";
import type { CapacityDoc } from "./lib/types";
import CapacityClient from "./components/CapacityClient";

const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

// Modulo in anteprima, visibile solo a chi passa requireCapacityAccess()
// (lista di email in app/lib/auth/dal.ts, anche utenti non superadmin). La
// RLS della tabella ammette solo i superadmin, quindi la lettura usa il
// client service role, e solo dopo il controllo qui sotto. Legge l'ultima
// generazione caricata con scripts/load-odoo-sync.mjs --capacity <data>.
export default async function CapacityDigiduuPage() {
  await requireCapacityAccess();

  const supabase = createAdminClient();
  const { data: rows, error } = await supabase
    .from("capacity_digiduu_generations")
    .select("date, data")
    .order("date", { ascending: false })
    .limit(1);

  const doc = (rows?.[0]?.data as CapacityDoc | undefined) ?? null;

  return (
    <div className={`p-6 ${figtree.className}`}>
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Errore nel leggere i dati: {error.message}
        </div>
      )}
      {!error && !doc && (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Nessuna generazione di Capacity Digiduu ancora disponibile.
        </div>
      )}
      {doc && <CapacityClient doc={doc} />}
    </div>
  );
}
