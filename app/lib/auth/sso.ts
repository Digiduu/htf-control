import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export type SsoTokenPayload = {
  email: string;
  target: string;
  iat: number;
  exp: number;
};

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

// Verifica un JWT HS256 generato dal modulo Odoo `oriens_htf_control`
// (controllers/main.py) con lo stesso secret condiviso
// HTF_CONTROL_SSO_SECRET. Il payload è minimo (email, target, iat, exp): la
// verifica manuale della firma evita di aggiungere una dipendenza jwt solo
// per questo endpoint.
export function verifySsoToken(token: string): SsoTokenPayload | null {
  const secret = process.env.HTF_CONTROL_SSO_SECRET;
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  const expectedSignature = createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  const actualSignature = base64UrlDecode(signatureB64);

  if (
    expectedSignature.length !== actualSignature.length ||
    !timingSafeEqual(expectedSignature, actualSignature)
  ) {
    return null;
  }

  let payload: Partial<SsoTokenPayload>;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8"));
  } catch {
    return null;
  }

  if (
    typeof payload.email !== "string" ||
    typeof payload.target !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }

  if (Math.floor(Date.now() / 1000) > payload.exp) return null;

  return payload as SsoTokenPayload;
}
