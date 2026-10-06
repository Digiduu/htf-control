import { requireGlobalVisibility } from "../../lib/auth/dal";
import SintesiPipelineClient from "./SintesiPipelineClient";

// Pagina riservata a chi ha visibilità "global" (vede entrambe le aziende,
// tutti i Project Leader): il confine di sicurezza reale è qui, non nella
// Sidebar (stesso principio già usato per /amministrazione — vedi
// app/lib/auth/dal.ts).
export default async function SintesiPipelinePage() {
  await requireGlobalVisibility();

  return <SintesiPipelineClient />;
}
