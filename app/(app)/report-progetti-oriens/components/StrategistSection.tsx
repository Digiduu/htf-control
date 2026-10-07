import type { StrategistGroup } from "../lib/types";
import ProjectCard from "./ProjectCard";

export default function StrategistSection({ strategist }: { strategist: StrategistGroup }) {
  return (
    <section id={strategist.slug} className="mb-10 border-t-4 border-orange-700 pt-4">
      <h2 className="font-serif text-lg font-semibold text-orange-800">{strategist.nome}</h2>
      <p className="mb-4 font-mono text-xs text-gray-500">{strategist.riepilogo}</p>
      {strategist.pmGroups.map((pm) => (
        <div key={pm.slug} className="mb-5">
          <h3 className="mb-2 border-b border-gray-200 pb-1.5 text-sm font-semibold text-gray-900">
            PM: {pm.nome} <span className="ml-1.5 font-mono text-xs font-normal text-gray-500">{pm.countLabel}</span>
          </h3>
          <div className="flex flex-col gap-1.5">
            {pm.progetti.map((p) => (
              <ProjectCard key={p.codice} progetto={p} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
