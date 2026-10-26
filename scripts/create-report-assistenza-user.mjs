#!/usr/bin/env node
// Script una tantum per creare un utente con accesso al solo Report Assistenza
// (module_access = report_assistenza_only, vedi migration
// 20261026130000_module_access_report_assistenza.sql). visibility_group
// "project_leader" senza nome Project Leader: le RPC della Pipeline non gli
// restituiscono nessun dato. Va aggiunto anche a REPORT_ASSISTENZA_EMAILS in
// app/lib/auth/dal.ts.
// Uso: node scripts/create-report-assistenza-user.mjs <email> "<Nome Cognome>"
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

function loadEnvLocal() {
  const raw = readFileSync(".env.local", "utf-8");
  const env = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const block = (n) => Array.from({ length: n }, () => chars[crypto.randomInt(chars.length)]).join("");
  return [block(4), block(4), block(4)].join("-");
}

async function main() {
  const [, , email, fullName] = process.argv;
  if (!email || !fullName) {
    console.error('Uso: node scripts/create-report-assistenza-user.mjs <email> "<Nome Cognome>"');
    process.exit(1);
  }

  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const password = genPassword();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) {
    console.error("❌ Errore creazione utente:", error.message);
    process.exit(1);
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ visibility_group: "project_leader", project_leader_name: null, module_access: "report_assistenza_only" })
    .eq("id", data.user.id);
  if (profileError) {
    console.error("❌ Utente creato ma errore aggiornando il profilo:", profileError.message);
    process.exit(1);
  }

  console.log("✅ Utente creato:");
  console.log("   email:    " + email);
  console.log("   password: " + password);
  console.log("   visibility_group: project_leader (senza nome) · module_access: report_assistenza_only");
}

main();
