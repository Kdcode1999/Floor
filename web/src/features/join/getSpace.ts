import { cacheLife } from "next/cache";

import { backendConfigured, SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

import type { PublicSpace } from "./logic";

const SLUG = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
const COLUMNS = "id,slug,name,tagline,theme,logo_path,vip_price_cents,vip_currency,vip_days,broker_name";

/**
 * What anyone may know about the space behind a join link, or null when there is no open space
 * with that link word. Read on the server so a shared link shows the space's name in chat apps.
 * Kept for a few minutes, so a busy link does not ask the database on every visit.
 */
export async function getSpace(slug: string): Promise<PublicSpace | null> {
  "use cache";
  cacheLife("minutes");

  const word = slug.toLowerCase();
  if (!backendConfigured || !SLUG.test(word)) return null;

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/spaces?slug=eq.${encodeURIComponent(word)}&status=eq.active&select=${COLUMNS}`,
    { headers: { apikey: SUPABASE_KEY } },
  );
  if (!response.ok) throw new Error(`Could not read the space: ${response.status}`);
  const rows = (await response.json()) as PublicSpace[];
  return rows[0] ?? null;
}
