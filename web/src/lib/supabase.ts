import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { backendConfigured, SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

/**
 * The browser's connection to Supabase. Null until web/.env.local is filled in.
 *
 * Visitors sign in here only to join a space and prove a payment. They read the space's
 * content in the phone app, so the web never claims the account's one login.
 */
export const supabase: SupabaseClient | null = backendConfigured
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { storageKey: "floor-auth", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;
