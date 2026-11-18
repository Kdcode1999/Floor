// What the Get VIP screen asks of the database. The database decides: a member may read how to
// pay once they have joined, and may only send proof from their own folder in the space.

import type { SupabaseClient } from "@supabase/supabase-js";

import { fittedJpeg, pictureBytes, type Picture } from "@/lib/pictures";

import { inviteMessage, proofMessage, proofPath, proofProblem, type AccessRequest, type RequestKind } from "./logic";

export interface WaysIn {
  priceCents: number | null;
  currency: string | null;
  vipDays: number;
  brokerName: string | null;
  paymentInstructions: string | null;
  paymentLink: string | null;
  brokerLink: string | null;
  brokerDays: number;
  requests: AccessRequest[];
}

export async function loadWaysIn(client: SupabaseClient, spaceId: string, userId: string): Promise<WaysIn> {
  const [space, settings, requests] = await Promise.all([
    client.from("spaces").select("vip_price_cents, vip_currency, vip_days, broker_name").eq("id", spaceId).limit(1),
    client.from("space_settings").select("payment_link, payment_instructions, broker_link, broker_vip_days").eq("space_id", spaceId).limit(1),
    client.from("access_requests").select("kind, status, decline_reason, created_at").eq("space_id", spaceId).eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
  ]);
  for (const answer of [space, settings, requests]) if (answer.error) throw new Error(answer.error.message);
  const s = (space.data ?? [])[0] as { vip_price_cents: number | null; vip_currency: string | null; vip_days: number; broker_name: string | null } | undefined;
  const t = (settings.data ?? [])[0] as { payment_link: string | null; payment_instructions: string | null; broker_link: string | null; broker_vip_days: number } | undefined;
  return {
    priceCents: s?.vip_price_cents ?? null,
    currency: s?.vip_currency ?? null,
    vipDays: s?.vip_days ?? 30,
    brokerName: s?.broker_name ?? null,
    paymentInstructions: t?.payment_instructions ?? null,
    paymentLink: t?.payment_link ?? null,
    brokerLink: t?.broker_link ?? null,
    brokerDays: t?.broker_vip_days ?? 30,
    requests: (requests.data ?? []) as AccessRequest[],
  };
}

/** The longest side of a proof picture, in pixels. Enough to read a receipt. */
const PROOF_SIZE = 2000;

/**
 * Sends a picture as proof of a payment or a broker account. It waits in the mentor's queue.
 * Resolves with a sentence to show if it failed, or null.
 */
export async function sendProof(client: SupabaseClient, spaceId: string, userId: string, kind: RequestKind, picture: Picture, note: string): Promise<string | null> {
  let bytes: ArrayBuffer;
  try {
    bytes = await pictureBytes((await fittedJpeg(picture, PROOF_SIZE)).uri);
  } catch {
    return "The picture couldn't be read. Try another one.";
  }
  const problem = proofProblem({ size: bytes.byteLength, type: "image/jpeg" });
  if (problem) return problem;
  const path = proofPath(spaceId, userId, `${kind}.jpg`, Date.now());
  const upload = await client.storage.from("proofs").upload(path, bytes, { contentType: "image/jpeg" });
  if (upload.error) return "The picture couldn't be uploaded. Check your connection and try again.";
  const { error } = await client.rpc("request_access", { p_space: spaceId, p_kind: kind, p_proof_path: path, p_note: note.trim() || null });
  return error ? proofMessage(error) : null;
}

/** Uses an invite code. VIP starts at once. Resolves with a sentence to show if it failed, or null. */
export async function redeemCode(client: SupabaseClient, spaceId: string, code: string): Promise<string | null> {
  const { error } = await client.rpc("redeem_invite", { p_code: code.trim(), p_space: spaceId });
  return error ? inviteMessage(error) : null;
}
