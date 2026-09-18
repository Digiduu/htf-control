import { FILTERS, type FilterKey } from "../lib/report-progetti-logic";
import type { Group } from "../lib/types";

export default function FilterTabs({
  groups,
  active,
  onChange,
}: {
  groups: Group[];
  active: FilterKey;
  onChange: (key: FilterKey) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-1">
      {FILTERS.map((f) => {
        const count = groups.filter(f.fn).length;
        const isActive = f.key === active;
        return (
          <button
            key={f.key}
            type="button"
            onClick={() => onChange(f.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive ? "bg-white text-violet-700 shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {f.key === "alert" ? "⚠ " : ""}
            {f.label} <span className="font-mono text-xs opacity-75">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
