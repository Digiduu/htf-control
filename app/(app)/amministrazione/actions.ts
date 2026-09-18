"use server";

import { revalidatePath } from "next/cache";
import { requireSuperadmin, type ModuleAccess, type UserRole, type VisibilityGroup } from "../../lib/auth/dal";
import { createAdminClient } from "../../lib/supabase/admin";
import type { ActionResult } from "./lib/types";

const MIN_PASSWORD_LENGTH = 8;
const BAN_DURATION = "876000h"; // ~100 anni: convenzione Supabase per un ban "indefinito".

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Un project_leader_name ha senso solo per il gruppo project_leader: per gli
// altri gruppi lo forziamo a null anche se il form ne mandasse uno per errore.
function resolveVisibility(
  visibilityGroup: VisibilityGroup,
  projectLeaderName: string
): { error: string } | { visibilityGroup: VisibilityGroup; projectLeaderName: string | null } {
  if (visibilityGroup === "project_leader") {
    const name = projectLeaderName.trim();
    if (!name) {
      return { error: "Seleziona il nome del Project Leader." };
    }
    return { visibilityGroup, projectLeaderName: name };
  }
  return { visibilityGroup, projectLeaderName: null };
}

function resolveModuleAccess(value: string): ModuleAccess {
  return value === "pipeline_commerciale_only" ? "pipeline_commerciale_only" : "all";
}

// Ogni Server Action ri-verifica requireSuperadmin() in modo indipendente
// dalla pagina che la invoca: una richiesta può arrivare qui bypassando la UI
// (vedi il commento in app/lib/auth/dal.ts).

// Firma (prevState, formData) per essere usata con useActionState nel form
// "Nuovo utente" (progressive enhancement, come da guida Next.js sui form di
// autenticazione).
export async function createUser(_prevState: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  await requireSuperadmin();

  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const visibilityGroup = String(formData.get("visibilityGroup") ?? "global") as VisibilityGroup;
  const projectLeaderName = String(formData.get("projectLeaderName") ?? "");
  const moduleAccess = resolveModuleAccess(String(formData.get("moduleAccess") ?? "all"));

  if (!isValidEmail(email)) {
    return { error: "Indirizzo email non valido." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.` };
  }
  const visibility = resolveVisibility(visibilityGroup, projectLeaderName);
  if ("error" in visibility) {
    return visibility;
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });

  if (error) {
    return { error: error.message };
  }

  // La riga profiles viene creata dal trigger handle_new_user (sempre come
  // std_user, gruppo global di default): qui scriviamo solo il gruppo scelto.
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      visibility_group: visibility.visibilityGroup,
      project_leader_name: visibility.projectLeaderName,
      module_access: moduleAccess,
    })
    .eq("id", data.user.id);

  if (profileError) {
    return { error: profileError.message };
  }

  revalidatePath("/amministrazione");
  return { success: true };
}

export async function updateUser(
  userId: string,
  patch: {
    fullName: string;
    role: UserRole;
    visibilityGroup: VisibilityGroup;
    projectLeaderName: string;
    moduleAccess: ModuleAccess;
  }
): Promise<ActionResult> {
  const actingProfile = await requireSuperadmin();

  if (userId === actingProfile.id && patch.role !== "superadmin") {
    return { error: "Non puoi rimuovere il tuo stesso ruolo di superadmin." };
  }
  const visibility = resolveVisibility(patch.visibilityGroup, patch.projectLeaderName);
  if ("error" in visibility) {
    return visibility;
  }
  // Un superadmin vede comunque tutto: forziamo "all" anche se il form
  // inviasse altro, per coerenza con lo stesso trattamento già riservato a
  // visibilityGroup quando role === "superadmin" (vedi UserAdminTable.tsx).
  const moduleAccess = patch.role === "superadmin" ? "all" : resolveModuleAccess(patch.moduleAccess);

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      full_name: patch.fullName.trim() || null,
      role: patch.role,
      visibility_group: visibility.visibilityGroup,
      project_leader_name: visibility.projectLeaderName,
      module_access: moduleAccess,
    })
    .eq("id", userId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/amministrazione");
  return { success: true };
}

export async function resetUserPassword(userId: string, newPassword: string): Promise<ActionResult> {
  await requireSuperadmin();

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { error: `La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.` };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/amministrazione");
  return { success: true };
}

export async function setUserBanned(userId: string, banned: boolean): Promise<ActionResult> {
  const actingProfile = await requireSuperadmin();

  if (userId === actingProfile.id) {
    return { error: "Non puoi disabilitare il tuo stesso account." };
  }

  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: banned ? BAN_DURATION : "none",
  });

  if (authError) {
    return { error: authError.message };
  }

  // Mirror su profiles.banned_until per poter leggere lo stato nella pagina
  // senza un round-trip col client service-role (vedi migration 20260911130000).
  const bannedUntil = banned ? new Date(Date.now() + 100 * 365.25 * 24 * 60 * 60 * 1000).toISOString() : null;
  const { error: profileError } = await admin.from("profiles").update({ banned_until: bannedUntil }).eq("id", userId);

  if (profileError) {
    return { error: profileError.message };
  }

  revalidatePath("/amministrazione");
  return { success: true };
}

export async function deleteUser(userId: string): Promise<ActionResult> {
  const actingProfile = await requireSuperadmin();

  if (userId === actingProfile.id) {
    return { error: "Non puoi eliminare il tuo stesso account." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);

  if (error) {
    return { error: error.message };
  }

  // La riga profiles viene rimossa automaticamente (FK on delete cascade).
  revalidatePath("/amministrazione");
  return { success: true };
}
