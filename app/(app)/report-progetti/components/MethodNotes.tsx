// Porting di SHARED_METHOD_NOTES dall'Artifact di riferimento — valide per
// tutte le pagine del Report Progetti (vedi BUSINESS-LOGIC.md).
const SHARED_METHOD_NOTES: string[] = [
  'Project Leader (regola di raggruppamento): per ogni progetto Odoo si usa in via primaria il campo "Project leader (contact)" (partner_project_leader_id); se questo è vuoto, si usa in fallback il campo Studio "Project Leader" (x_studio_project_leader). Sui 178 progetti Digiduu attivi/archiviati verificati, il fallback non è mai stato necessario. 72 progetti Digiduu risultano senza alcun PL assegnato in nessuno dei due campi — non compaiono in nessuna pagina di questo report.',
  "Perimetro aziendale: il report è limitato ai progetti con company_id = Digiduu S.r.l. (esclusi Oriens Consulting, Mas Plus, WSO Advisor).",
  'Tutte le metriche mostrate (giornate, ricavi) provengono esclusivamente dai campi della tab "PL & Cash flow" del progetto — proposta, consuntivo, bozza, forecast. Costi e margini non sono considerati in questa versione del report.',
  'Raggruppamento per Progetto Padre: quando più conti analitici condividono lo stesso valore nel campo "Progetto Padre" del conto analitico, i progetti Odoo collegati sono uniti in un\'unica riga.',
  'Correzione anti-duplicazione sul venduto: quando due conti dello stesso gruppo condividono lo stesso ordine di vendita, Ricavi baseline e Giornate ordinate vengono contati una sola volta invece di essere sommati due volte (il conto escluso è indicato nel dettaglio riga). Vale solo per Ricavi baseline/Giornate ordinate — Actual, Bozze e Forecast sono sommati regolarmente su tutti i conti del gruppo.',
  "Giornate forecast = Giornate spese (Actual) + Giornate pianificate (Bozze), coerentemente in tutta la pagina.",
  'Fatture: la tabella "Fatture" elenca le fatture (account.move: emesse e in bozza) collegate all\'ordine/i di vendita di ciascuna riga. Lo stato "In pagamento" è considerato equivalente a "Pagata" sia nel totale "Pagate" sia ai fini delle scadute. Le righe evidenziate sono fatture emesse con scadenza già passata e non ancora pagate/in pagamento/stornate. I totali delle fatture emesse possono differire di poco dai Ricavi Actual quando l\'ordine è stato rivisto o esistono fatture collegate al conto ma non all\'ordine originale — non è un bug.',
  "Pianificazione residua: mostra i turni futuri registrati nel modulo Planning, per risorsa e per mese. Le ore allocate vengono sommate e divise per 8 per ottenere le giornate; più turni nello stesso giorno sulla stessa risorsa sono normali e vengono sommati regolarmente, senza deduplicare.",
  "Etichette progetto: unione delle etichette (project.tags) di tutti i conti/progetti Odoo uniti nel gruppo.",
  "Milestone: elenca le milestone (project.milestone) di tutti i conti del gruppo, con scadenza, stato e data di raggiungimento effettivo.",
  "Lavori per fase: conta i lavori (project.task) di tutti i conti del gruppo per fase Kanban. Le fasi hanno nomi propri per ogni progetto e non sono state unificate in un'unica tassonomia.",
  'SAL / Stato avanzamento lavori (Teams/SharePoint): ricerca puntuale, full-text, di documenti di SAL/avanzamento per cliente/codice progetto. "Nessun documento trovato" significa che la ricerca non ha individuato nulla con i termini usati, non che il documento non esista in altra forma/nome.',
  'Certificato (Teams/SharePoint): stessa ricerca puntuale, ma per documenti il cui nome file contiene "certificato". File con "certificato" nel nome ma di tipo diverso da un certificato di completamento progetto (es. INAIL/DURC, vigenza CCIAA, certificazioni di prodotto, certificati SSL) NON sono conteggiati come documento presente — vengono invece disclosurati in una nota specifica del Project Leader, per trasparenza sul dato grezzo trovato.',
  "Alert: ogni riga progetto viene segnalata con un alert quando si verifica almeno una di queste condizioni: (1) Giornate sforate — le giornate spese superano le giornate ordinate; (2) SAL assente; (3) Certificato assente. Per i clienti con più progetti/gruppi, l'esito SAL/Certificato è lo stesso su tutti i gruppi dello stesso cliente, salvo diversa indicazione.",
];

export default function MethodNotes({ plName, plNotes, riepilogo }: { plName?: string; plNotes?: string[]; riepilogo?: boolean }) {
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
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Note metodologiche{riepilogo ? "" : " (valide per tutte le pagine)"}</h3>
      <ul className="list-disc space-y-1.5 pl-5 text-xs text-gray-600">
        {SHARED_METHOD_NOTES.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
        {riepilogo && (
          <li>
            Riepilogo: i totali di questa pagina considerano solo i progetti padre attivi di ciascun Project Leader
            (stessa definizione della scheda &quot;Attivi&quot; nelle pagine di dettaglio). &quot;Fatturato emesso&quot;
            è la somma delle fatture in stato &quot;posted&quot; (emesse), incluse quelle non ancora incassate.
          </li>
        )}
      </ul>
    </footer>
  );
}
