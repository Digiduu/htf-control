import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Client Supabase con la service role key: bypassa RLS e può chiamare
// auth.admin.* (createUser, updateUserById, deleteUser). Usato SOLO dalle
// Server Action dell'area Amministrazione (app/(app)/amministrazione/actions.ts)
// per le operazioni che non hanno equivalente lato RLS — mai importato da un
// Client Component (import "server-only" fa fallire la build se succede).
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
