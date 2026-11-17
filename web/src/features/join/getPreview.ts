import { cacheLife } from "next/cache";

import { backendConfigured, SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

import { previewLine, type PreviewItem, type PreviewRow } from "./logic";

/**
 * The newest few posts in a space, as a visitor may see them: free posts with their opening
 * words, VIP posts as locked. Read on the server and kept for a few minutes, like the space.
 * The wording of each time ("2 hours ago") is done here too, so the page the server sends and
 * the page the browser draws say the same thing.
 */
export async function getPreview(slug: string): Promise<PreviewItem[]> {
  "use cache";
  cacheLife("minutes");

  if (!backendConfigured) return [];
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/space_preview`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ p_slug: slug.toLowerCase() }),
  });
  // A preview is a nicety. If it cannot be read the join page still works without it.
  if (!response.ok) return [];
  const rows = (await response.json()) as PreviewRow[];
  const now = Date.now();
  return rows.map((row) => previewLine(row, now));
}
