// The backend every screen talks to. It is Supabase once mobile/.env is filled in. Until then
// it is the sample space: a small made-up community held in memory, so the whole app can be
// looked at with no setup. Screens do not know which one they have.

import type { SupabaseClient } from "@supabase/supabase-js";

import { logoUrl } from "@/lib/env";
import { supabase } from "@/lib/supabase";

type Sample = typeof import("@/sample/client");

// The two settings are written out in full here, the only way Expo copies them into a build.
// A build that has them drops the sample space and its pictures altogether.
const sample: Sample | null =
  process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ? null
    : // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only where it is used, which an import at the top cannot do
      (require("@/sample/client") as Sample);

function backend(): SupabaseClient {
  if (supabase) return supabase;
  if (sample) return sample.sampleClient;
  // The same two settings decide both, so one of them is always there.
  throw new Error("The app has no backend.");
}

/** Accounts aside, everything the app reads and writes goes through this. */
export const database: SupabaseClient = backend();

/** Floor's own server in the sample space. Null when the app is connected to the real one. */
export const sampleServer = sample?.sampleServer ?? null;

/** The address of a space's logo, from its place in the "logos" file store. Anyone may see a logo. */
export function logoAddress(path: string): string | null {
  return sample ? sample.sampleLogo(path) : logoUrl(path);
}
