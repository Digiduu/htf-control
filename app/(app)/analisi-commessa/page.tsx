import { redirect } from "next/navigation";
import ModulePlaceholder from "../../components/ModulePlaceholder";
import { getCurrentProfile } from "../../lib/auth/dal";

export default async function AnalisiCommessaPage() {
  const profile = await getCurrentProfile();
  // Stesso principio di /report-progetti: un profilo con "Accesso moduli"
  // ristretto non deve raggiungere questo modulo nemmeno digitando
  // l'indirizzo a mano (la Sidebar si limita a non mostrare la voce — e qui
  // non mostra comunque nessuna voce, il modulo non è collegato ad alcun
  // livello di accesso).
  if (profile?.module_access !== "all" && profile?.role !== "superadmin") {
    redirect("/pipeline-commerciale");
  }

  return (
    <ModulePlaceholder title="Analisi commessa" subtitle="Modulo in preparazione" />
  );
}
