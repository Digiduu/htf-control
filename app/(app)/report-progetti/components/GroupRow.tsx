"use client";

import { useState } from "react";
import type { Doc, Group, Invoice, Milestone } from "../lib/types";
import {
  daysBarInfo,
  fmtDate,
  fmtDays,
  fmtEUR,
  fmtEUR2,
  fmtMonth,
  getAlerts,
  PAYMENT_STATE_LABELS,
} from "../lib/report-progetti-logic";

export default function GroupRow({ group }: { group: Group }) {
  const [open, setOpen] = useState(false);
  const bar = daysBarInfo(group);
  const alerts = getAlerts(group);
  const barColor =
    bar.className === "good" ? "bg-emerald-600" : bar.className === "warning" ? "bg-amber-500" : bar.className === "critical" ? "bg-red-600" : "bg-gray-300";

  return (
    <>
      <tr className="cursor-pointer border-t border-gray-100 hover:bg-gray-50" onClick={() => setOpen((v) => !v)}>
        <td className="w-6 px-3.5 py-3 align-top">
          <button
            type="button"
            aria-expanded={open}
            aria-label="Espandi dettaglio"
            className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-300 text-xs text-gray-500 hover:border-violet-400 hover:text-violet-700"
          >
            {open ? "−" : "+"}
          </button>
        </td>
        <td className="px-3.5 py-3 align-top">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-gray-900">{group.name}</span>
            {group.member_count > 1 && (
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                {group.member_count} conti uniti
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-gray-500">{group.partner}</div>
          {group.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {group.tags.map((t) => (
                <span key={t} className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                  {t}
                </span>
              ))}
            </div>
          )}
          {alerts.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {alerts.map((a) => (
                <span
                  key={a.key}
                  title={a.detail}
                  className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                    a.key === "sforamento" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                  }`}
                >
                  ⚠ {a.label}
                </span>
              ))}
            </div>
          )}
        </td>
        <td className="px-3.5 py-3 align-top">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${group.stage === "Completato" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>
            {group.stage}
          </span>
          {!group.active && (
            <span className="ml-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">Archiviato</span>
          )}
        </td>
        <td className="min-w-[150px] px-3.5 py-3 align-top">
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${bar.widthPct}%` }} />
          </div>
          <div className="mt-1 font-mono text-[11px] text-gray-500">
            {fmtDays(group.act_days)} / {group.prop_days ? fmtDays(group.prop_days) : "—"} gg
            {bar.ratio != null ? ` (${Math.round(bar.ratio * 100)}%)` : ""}
          </div>
        </td>
        <td className="px-3.5 py-3 text-right align-top font-mono tabular-nums text-gray-700">{fmtEUR(group.prop_price)}</td>
        <td className="px-3.5 py-3 text-right align-top font-mono tabular-nums text-gray-700">{fmtEUR(group.act_rev)}</td>
      </tr>
      {open && (
        <tr className="border-t border-gray-100 bg-gray-50">
          <td colSpan={6} className="px-4 py-4">
            <GroupDetail group={group} />
          </td>
        </tr>
      )}
    </>
  );
}

// Esportata (oltre a essere usata internamente da GroupRow sopra) perché
// Portfolio Progetti Digiduu la riusa identica per la propria pagina di
// dettaglio progetto, invece di duplicare ~300 righe di JSX quasi identico —
// modifica puramente additiva, nessun cambiamento di comportamento qui.
export function GroupDetail({ group: g }: { group: Group }) {
  const forecastDays = g.act_days + g.plan_days;
  const baselineAvg = g.prop_days ? fmtEUR2(g.prop_price / g.prop_days) : "—";
  const actAvg = g.act_days ? fmtEUR2(g.act_rev / g.act_days) : "—";
  const fcAvg = forecastDays ? fmtEUR2(g.fc_rev / forecastDays) : "—";
  const sforamento = getAlerts(g).find((a) => a.key === "sforamento");
  const zeroRevFlag = g.act_rev === 0 && g.act_days > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <CashflowCard
          title="Come è stato venduto"
          rows={[
            ["Ricavi baseline", fmtEUR(g.prop_price)],
            ["Giornate ordinate", `${fmtDays(g.prop_days)} gg`],
            ["Ricavo medio/gg baseline", baselineAvg],
          ]}
        />
        <CashflowCard
          title="Come sta andando (Actual)"
          rows={[
            ["Ricavi actual", fmtEUR(g.act_rev)],
            ["Giornate spese", `${fmtDays(g.act_days)} gg`],
            ["Ricavo medio/gg actual", actAvg],
          ]}
        />
        <CashflowCard
          title="Cosa manca (Bozze)"
          rows={[
            ["Ricavi in bozza", fmtEUR(g.draft_rev)],
            ["Giornate pianificate", `${fmtDays(g.plan_days)} gg`],
          ]}
        />
        <CashflowCard
          title="Come finirà (Forecast)"
          rows={[
            ["Ricavi forecast", fmtEUR(g.fc_rev)],
            ["Giornate forecast", `${fmtDays(forecastDays)} gg`],
            ["Ricavo medio/gg forecast", fcAvg],
          ]}
        />
      </div>

      {sforamento && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700">⚠ {sforamento.detail}</div>
      )}
      {zeroRevFlag && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          ⚠ Giornate registrate ma nessun ricavo actual ancora confermato
        </div>
      )}
      {g.baseline_excluded.length > 0 && (
        <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
          Ricavi baseline/giornate ordinate contati una sola volta — {g.baseline_excluded.join(", ")} condivide lo
          stesso ordine di vendita di un altro conto del gruppo
        </div>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-1.5 border-t border-dashed border-gray-300 pt-3 text-xs text-gray-500">
        <span>
          <b className="text-gray-700">Cliente:</b> {g.partner}
        </span>
        <span>
          <b className="text-gray-700">Periodo progetto:</b> {fmtDate(g.date_start)} – {fmtDate(g.date_end)}
        </span>
        {g.chiusura && (
          <span>
            <b className="text-gray-700">Data chiusura:</b> {fmtDate(g.chiusura)}
          </span>
        )}
        <span>
          <b className="text-gray-700">{g.sale_orders.length > 1 ? "Ordini di vendita" : "Ordine di vendita"}:</b>{" "}
          {g.sale_orders.length
            ? g.sale_orders.map((o) => `${o.name} (${fmtDate(o.date_start)} – ${fmtDate(o.date_end)})`).join(" · ")
            : "nessuno collegato"}
        </span>
        {g.member_count > 1 && (
          <span>
            <b className="text-gray-700">Conti analitici raggruppati ({g.member_count}):</b> {g.members.join(" · ")}
          </span>
        )}
      </div>

      <InvoiceTable group={g} />
      <PlanningTable group={g} />
      <MilestonesTable milestones={g.milestones} />
      <TaskStagesSummary group={g} />
      <DocSection title="SAL / Stato avanzamento lavori (Teams/SharePoint)" docs={g.sal_docs} emptyIcon="📄" />
      <DocSection title="Certificato (Teams/SharePoint)" docs={g.cert_docs} emptyIcon="📜" />
    </div>
  );
}

function CashflowCard({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <h4 className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">{title}</h4>
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between py-0.5 text-xs text-gray-600">
          <span>{label}</span>
          <b className="font-mono tabular-nums text-gray-900">{value}</b>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ title, totals }: { title: string; totals?: string }) {
  return (
    <h4 className="mb-2 flex flex-wrap items-center gap-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
      {title}
      {totals && <span className="font-mono text-[11px] font-medium normal-case tracking-normal text-gray-600">{totals}</span>}
    </h4>
  );
}

function InvoiceTable({ group: g }: { group: Group }) {
  const rows: Invoice[] = g.invoices || [];
  let totalsTxt = `Emesse ${fmtEUR(g.invoiced_total)} · Pagate ${fmtEUR(g.paid_total)} · In bozza ${fmtEUR(g.draft_total)}`;
  if (g.overdue_total > 0) totalsTxt += ` · Scadute ${fmtEUR(g.overdue_total)}`;

  return (
    <div className="border-t border-dashed border-gray-300 pt-3">
      <SectionHeader title="Fatture" totals={totalsTxt} />
      {!rows.length ? (
        <p className="text-xs italic text-gray-500">Nessuna fattura collegata all&apos;ordine di vendita.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-xs">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide text-gray-500">
                <th className="border-b border-gray-200 px-2 py-1.5">Data</th>
                <th className="border-b border-gray-200 px-2 py-1.5">Numero</th>
                <th className="border-b border-gray-200 px-2 py-1.5">Scadenza</th>
                <th className="border-b border-gray-200 px-2 py-1.5">Stato</th>
                <th className="border-b border-gray-200 px-2 py-1.5">Pagamento</th>
                <th className="border-b border-gray-200 px-2 py-1.5 text-right">Imponibile</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.is_overdue ? "bg-red-50" : ""}>
                  <td className="border-b border-gray-100 px-2 py-1.5 text-gray-600">{fmtDate(r.date)}</td>
                  <td className="border-b border-gray-100 px-2 py-1.5 text-gray-600">
                    {r.number || "—"}
                    {r.is_credit_note && <span className="ml-1 text-red-600">(nota di credito)</span>}
                  </td>
                  <td className="border-b border-gray-100 px-2 py-1.5 text-gray-600">
                    {r.due_date ? fmtDate(r.due_date) : "—"}
                    {r.is_overdue && (
                      <span className="ml-1 rounded-full border border-red-300 bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                        Scaduta
                      </span>
                    )}
                  </td>
                  <td className="border-b border-gray-100 px-2 py-1.5">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        r.state === "posted" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {r.state === "posted" ? "Emessa" : "Bozza"}
                    </span>
                  </td>
                  <td className="border-b border-gray-100 px-2 py-1.5">
                    {r.state === "posted" ? (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                          r.payment_state === "paid" || r.payment_state === "in_payment"
                            ? "bg-emerald-50 text-emerald-700"
                            : r.payment_state === "reversed" || r.payment_state === "blocked"
                              ? "bg-red-50 text-red-700"
                              : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {PAYMENT_STATE_LABELS[r.payment_state] ?? "—"}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="border-b border-gray-100 px-2 py-1.5 text-right font-mono tabular-nums text-gray-700">
                    {fmtEUR2(r.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PlanningTable({ group: g }: { group: Group }) {
  const plan = g.planning_future;
  return (
    <div className="border-t border-dashed border-gray-300 pt-3">
      <SectionHeader title="Pianificazione residua (Planning)" totals={plan?.months?.length ? `${fmtDays(plan.total_days)} gg residue · ${plan.slot_count} turni` : undefined} />
      {!plan || !plan.months.length ? (
        <p className="text-xs italic text-gray-500">Nessun turno futuro pianificato nel modulo Planning.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-xs">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide text-gray-500">
                <th className="border-b border-gray-200 px-2 py-1.5">Risorsa</th>
                {plan.months.map((m) => (
                  <th key={m} className="border-b border-gray-200 px-2 py-1.5 text-right">
                    {fmtMonth(m)}
                  </th>
                ))}
                <th className="border-b border-gray-200 px-2 py-1.5 text-right">Totale</th>
              </tr>
            </thead>
            <tbody>
              {plan.by_resource.map((r) => (
                <tr key={r.resource}>
                  <td className="border-b border-gray-100 px-2 py-1.5 text-gray-700">
                    {r.resource}
                    <div className="text-[10.5px] text-gray-400">{r.role}</div>
                  </td>
                  {plan.months.map((m) => (
                    <td key={m} className="border-b border-gray-100 px-2 py-1.5 text-right font-mono tabular-nums text-gray-600">
                      {r.days[m] ? fmtDays(r.days[m]) : "—"}
                    </td>
                  ))}
                  <td className="border-b border-gray-100 px-2 py-1.5 text-right font-mono font-semibold tabular-nums text-gray-900">
                    {fmtDays(r.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MilestonesTable({ milestones }: { milestones: Milestone[] }) {
  const rows = milestones || [];
  const reached = rows.filter((m) => m.is_reached).length;
  const showSource = rows.some((m) => m.source);
  return (
    <div className="border-t border-dashed border-gray-300 pt-3">
      <SectionHeader title="Milestone" totals={rows.length ? `${reached}/${rows.length} raggiunte` : undefined} />
      {!rows.length ? (
        <p className="text-xs italic text-gray-500">Nessuna milestone definita per questo progetto.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-xs">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide text-gray-500">
                <th className="border-b border-gray-200 px-2 py-1.5">Milestone</th>
                {showSource && <th className="border-b border-gray-200 px-2 py-1.5">Conto</th>}
                <th className="border-b border-gray-200 px-2 py-1.5">Scadenza</th>
                <th className="border-b border-gray-200 px-2 py-1.5">Stato</th>
                <th className="border-b border-gray-200 px-2 py-1.5">Raggiunta il</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m, i) => (
                <tr key={i}>
                  <td className="border-b border-gray-100 px-2 py-1.5 text-gray-700">{m.name}</td>
                  {showSource && <td className="border-b border-gray-100 px-2 py-1.5 text-gray-500">{m.source || "—"}</td>}
                  <td className="border-b border-gray-100 px-2 py-1.5 text-gray-600">{fmtDate(m.deadline)}</td>
                  <td className="border-b border-gray-100 px-2 py-1.5">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        m.is_reached ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {m.is_reached ? "Raggiunta" : "Da raggiungere"}
                    </span>
                  </td>
                  <td className="border-b border-gray-100 px-2 py-1.5 text-gray-600">{fmtDate(m.reached_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TaskStagesSummary({ group: g }: { group: Group }) {
  const stages = g.task_stages || [];
  return (
    <div className="border-t border-dashed border-gray-300 pt-3">
      <SectionHeader title="Lavori per fase" totals={stages.length ? `${g.task_total} lavori totali` : undefined} />
      {!stages.length ? (
        <p className="text-xs italic text-gray-500">Nessun lavoro registrato per questo progetto.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {stages.map((s) => (
            <div key={s.stage} className="flex items-baseline gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5">
              <span className="font-mono text-sm font-bold tabular-nums text-gray-900">{s.count}</span>
              <span className="text-[11px] text-gray-500">{s.stage}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DocSection({ title, docs, emptyIcon }: { title: string; docs: Doc[]; emptyIcon: string }) {
  return (
    <div className="border-t border-dashed border-gray-300 pt-3">
      <SectionHeader title={title} totals={docs.length ? `${docs.length} document${docs.length > 1 ? "i" : "o"}` : undefined} />
      {!docs.length ? (
        <div className="flex items-center gap-1.5 rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {emptyIcon} Nessun documento trovato nei Team/SharePoint collegati per questo cliente
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {docs.map((d, i) => (
            <div key={i} className="py-1.5">
              <div className="text-xs font-semibold text-gray-900">{d.name}</div>
              <div className="text-[11px] text-gray-500">
                {d.location}
                {d.date ? ` · ${fmtDate(d.date)}` : ""}
              </div>
              {d.note && <div className="mt-1 inline-block rounded-md bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">⚠ {d.note}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
