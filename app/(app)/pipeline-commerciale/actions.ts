"use server";

import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "../../lib/auth/dal";
import { createAdminClient } from "../../lib/supabase/admin";
import type { Company, PipelineDoc } from "./lib/types";

export type SaveSnapshotResult = { error: string } | { success: true; date: string; overwritten: boolean; label: string | null };

// Funzione riservata a un singolo utente (non a "tutti i superadmin"): per
// ora solo chi la usa davvero per congelare uno snapshot etichettato a mano,
// non un workflow pensato per l'intero team. Stesso indirizzo controllato
// lato pagina per nascondere il pulsante a chiunque altro.
const SNAPSHOT_LABEL_USER_EMAIL = "c.rossetto@oriens.consulting";

// Crea (o sovrascrive) una generazione storica datata "oggi" per l'azienda
// indicata, ricopiando i dati dell'ultima generazione disponibile — non
// esiste un collegamento live a Odoo da qui, quindi "fotografare la
// situazione di oggi" significa duplicare l'ultimo dato noto sotto la data
// odierna, con generated_at aggiornato al momento reale dello snapshot.
// Riverifica requireSuperadmin() in modo indipendente dal pulsante che la
// invoca (vedi lo stesso pattern in amministrazione/actions.ts).
export async function saveSnapshot(company: Company, label: string): Promise<SaveSnapshotResult> {
  const profile = await requireSuperadmin();
  if (profile.email !== SNAPSHOT_LABEL_USER_EMAIL) {
    return { error: "Funzione non disponibile per questo utente." };
  }

  const admin = createAdminClient();

  const { data: latestRows, error: latestError } = await admin
    .from("pipeline_generations")
    .select("date, data")
    .eq("company", company)
    .order("date", { ascending: false })
    .limit(1);

  if (latestError) {
    return { error: latestError.message };
  }
  if (!latestRows || latestRows.length === 0) {
    return { error: "Nessuna generazione esistente da cui copiare i dati per questa azienda." };
  }

  const today = new Date().toISOString().slice(0, 10);
  const sourceDoc = latestRows[0].data as PipelineDoc;
  const snapshotDoc: PipelineDoc = { ...sourceDoc, generated_at: new Date().toISOString() };

  const { data: existingToday } = await admin
    .from("pipeline_generations")
    .select("date")
    .eq("company", company)
    .eq("date", today)
    .maybeSingle();

  const trimmedLabel = label.trim() || null;

  const { error: upsertError } = await admin
    .from("pipeline_generations")
    .upsert({ company, date: today, data: snapshotDoc, snapshot_label: trimmedLabel }, { onConflict: "company,date" });

  if (upsertError) {
    return { error: upsertError.message };
  }

  revalidatePath("/pipeline-commerciale");
  return { success: true, date: today, overwritten: !!existingToday, label: trimmedLabel };
}
