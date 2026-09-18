"use server";

import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "../../lib/auth/dal";
import { createAdminClient } from "../../lib/supabase/admin";
import type { Company, PipelineDoc } from "./lib/types";

export type SaveSnapshotResult = { error: string } | { success: true; date: string; overwritten: boolean };

// Crea (o sovrascrive) una generazione storica datata "oggi" per l'azienda
// indicata, ricopiando i dati dell'ultima generazione disponibile — non
// esiste un collegamento live a Odoo da qui, quindi "fotografare la
// situazione di oggi" significa duplicare l'ultimo dato noto sotto la data
// odierna, con generated_at aggiornato al momento reale dello snapshot.
// Riverifica requireSuperadmin() in modo indipendente dal pulsante che la
// invoca (vedi lo stesso pattern in amministrazione/actions.ts).
export async function saveSnapshot(company: Company): Promise<SaveSnapshotResult> {
  await requireSuperadmin();

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

  const { error: upsertError } = await admin
    .from("pipeline_generations")
    .upsert({ company, date: today, data: snapshotDoc }, { onConflict: "company,date" });

  if (upsertError) {
    return { error: upsertError.message };
  }

  revalidatePath("/pipeline-commerciale");
  return { success: true, date: today, overwritten: !!existingToday };
}
