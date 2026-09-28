import type { NextConfig } from "next";

// Origin Odoo autorizzate a incastonare l'app in un iframe (elenco separato
// da spazi, es. "http://localhost:8079"), deve combaciare col system
// parameter `htf_control.base_url` del modulo Odoo `oriens_htf_control`.
// Senza questa variabile l'app non è embeddable da nessuno: è il primo
// livello di difesa contro il clickjacking, in attesa della restrizione di
// rete quando il servizio verrà esposto online.
const frameAncestors = process.env.HTF_CONTROL_FRAME_ANCESTORS?.trim();

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors 'self'${frameAncestors ? ` ${frameAncestors}` : " 'none'"}`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
