// Documento salvato in capacity_digiduu_generations.data, prodotto da
// scripts/build-capacity-fixture.mjs (regole di calcolo descritte lì).

// [persona, mese YYYY-MM, nome progetto Odoo, "p" pubblicate | "s" bozza,
//  giornate, chiave "DD10340 · AMG", titolo]
export type CapacityItem = [string, string, string, "p" | "s", number, string, string];

export interface CapacityPerson {
  name: string;
  // Obiettivo mensile gg da Odoo (x_studio_obiettivo_giornate), null se non compilato
  ggsett: number | null;
  roles: string[];
  // Obiettivo del mese al netto delle ferie, null se l'obiettivo non è compilato
  avail: (number | null)[];
  ferie: number[];
  // Risorsa generica di Planning ("Risorsa Sviluppo", "Da assegnare - …")
  generic?: boolean;
}

export interface CapacityBudget {
  // Giornate ordinate (null = nessun progetto sopra la soglia di 16h)
  ord: number | null;
  reg: number;
  client: string | null;
  title: string;
}

export interface CapacityDoc {
  months: string[];
  wd: number[];
  people: CapacityPerson[];
  items: CapacityItem[];
  titles: Record<string, string>;
  budget: Record<string, CapacityBudget>;
  ends: Record<string, string>;
  asof: string;
}
