import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

import { SUPABASE_SECRET_KEY } from "./env";

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

/**
 * The database as the person who sent the request. Every access rule applies to them exactly
 * as it does in the apps, so the database decides what they may do, not this server.
 */
export function asPerson(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    ...options,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/**
 * The database with the secret key, past every access rule. Only for what the rules cannot
 * express: recording what a video host reported, taking jobs from the queue.
 */
export function asServer(): SupabaseClient {
  if (!SUPABASE_SECRET_KEY) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, options);
}
