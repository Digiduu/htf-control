// Documento salvato in report_assistenza_generations.data, prodotto da
// scripts/build-assistenza-fixture.mjs (regole di calcolo descritte lì).

export interface AssistenzaMonth {
  // Imponibile fatture cliente del mese (confermate + bozze), note di credito sottratte
  fatturato: number;
  // Di cui in bozza
  fatturato_bozza: number;
  // Ore del foglio ore sul progetto
  ore: number;
  // Di cui senza riga d'ordine di vendita
  ore_senza_ordine: number;
}

export interface AssistenzaProject {
  id: number;
  codice: string | null;
  nome: string;
  cliente: string | null;
  // "Project leader (contact)" del progetto: il PL del contatto cliente
  project_leader: string | null;
  responsabile: string | null;
  ordine: string | null;
  // "Ore previste" in testata del progetto (allocated_hours)
  ore_previste: number;
  date_start: string | null;
  date_end: string | null;
  // Chiave "YYYY-MM"
  months: Record<string, AssistenzaMonth>;
}

export interface AssistenzaDoc {
  data_as_of: string;
  generated_at: string;
  source_note: string;
  projects: AssistenzaProject[];
}
