// Note metodologiche per Portfolio Progetti Digiduu (prompt di handoff §8).
// A differenza di Report Progetti Digiduu, qui la sicurezza è imposta da RLS
// reali sul database (non solo da un redirect lato client) — vedi nota
// dedicata più sotto.
const SHARED_METHOD_NOTES: string[] = [
  'Project Leader (regola di raggruppamento): per ogni progetto Odoo si usa in via primaria il campo "Project leader (contact)" (partner_project_leader_id); se questo è vuoto, si usa in fallback il campo Studio "Project Leader" (x_studio_project_leader).',
  "Perimetro aziendale: il modulo è limitato ai progetti con company_id = Digiduu S.r.l. (esclusi Oriens Consulting, Mas Plus, WSO Advisor), escludendo i progetti in fase \"Non aggiornare\".",
  'Tutte le metriche mostrate (giornate, ricavi) provengono esclusivamente dai campi della tab "PL & Cash flow" del progetto. Costi e margini non sono considerati in questo modulo.',
  "Raggruppamento per Progetto Padre: quando più conti analitici condividono lo stesso valore nel campo \"Progetto Padre\" del conto analitico, i progetti Odoo collegati sono uniti in un'unica riga (un gruppo).",
  "Correzione anti-duplicazione sul venduto: quando due conti dello stesso gruppo condividono lo stesso ordine di vendita, Ricavi baseline e Giornate ordinate vengono contati una sola volta. Vale solo per Ricavi baseline/Giornate ordinate.",
  "Giornate forecast = Giornate spese (Actual) + Giornate pianificate (Bozze).",
  "Soglia ricavo medio: un ricavo medio giornaliero sotto 700 €/gg è evidenziato in rosso.",
  "Barra giornate spese/ordinate: verde fino al 100%, arancio fino al 120%, rosso oltre.",
  "Sicurezza: a differenza del modulo \"Report Progetti Digiduu\", qui la visibilità per Project Leader è imposta da policy di sicurezza reali sul database (RLS), non solo da un controllo nell'interfaccia — un Project Leader non può vedere i dati di un altro nemmeno interrogando direttamente le API.",
];

// Limiti noti di questa versione: vanno comunicati, non nascosti. I dati
// numerici (giornate, ricavi, raggruppamento, storico mensile, milestone,
// fasi di lavoro, fatture, pianificazione) sono stati risincronizzati dal
// vivo da Odoo il 06/10/2026 tramite sessione Claude + MCP.
const KNOWN_LIMITS: string[] = [
  'Documenti SAL/Certificato: la ricerca su SharePoint NON è stata rifatta in questo aggiornamento (richiederebbe centinaia di ricerche manuali una per cliente) — i documenti mostrati sono ripresi così come trovati nella generazione del 04/09/2026. Per i progetti nuovi dopo quella data non è ancora disponibile nessun documento.',
  "Nessuna sincronizzazione automatica (notturna) da Odoo/Microsoft Graph: l'aggiornamento di oggi è stato fatto manualmente in sessione; un futuro aggiornamento richiederà di ripetere lo stesso procedimento finché non verrà costruita un'automazione.",
];

export default function MethodNotes({ plName, plNotes }: { plName?: string; plNotes?: string[] }) {
  return (
    <footer className="mt-8 border-t border-gray-200 pt-5 text-sm text-gray-600">
      {plName && plNotes && plNotes.length > 0 && (
        <>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">Note specifiche — {plName}</h3>
          <ul className="mb-5 list-disc space-y-1.5 pl-5 text-xs text-gray-600">
            {plNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </>
      )}
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Note metodologiche</h3>
      <ul className="mb-5 list-disc space-y-1.5 pl-5 text-xs text-gray-600">
        {SHARED_METHOD_NOTES.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
      <h3 className="mb-2 text-sm font-semibold text-amber-700">Limiti noti di questa versione</h3>
      <ul className="list-disc space-y-1.5 pl-5 text-xs text-amber-700">
        {KNOWN_LIMITS.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </footer>
  );
}
