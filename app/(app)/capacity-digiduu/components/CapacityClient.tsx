"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import type { CapacityDoc, CapacityPerson } from "../lib/types";
import { NO_ROLE, codeOfKey, emptyRow, fmt, fmtDate, indexItems, monthLong, monthShort, sumRows, tot, type PS } from "../lib/logic";
import s from "./capacity.module.css";

type View = "risorsa" | "progetto";
type Tip = { x: number; y: number; title: string; rows: [string, string, string?][] } | null;

const EPS = 0.05;

export default function CapacityClient({ doc }: { doc: CapacityDoc }) {
  const n = doc.months.length;
  const [view, setView] = useState<View>("risorsa");
  const [role, setRole] = useState<string>("");
  const [onlyAllocated, setOnlyAllocated] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [tip, setTip] = useState<Tip>(null);

  const idx = useMemo(() => indexItems(doc), [doc]);
  const personByName = useMemo(() => new Map(doc.people.map((p) => [p.name, p])), [doc]);
  const roleOf = (p: CapacityPerson) => p.roles[0] || NO_ROLE;
  const roles = useMemo(() => {
    const set = [...new Set(doc.people.filter((p) => !p.generic).map(roleOf))].filter((r) => r !== NO_ROLE).sort((a, b) => a.localeCompare(b, "it"));
    if (doc.people.some((p) => !p.generic && roleOf(p) === NO_ROLE)) set.push(NO_ROLE);
    return set;
  }, [doc]);
  const roleOk = (name: string) => {
    if (!role) return true;
    const p = personByName.get(name);
    return !!p && roleOf(p) === role;
  };
  const personRow = (name: string) => idx.byPerson.get(name) || emptyRow(n);

  // --- Tooltip -------------------------------------------------------------
  function showTip(e: React.MouseEvent, title: string, rows: [string, string, string?][]) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const W = 300;
    const H = 40 + rows.length * 18;
    let x = r.left + r.width / 2 - W / 2;
    x = Math.max(8, Math.min(x, window.innerWidth - W - 8));
    let y = r.bottom + 6;
    if (y + H > window.innerHeight - 8) y = Math.max(8, r.top - H - 6);
    setTip({ x, y, title, rows });
  }
  const hideTip = () => setTip(null);

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const headProps = (id: string) => ({
    role: "button" as const,
    tabIndex: 0,
    "aria-expanded": open.has(id),
    onClick: () => toggle(id),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle(id);
      }
    },
  });
  const caret = (id: string) => <span className={`${s.caret} ${open.has(id) ? s.caretOpen : ""}`}>▸</span>;

  // --- Mattoncini di cella ---------------------------------------------------
  const chips = (c: PS) => {
    const parts: ReactNode[] = [];
    if (c.p > EPS) parts.push(<span key="p" className={s.chipP}>{fmt(c.p)}</span>);
    if (c.s > EPS) parts.push(<span key="s" className={s.chipS}>{fmt(c.s)}</span>);
    return parts.length === 2 ? (
      <>
        {parts[0]} + {parts[1]}
      </>
    ) : (
      parts[0] ?? null
    );
  };

  function assignedCell(c: PS, goal: number | null, key: string, tipTitle: string, tipExtra: [string, string, string?][] = []) {
    const t = tot(c);
    const over = goal !== null && t - goal > EPS ? t - goal : 0;
    const cls = `${s.cell} ${over ? s.cellOver : ""} ${goal === null ? s.cellNd : ""}`;
    const rows: [string, string, string?][] = [
      ["Pubblicate", fmt(c.p)],
      ["In bozza", fmt(c.s), s.tipDraft],
      ["Totale assegnate", fmt(t)],
      ...tipExtra,
    ];
    if (goal !== null) rows.push(over ? ["Oltre l'obiettivo", `+${fmt(over)}`, s.tipOver] : ["Libere", fmt(goal - t)]);
    return (
      <td key={key} className={cls} onMouseEnter={(e) => showTip(e, tipTitle, rows)} onMouseLeave={hideTip}>
        <span className={s.num}>
          <span className={t > EPS ? s.big : s.zero}>{fmt(t)}</span>
          <span className={s.goal}> / {goal === null ? "n.d." : fmt(goal)}</span>
        </span>
        {over > 0 && (
          <>
            {" "}
            <span className={s.badgeOver}>+{fmt(over)}</span>
          </>
        )}
        {t > EPS && <span className={s.line2}>{chips(c)}</span>}
      </td>
    );
  }

  function plainCell(c: PS, key: string, tipTitle: string, extra: [string, string, string?][] = [], below?: ReactNode) {
    const t = tot(c);
    return (
      <td
        key={key}
        className={s.cell}
        onMouseEnter={(e) => showTip(e, tipTitle, [["Pubblicate", fmt(c.p)], ["In bozza", fmt(c.s), s.tipDraft], ["Totale", fmt(t)], ...extra])}
        onMouseLeave={hideTip}
      >
        {t > EPS ? chips(c) : <span className={s.dot}>·</span>}
        {below}
      </td>
    );
  }

  const ferieLabel = (p: CapacityPerson | undefined, i: number) => (p && p.ferie[i] > EPS ? ` (ferie ${fmt(p.ferie[i])} gg)` : "");
  const endLabel = (key: string) => (doc.ends[key] ? `fine ${fmtDate(doc.ends[key])}` : null);
  const lastMonthWith = (row: PS[]) => {
    let last = -1;
    row.forEach((c, i) => tot(c) > EPS && (last = i));
    return last;
  };
  const plannedAfterEnd = (key: string, row: PS[]) => {
    const end = doc.ends[key];
    const last = lastMonthWith(row);
    return !!end && last >= 0 && doc.months[last] > end.slice(0, 7);
  };

  // --- Vista per risorsa -----------------------------------------------------
  const resourceView = useMemo(() => {
    const visible = doc.people.filter((p) => roleOk(p.name)).filter((p) => !onlyAllocated || personRow(p.name).some((c) => tot(c) > EPS));
    const peak = (p: CapacityPerson) => {
      const row = personRow(p.name);
      if (!p.ggsett) return row.reduce((a, c) => a + tot(c), 0) / 1000;
      return Math.max(0, ...row.map((c, i) => tot(c) / Math.max(p.avail[i] || 0, 0.1)));
    };
    const sortPeak = (list: CapacityPerson[]) => [...list].sort((a, b) => peak(b) - peak(a) || a.name.localeCompare(b.name, "it"));
    return {
      compiled: sortPeak(visible.filter((p) => !p.generic && p.ggsett)),
      notCompiled: sortPeak(visible.filter((p) => !p.generic && !p.ggsett)),
      generic: sortPeak(visible.filter((p) => p.generic)),
      teamPeople: doc.people.filter((p) => !p.generic && p.ggsett && roleOk(p.name)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roleOk/personRow dipendono solo da role, idx e doc
  }, [doc, idx, role, onlyAllocated]);

  function totalCol(row: PS[], goals: (number | null)[]) {
    const t = row.reduce((a, c) => a + tot(c), 0);
    const hasGoal = goals.some((g) => g !== null);
    const g = goals.reduce<number>((a, x) => a + (x ?? 0), 0);
    const over = hasGoal && t - g > EPS ? t - g : 0;
    return (
      <td className={`${s.cell} ${over ? s.cellOver : ""}`}>
        <span className={s.num}>
          <span className={s.big}>{fmt(t)}</span>
          <span className={s.goal}> / {hasGoal ? fmt(g) : "n.d."}</span>
        </span>
        {over > 0 && (
          <>
            {" "}
            <span className={s.badgeOver}>+{fmt(over)}</span>
          </>
        )}
      </td>
    );
  }

  function personRows(p: CapacityPerson) {
    const id = `r:${p.name}`;
    const row = personRow(p.name);
    const projects = [...(idx.byPersonKey.get(p.name) || new Map<string, PS[]>()).entries()].sort(
      (a, b) => b[1].reduce((x, c) => x + tot(c), 0) - a[1].reduce((x, c) => x + tot(c), 0)
    );
    return (
      <Fragment key={id}>
        <tr>
          <th className={`${s.stickyCol} ${s.rowHead}`} {...headProps(id)}>
            {caret(id)}
            <span className={s.name}>{p.name}</span>
            <span className={s.sub}>
              {p.ggsett ? `obiettivo ${fmt(p.ggsett)} gg/mese` : "obiettivo non compilato"} · {roleOf(p)}
            </span>
          </th>
          {row.map((c, i) => assignedCell(c, p.avail[i], doc.months[i], `${p.name} · ${monthLong(doc.months[i])}${ferieLabel(p, i)}`, p.ggsett ? [["Obiettivo / disponibili", `${fmt(p.ggsett)} / ${fmt(p.avail[i] ?? 0)}`]] : []))}
          {totalCol(row, p.avail)}
        </tr>
        {open.has(id) &&
          (projects.length ? (
            projects.map(([key, prow]) => (
              <tr key={`${id}:${key}`} className={s.childRow}>
                <th className={s.stickyCol}>
                  <span className={s.name}>{key}</span>
                  {doc.titles[key] && <span className={s.sub}>{doc.titles[key]}</span>}
                  {endLabel(key) ? <span className={s.sub}>{endLabel(key)}</span> : <span className={s.subNd}>fine non indicata</span>}
                </th>
                {prow.map((c, i) => plainCell(c, doc.months[i], `${p.name} · ${key} · ${monthLong(doc.months[i])}`))}
                <td className={s.cell}>
                  <span className={`${s.num} ${s.big}`}>{fmt(prow.reduce((a, c) => a + tot(c), 0))}</span>
                </td>
              </tr>
            ))
          ) : (
            <tr className={s.childRow}>
              <th className={s.stickyCol}>
                <span className={s.mutedText}>Nessuna giornata in Planning</span>
              </th>
              <td colSpan={n + 1} />
            </tr>
          ))}
      </Fragment>
    );
  }

  const groupHeader = (label: string, count: number) => (
    <tr className={s.groupRow}>
      <th colSpan={n + 2} className={s.stickyCol} style={{ maxWidth: "none" }}>
        {label} ({count})
      </th>
    </tr>
  );

  // --- Vista per progetto ----------------------------------------------------
  const projectView = useMemo(() => {
    const keys = [...idx.byKeyPerson.entries()].map(([key, persons]) => {
      const people = [...persons.entries()].filter(([name]) => roleOk(name));
      const row = sumRows(people.map(([, r]) => r), n);
      const allRow = sumRows([...persons.values()], n);
      return { key, people, row, planned: row.reduce((a, c) => a + tot(c), 0), plannedAll: allRow.reduce((a, c) => a + tot(c), 0) };
    });
    const visible = keys.filter((k) => !role || k.people.length).sort((a, b) => b.planned - a.planned || a.key.localeCompare(b.key, "it"));
    const codesWithSlots = new Set(keys.map((k) => codeOfKey(k.key)).filter(Boolean));
    const unplanned = Object.entries(doc.budget)
      .filter(([code, b]) => b.ord !== null && b.ord - b.reg > EPS && !codesWithSlots.has(code))
      .sort((a, b) => b[1].ord! - b[1].reg - (a[1].ord! - a[1].reg));
    return { visible, unplanned, total: sumRows(visible.map((k) => k.row), n) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roleOk dipende solo da role e doc
  }, [doc, idx, role, n]);

  function budgetCells(code: string | null, plannedAll: number) {
    const b = code ? doc.budget[code] : undefined;
    if (!b || b.ord === null) {
      return (
        <>
          <td className={s.cell}>
            <span className={s.mutedText}>n.d.</span>
          </td>
          <td className={s.cell}>
            <span className={s.mutedText}>n.d.</span>
          </td>
        </>
      );
    }
    const residuo = b.ord - b.reg;
    const dp = residuo - plannedAll;
    let dpNode: ReactNode;
    if (residuo < -EPS) dpNode = <span className={s.overText}>budget superato {fmt(-residuo)}</span>;
    else if (dp > EPS) dpNode = <span className={s.badge}>{fmt(dp)}</span>;
    else if (dp < -EPS) dpNode = <span className={s.overText}>+{fmt(-dp)} oltre</span>;
    else dpNode = <span className={s.mutedText}>coperto</span>;
    return (
      <>
        <td
          className={`${s.cell} ${s.num}`}
          onMouseEnter={(e) => showTip(e, `${code} · budget`, [["Ordinate", fmt(b.ord!)], ["Registrate", fmt(b.reg)], ["Residuo", fmt(residuo)]])}
          onMouseLeave={hideTip}
        >
          {fmt(residuo)}
        </td>
        <td className={s.cell}>{dpNode}</td>
      </>
    );
  }

  function resourceInProjectCell(name: string, c: PS, i: number, key: string) {
    const p = personByName.get(name);
    const goal = p?.avail[i] ?? null;
    const allAssigned = tot(personRow(name)[i]);
    const extra: [string, string, string?][] = [];
    let below: ReactNode = null;
    if (goal !== null) {
      const res = goal - allAssigned;
      extra.push(["Obiettivo risorsa", fmt(goal)], ["Assegnate (tutti i progetti)", fmt(allAssigned)], ["Residuo mensile", fmt(res), res < -EPS ? s.tipOver : undefined]);
      below =
        res < -EPS ? (
          <span className={`${s.res} ${s.resNeg}`}>sfora {fmt(-res)}</span>
        ) : (
          <span className={`${s.res} ${Math.abs(res) <= EPS ? s.resZero : ""}`}>res. {fmt(res)}</span>
        );
    }
    return plainCell(c, doc.months[i], `${name} · ${key} · ${monthLong(doc.months[i])}${ferieLabel(p, i)}`, extra, below);
  }

  // --- Render ----------------------------------------------------------------
  const allIds =
    view === "risorsa"
      ? [...resourceView.compiled, ...resourceView.notCompiled, ...resourceView.generic].map((p) => `r:${p.name}`)
      : projectView.visible.map((k) => `p:${k.key}`);
  const team = sumRows(resourceView.teamPeople.map((p) => personRow(p.name)), n);
  const teamGoal = doc.months.map((_, i) => resourceView.teamPeople.reduce((a, p) => a + (p.avail[i] ?? 0), 0));

  return (
    <div className={s.root}>
      <header className={s.header}>
        <h1>Capacity Digiduu</h1>
        <p>
          Giornate assegnate nel Planning Odoo (pubblicate e in bozza) rispetto all&apos;obiettivo mensile gg di ogni dipendente, per risorsa e progetto, da{" "}
          {monthLong(doc.months[0]).toLowerCase()} a {monthLong(doc.months[n - 1]).toLowerCase()}.
        </p>
      </header>

      <div className={s.toolbar}>
        <div className={s.switch} role="group" aria-label="Vista">
          <button type="button" aria-pressed={view === "risorsa"} onClick={() => setView("risorsa")}>
            Per risorsa
          </button>
          <button type="button" aria-pressed={view === "progetto"} onClick={() => setView("progetto")}>
            Per progetto
          </button>
        </div>
        <label>
          Ruolo
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Tutti i ruoli</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        {view === "risorsa" && (
          <label>
            <input type="checkbox" checked={onlyAllocated} onChange={(e) => setOnlyAllocated(e.target.checked)} />
            Solo risorse con giornate allocate
          </label>
        )}
        <button type="button" className={s.linkBtn} onClick={() => setOpen(new Set(allIds))}>
          Apri tutto
        </button>
        <button type="button" className={s.linkBtn} onClick={() => setOpen(new Set())}>
          Chiudi tutto
        </button>
      </div>

      <div className={s.legend}>
        <span>
          <span className={s.num}>
            <b>12,0</b> <span className={s.goal}>/ 16,0</span>
          </span>
          assegnate / obiettivo mensile
        </span>
        <span>
          <span className={s.badgeOver}>+3,2</span> giornate oltre l&apos;obiettivo
        </span>
        <span>
          <span className={s.swatchNd} /> obiettivo mensile non compilato
        </span>
        <span>
          <span className={s.chipP}>8,0</span> + <span className={s.chipS}>4,0</span> pubblicate + bozza
        </span>
        <span>
          <span className={s.chipP}>&nbsp;&nbsp;&nbsp;</span> giornate pubblicate
        </span>
        <span>
          <span className={s.chipS}>&nbsp;&nbsp;&nbsp;</span> giornate in bozza
        </span>
      </div>

      <div className={s.panel}>
        <table className={s.table}>
          <thead>
            <tr>
              <th className={s.stickyCol}>{view === "risorsa" ? "Risorsa" : "Progetto"}</th>
              {doc.months.map((m, i) => (
                <th key={m}>
                  {monthShort(m)}
                  <small>{doc.wd[i]} gg lav.</small>
                </th>
              ))}
              {view === "risorsa" ? (
                <th>Totale</th>
              ) : (
                <>
                  <th>Pianificate</th>
                  <th>
                    Residuo
                    <small>(ord. − reg.)</small>
                  </th>
                  <th>Da pianificare</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {view === "risorsa" ? (
              <>
                <tr className={s.teamRow}>
                  <th className={s.stickyCol}>
                    <span className={s.name}>Team</span>
                    <span className={s.sub} style={{ marginLeft: 0 }}>
                      {resourceView.teamPeople.length} persone con obiettivo compilato
                    </span>
                  </th>
                  {team.map((c, i) => assignedCell(c, teamGoal[i], doc.months[i], `Team · ${monthLong(doc.months[i])}`, [["Obiettivo / disponibili", fmt(teamGoal[i])]]))}
                  {totalCol(team, teamGoal)}
                </tr>
                {resourceView.compiled.length > 0 && groupHeader("Obiettivo mensile compilato", resourceView.compiled.length)}
                {resourceView.compiled.map(personRows)}
                {resourceView.notCompiled.length > 0 && groupHeader("Obiettivo mensile non compilato in Odoo", resourceView.notCompiled.length)}
                {resourceView.notCompiled.map(personRows)}
                {resourceView.generic.length > 0 && groupHeader("Risorse generiche in Odoo (da assegnare)", resourceView.generic.length)}
                {resourceView.generic.map(personRows)}
              </>
            ) : (
              <>
                <tr className={s.teamRow}>
                  <th className={s.stickyCol}>
                    <span className={s.name}>Totale</span>
                    <span className={s.sub} style={{ marginLeft: 0 }}>
                      {projectView.visible.length} progetti
                    </span>
                  </th>
                  {projectView.total.map((c, i) => plainCell(c, doc.months[i], `Totale · ${monthLong(doc.months[i])}`))}
                  <td className={`${s.cell} ${s.num} ${s.big}`}>{fmt(projectView.total.reduce((a, c) => a + tot(c), 0))}</td>
                  <td />
                  <td />
                </tr>
                {projectView.visible.map((k) => {
                  const id = `p:${k.key}`;
                  const end = endLabel(k.key);
                  const late = plannedAfterEnd(k.key, k.row);
                  return (
                    <Fragment key={id}>
                      <tr>
                        <th className={`${s.stickyCol} ${s.rowHead}`} {...headProps(id)}>
                          {caret(id)}
                          <span className={s.name}>{k.key}</span>
                          <span className={s.sub}>
                            {doc.titles[k.key] ? `${doc.titles[k.key]} · ` : ""}
                            {k.people.length} {k.people.length === 1 ? "risorsa" : "risorse"}
                          </span>
                          {end ? (
                            <span className={late ? s.subOver : s.sub}>
                              {end}
                              {late ? " · pianificato oltre la fine" : ""}
                            </span>
                          ) : (
                            <span className={s.subNd}>fine non indicata</span>
                          )}
                        </th>
                        {k.row.map((c, i) => plainCell(c, doc.months[i], `${k.key} · ${monthLong(doc.months[i])}`))}
                        <td className={`${s.cell} ${s.num} ${s.big}`}>{fmt(k.planned)}</td>
                        {budgetCells(codeOfKey(k.key), k.plannedAll)}
                      </tr>
                      {open.has(id) &&
                        [...k.people]
                          .sort((a, b) => b[1].reduce((x, c) => x + tot(c), 0) - a[1].reduce((x, c) => x + tot(c), 0))
                          .map(([name, prow]) => {
                            const p = personByName.get(name);
                            return (
                              <tr key={`${id}:${name}`} className={s.childRow}>
                                <th className={s.stickyCol}>
                                  <span className={s.name}>{name}</span>
                                  {p && (
                                    <span className={s.sub} style={{ marginLeft: 0 }}>
                                      {p.ggsett ? `obiettivo ${fmt(p.ggsett)} gg/mese` : "obiettivo non compilato"} · {roleOf(p)}
                                    </span>
                                  )}
                                </th>
                                {prow.map((c, i) => resourceInProjectCell(name, c, i, k.key))}
                                <td className={`${s.cell} ${s.num}`}>{fmt(prow.reduce((a, c) => a + tot(c), 0))}</td>
                                <td />
                                <td />
                              </tr>
                            );
                          })}
                    </Fragment>
                  );
                })}
                {!role && projectView.unplanned.length > 0 && (
                  <>
                    {groupHeader("Con residuo ma nessuna giornata in Planning Odoo", projectView.unplanned.length)}
                    {projectView.unplanned.map(([code, b]) => (
                      <tr key={`u:${code}`}>
                        <th className={s.stickyCol}>
                          <span className={s.name}>
                            {code}
                            {b.client ? ` · ${b.client}` : ""}
                          </span>
                          {b.title && <span className={s.sub} style={{ marginLeft: 0 }}>{b.title}</span>}
                        </th>
                        {doc.months.map((m) => (
                          <td key={m} className={s.cell}>
                            <span className={s.dot}>·</span>
                          </td>
                        ))}
                        <td className={`${s.cell} ${s.num}`}>{fmt(0)}</td>
                        {budgetCells(code, 0)}
                      </tr>
                    ))}
                  </>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      <section className={s.notes}>
        <h2>Come sono calcolati i numeri</h2>
        <ul>
          <li>Fonte: Planning Odoo di Digiduu S.r.l., slot dal 1° {monthLong(doc.months[0]).toLowerCase()} in avanti, dati letti il {doc.asof}.</li>
          <li>Giornate = ore allocate ÷ 8. Ogni slot conta nel mese in cui inizia (ora italiana), come la pivot di Odoo: non viene spezzato sui giorni.</li>
          <li>Pubblicate e in bozza sono tenute separate; il totale assegnato è la loro somma.</li>
          <li>Gli slot sui progetti &quot;Ferie&quot; non sono giornate assegnate: si sottraggono all&apos;obiettivo mensile gg della persona in quel mese (obiettivo = max(0, obiettivo − ferie)).</li>
          <li>Obiettivo mensile gg = campo &quot;Obiettivo mensile gg&quot; del dipendente; se vuoto o 0 l&apos;obiettivo è &quot;non compilato&quot;.</li>
          <li>Progetti raggruppati per codice · cliente (es. &quot;DD10340 · AMG&quot;); la data di fine è la più lontana tra i progetti con slot.</li>
          <li>
            Budget per codice, solo progetti senza &quot;Assistenza&quot; nel nome: ordinate = ore allocate ÷ 8 dei progetti sopra le 16h (sotto è un segnaposto), registrate = ore
            effettive ÷ 8. Residuo = ordinate − registrate; da pianificare = residuo − giornate pianificate (pubblicate + bozza, tutte le risorse).
          </li>
          <li>Giorni lavorativi: lunedì–venerdì, festività non considerate. Il filtro Ruolo non cambia il residuo mensile di una persona, che resta calcolato su tutti i suoi progetti.</li>
        </ul>
      </section>

      {tip && (
        <div className={s.tooltip} style={{ left: tip.x, top: tip.y }} role="tooltip">
          <strong>{tip.title}</strong>
          {tip.rows.map(([label, value, cls]) => (
            <div key={label} className={`${s.tipRow} ${cls ?? ""}`}>
              <span>{label}</span>
              <span>{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
