export function Kpi({
  label,
  value,
  sub,
  accent,
  good,
  critical,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
  good?: boolean;
  critical?: boolean;
}) {
  const valueColor = critical ? "text-red-600" : good ? "text-emerald-700" : accent ? "text-violet-700" : "text-gray-900";
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1.5 font-mono text-xl font-semibold tabular-nums ${valueColor}`}>{value}</div>
      <div className="mt-0.5 text-xs text-gray-500">{sub}</div>
    </div>
  );
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <section className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{children}</section>;
}
