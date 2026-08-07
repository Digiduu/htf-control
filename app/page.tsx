export const dynamic = "force-dynamic";

import ProdCheck from "./ProdCheck";

export default function Home() {
  return (
    <main style={{ padding: "40px" }}>
      <h1>HTF Control</h1>
      <p>Ambiente di sviluppo locale configurato correttamente.</p>
      <ProdCheck />
    </main>
  );
}
