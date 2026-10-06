import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModuleAccess } from "../../../../lib/auth/dal";
import { createClient } from "../../../../lib/supabase/server";
import { fetchVisibleGroups, fetchAnalysisNote } from "../../lib/data";
import {
  buildMonthlyCalendarForGroup,
  daysBarInfo,
  fmtDays,
  fmtEUR,
  fmtMonth,
  getAlerts,
  getDataChecks,
  isBeforeNormalWindow,
  odooProjectUrl,
} from "../../lib/logic";
import { GroupDetail } from "../../../report-progetti/components/GroupRow";
import MonthCell from "../../components/MonthCell";

// Dettaglio progetto (prompt di handoff §6.4). Se la query non trova nulla,
// per un Project Leader non autorizzato è perché la RLS di ppd_project_groups
// (vedi ppd_can_see_group) ha già escluso la riga: notFound() è corretto sia
// per "non esiste" sia per "non puoi vederlo", senza rivelare la differenza.
export default async function PortfolioProgettiDigiduuGroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const id = Number(groupId);
  if (!Number.isInteger(id)) notFound();

  await requireModuleAccess(["digiduu"]);

  const supabase = await createClient();
  const [rows, analysisNote] = await Promise.all([fetchVisibleGroups(supabase, id), fetchAnalysisNote(supabase, id)]);
  const entry = rows[0];
  if (!entry) notFound();

  const { group } = entry;
  const todayISO = new Date().toISOString().slice(0, 10);
  const bar = daysBarInfo(group);
  const alerts = getAlerts(group);
  const checks = getDataChecks(group, todayISO);
  const calendar = buildMonthlyCalendarForGroup(group, entry.monthlyDays, todayISO);
  const barColor =
    bar.className === "good" ? "bg-emerald-600" : bar.className === "warning" ? "bg-amber-500" : bar.className === "critical" ? "bg-red-600" : "bg-gray-300";

  return (
    <div className="p-6">
      <Link href="/portfolio-progetti-digiduu" className="mb-2 inline-block text-xs font-medium text-gray-500 hover:text-violet-700">
        ← Il mio portfolio
      </Link>

      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-gray-900">{group.name}</h1>
        <a
          href={odooProjectUrl(group.id)}
          target="_blank"
          rel="noopener noreferrer"
          title="Apri il progetto in Odoo"
          className="text-sm font-medium text-gray-400 hover:text-violet-600"
        >
          ↗ Odoo
        </a>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${group.stage === "Completato" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>
          {group.stage}
        </span>
        {!group.active && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">Archiviato</span>}
        {group.member_count > 1 && (
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">{group.member_count} conti uniti</span>
        )}
      </div>
      <p className="mb-3 text-sm text-gray-500">{entry.plName} · {group.partner}</p>

      <div className="mb-4 max-w-sm">
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${bar.widthPct}%` }} />
        </div>
        <div className="mt-1 font-mono text-xs text-gray-500">
          {fmtDays(group.act_days)} / {group.prop_days ? fmtDays(group.prop_days) : "—"} gg
          {bar.ratio != null ? ` (${Math.round(bar.ratio * 100)}%)` : ""} · {fmtEUR(group.act_rev)} actual
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {alerts.map((a) => (
            <span
              key={a.key}
              title={a.detail}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${a.key === "sforamento" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}
            >
              ⚠ {a.label}
            </span>
          ))}
        </div>
      )}

      {checks.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {checks.map((c) => (
            <span key={c.key} className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
              ⓘ {c.label}
            </span>
          ))}
        </div>
      )}

      {analysisNote && (
        <div className="mb-4 rounded-md border-l-4 border-orange-400 bg-orange-50 px-3.5 py-2.5 text-sm text-orange-900">
          <b>Nota di analisi:</b> {analysisNote}
        </div>
      )}

      <div className="mb-4 overflow-x-auto rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Calendario mensile{calendar.extendedForOlderProject ? " (esteso all'inizio del progetto)" : ""}
        </h4>
        <div className="flex min-w-max">
          {calendar.columns.map((c) => (
            <div key={c.month} className="w-28 shrink-0 border-b border-gray-200 px-1.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">
              <span className={isBeforeNormalWindow(c.month, todayISO) ? "text-amber-700" : c.isCurrent ? "text-violet-700" : ""}>
                {c.isFutureBucket ? `DA ${fmtMonth(c.month).toUpperCase()}` : fmtMonth(c.month).toUpperCase()}
              </span>
              {c.isCurrent && <div className="normal-case text-violet-600">in corso</div>}
            </div>
          ))}
        </div>
        <div className="flex min-w-max">
          {calendar.columns.map((c) => (
            <MonthCell key={c.month} column={c} />
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <GroupDetail group={group} />
      </div>
    </div>
  );
}
