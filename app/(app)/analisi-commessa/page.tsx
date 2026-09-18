import { redirect } from "next/navigation";
import ModulePlaceholder from "../../components/ModulePlaceholder";
import { getCurrentProfile } from "../../lib/auth/dal";

export default async function AnalisiCommessaPage() {
  const profile = await getCurrentProfile();
  // Stesso principio di /report-progetti: un profilo "solo Pipeline
  // Commerciale" non deve raggiungere questo modulo nemmeno digitando
  // l'indirizzo a mano (la Sidebar si limita a non mostrare la voce).
  if (profile?.module_access === "pipeline_commerciale_only" && profile.role !== "superadmin") {
    redirect("/pipeline-commerciale");
  }

  return (
    <ModulePlaceholder title="Analisi commessa" subtitle="Modulo in preparazione" />
  );
}
