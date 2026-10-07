import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivePhaseProject, Group, ProjectLeaderReport } from "./types";

// Ricompone le righe delle tabelle granulari ppd_* (vedi migration
// 20261008090000_portfolio_progetti_digiduu.sql) nella stessa forma `Group`
// già usata da Report Progetti Digiduu, così tutta la logica/UI esistente si
// riusa senza modifiche. La RLS di ogni tabella filtra già le righe visibili
// all'utente corrente (vedi ppd_can_see_group): qui non serve nessun filtro
// applicativo aggiuntivo per la sicurezza, solo per l'esperienza (es. "mostra
// solo i gruppi di questo PL" quando un utente globale sceglie un PL dal
// selettore).
export interface GroupWithPl {
  group: Group;
  plName: string;
  // Giornate registrate a foglio ore per mese (YYYY-MM -> giornate), somma su
  // tutti i progetti del gruppo. Dato reale sincronizzato da Odoo (non fa
  // parte del tipo Group condiviso con Report Progetti Digiduu, che non lo ha).
  monthlyDays: Record<string, number>;
}

// onlyGroupId: usato dalla pagina di dettaglio per interrogare un solo
// gruppo invece di scaricarli tutti (la RLS si applica comunque in ogni caso:
// qui è solo un'ottimizzazione, non un confine di sicurezza).
export async function fetchVisibleGroups(supabase: SupabaseClient, onlyGroupId?: number): Promise<GroupWithPl[]> {
  const groupsQ = supabase.from("ppd_project_groups").select("*");
  const saleOrdersQ = supabase.from("ppd_sale_orders").select("*");
  const invoicesQ = supabase.from("ppd_invoices").select("*");
  const planningQ = supabase.from("ppd_planning_future").select("*");
  const milestonesQ = supabase.from("ppd_milestones").select("*");
  const taskStagesQ = supabase.from("ppd_task_stages").select("*");
  const documentsQ = supabase.from("ppd_documents").select("*");
  const timesheetQ = supabase.from("ppd_timesheet_monthly").select("*");

  const [groups, saleOrders, invoices, planning, milestones, taskStages, documents, timesheet] = await Promise.all([
    onlyGroupId ? groupsQ.eq("id", onlyGroupId) : groupsQ,
    onlyGroupId ? saleOrdersQ.eq("group_id", onlyGroupId) : saleOrdersQ,
    onlyGroupId ? invoicesQ.eq("group_id", onlyGroupId) : invoicesQ,
    onlyGroupId ? planningQ.eq("group_id", onlyGroupId) : planningQ,
    onlyGroupId ? milestonesQ.eq("group_id", onlyGroupId) : milestonesQ,
    onlyGroupId ? taskStagesQ.eq("group_id", onlyGroupId) : taskStagesQ,
    onlyGroupId ? documentsQ.eq("group_id", onlyGroupId) : documentsQ,
    onlyGroupId ? timesheetQ.eq("group_id", onlyGroupId) : timesheetQ,
  ]);

  for (const [label, res] of Object.entries({ groups, saleOrders, invoices, planning, milestones, taskStages, documents, timesheet })) {
    if (res.error) throw new Error(`Portfolio Progetti Digiduu: errore leggendo ${label}: ${res.error.message}`);
  }

  const byGroup = <T extends { group_id: number }>(rows: T[] | null) => {
    const map = new Map<number, T[]>();
    for (const row of rows || []) {
      const list = map.get(row.group_id) || [];
      list.push(row);
      map.set(row.group_id, list);
    }
    return map;
  };

  const soByGroup = byGroup(saleOrders.data as unknown as { group_id: number }[] | null);
  const invByGroup = byGroup(invoices.data as unknown as { group_id: number }[] | null);
  const planByGroup = byGroup(planning.data as unknown as { group_id: number }[] | null);
  const msByGroup = byGroup(milestones.data as unknown as { group_id: number }[] | null);
  const stageByGroup = byGroup(taskStages.data as unknown as { group_id: number }[] | null);
  const docByGroup = byGroup(documents.data as unknown as { group_id: number }[] | null);
  const tsByGroup = byGroup(timesheet.data as unknown as { group_id: number }[] | null);

  return (groups.data || []).map((g) => {
    const planRows = (planByGroup.get(g.id) || []) as unknown as { resource: string; role: string; month: string; days: number }[];
    const byResourceMap = new Map<string, { resource: string; role: string; days: Record<string, number>; total: number }>();
    for (const row of planRows) {
      const key = `${row.resource}::${row.role ?? ""}`;
      const entry = byResourceMap.get(key) || { resource: row.resource, role: row.role, days: {}, total: 0 };
      entry.days[row.month] = (entry.days[row.month] || 0) + row.days;
      entry.total += row.days;
      byResourceMap.set(key, entry);
    }
    const byResource = [...byResourceMap.values()];
    const planMonths = [...new Set(planRows.map((r) => r.month))].sort();

    const docs = (docByGroup.get(g.id) || []) as unknown as {
      kind: string;
      name: string;
      location: string;
      doc_date: string | null;
      note: string | null;
    }[];

    const group = {
      id: g.id,
      ids: g.member_ids,
      name: g.name,
      partner: g.client_name,
      active: g.active,
      stage: g.stage,
      date_start: g.date_start,
      date_end: g.date_end,
      chiusura: g.chiusura,
      prop_days: g.prop_days,
      prop_price: g.prop_price,
      act_days: g.act_days,
      act_rev: g.act_rev,
      draft_rev: g.draft_rev,
      plan_days: g.plan_days,
      fc_rev: g.fc_rev,
      days_to_plan: 0,
      members: g.member_names,
      member_count: g.member_names?.length ?? 0,
      baseline_excluded: g.baseline_excluded,
      sale_orders: ((soByGroup.get(g.id) || []) as unknown as { order_id: number; name: string; date_start: string | null; date_end: string | null }[]).map((so) => ({
        id: so.order_id,
        name: so.name,
        date_start: so.date_start,
        date_end: so.date_end,
      })),
      invoices: (
        (invByGroup.get(g.id) || []) as unknown as {
          invoice_date: string;
          due_date: string | null;
          state: string;
          amount: number;
          number: string | null;
          payment_state: string;
          is_credit_note: boolean;
          is_overdue: boolean;
        }[]
      ).map((i) => {
        return {
          date: i.invoice_date,
          due_date: i.due_date,
          state: i.state as "posted" | "draft",
          amount: i.amount,
          number: i.number,
          payment_state: i.payment_state as Group["invoices"][number]["payment_state"],
          is_credit_note: i.is_credit_note,
          is_overdue: i.is_overdue,
        };
      }),
      invoiced_total: g.invoiced_total,
      draft_total: g.draft_total,
      paid_total: g.paid_total,
      planning_future: { months: planMonths, by_resource: byResource, total_days: byResource.reduce((a, r) => a + r.total, 0), slot_count: 0 },
      tags: g.tags,
      milestones: (
        (msByGroup.get(g.id) || []) as unknown as {
          name: string;
          deadline: string | null;
          is_reached: boolean;
          reached_date: string | null;
          source: string | null;
        }[]
      ).map((m) => ({ name: m.name, deadline: m.deadline, is_reached: m.is_reached, reached_date: m.reached_date, source: m.source })),
      task_stages: ((stageByGroup.get(g.id) || []) as unknown as { stage: string; count: number }[]).map((s) => ({ stage: s.stage, count: s.count })),
      task_total: g.task_total,
      sal_docs: docs.filter((d) => d.kind === "sal").map((d) => ({ name: d.name, location: d.location, date: d.doc_date, note: d.note })),
      cert_docs: docs.filter((d) => d.kind === "certificato").map((d) => ({ name: d.name, location: d.location, date: d.doc_date, note: d.note })),
      overdue_total: g.overdue_total,
      overdue_count: g.overdue_count,
    } satisfies Group;

    const monthlyDays: Record<string, number> = {};
    for (const row of (tsByGroup.get(g.id) || []) as unknown as { month: string; days: number }[]) {
      monthlyDays[row.month] = (monthlyDays[row.month] || 0) + row.days;
    }

    return { group, plName: g.pl_name as string, monthlyDays };
  });
}

// Raggruppa per Project Leader, nella stessa forma ProjectLeaderReport già
// usata da Report Progetti Digiduu (serve a riusare riepSummary/FilterTabs
// senza modifiche). `plNotesByName` arriva da una query separata su ppd_pl_notes.
export function groupByProjectLeader(rows: GroupWithPl[], plNotesByName: Map<string, string[]>): ProjectLeaderReport[] {
  const byPl = new Map<string, Group[]>();
  for (const { group, plName } of rows) {
    const list = byPl.get(plName) || [];
    list.push(group);
    byPl.set(plName, list);
  }
  return [...byPl.entries()].map(([pl_name, groups]) => ({
    pl_name,
    groups,
    notes: plNotesByName.get(pl_name) || [],
  }));
}

export async function fetchAnalysisNote(supabase: SupabaseClient, groupId: number): Promise<string | null> {
  const { data } = await supabase.from("ppd_analysis_notes").select("note").eq("group_id", groupId).maybeSingle();
  return (data as { note: string } | null)?.note ?? null;
}

// "Progetti attivi per fase" (§6.3): singoli progetti Odoo, non gruppi — la
// RLS di ppd_active_projects_by_phase già limita la lettura a chi ha
// visibilità globale o è superadmin, stesso perimetro della pagina che la
// chiama (requireGlobalVisibility).
export async function fetchActivePhaseProjects(supabase: SupabaseClient): Promise<ActivePhaseProject[]> {
  const { data, error } = await supabase.from("ppd_active_projects_by_phase").select("id, pl_name, project_name, stage, is_assistenza");
  if (error) throw new Error(`Portfolio Progetti Digiduu: errore leggendo ppd_active_projects_by_phase: ${error.message}`);
  return (
    (data as { id: number; pl_name: string; project_name: string; stage: "Da fare" | "In corso"; is_assistenza: boolean }[] | null) || []
  ).map((r) => ({
    id: r.id,
    plName: r.pl_name,
    projectName: r.project_name,
    stage: r.stage,
    isAssistenza: r.is_assistenza,
  }));
}
