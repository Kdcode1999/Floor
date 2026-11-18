// What the mentor tools ask of the database. Every rule about who may do what lives in the
// database itself. These functions only shape the requests and the answers.

import type { SupabaseClient } from "@supabase/supabase-js";

import { actionMessage, setupChanges, type CodeRow, type MemberRow, type PaymentRow, type SetupForm } from "./logic";

/** Throws the server's message when a read fails, so the screen can offer to try again. */
function rows<T>(result: { data: unknown; error: { message: string } | null }): T[] {
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as T[];
}

/** Turns the answer to an action into a message to show, or null when it worked. */
function done(result: { error: { message: string; code?: string } | null }): string | null {
  return result.error ? actionMessage(result.error) : null;
}

// --- Requests -------------------------------------------------------------------------------

export interface RequestItem {
  id: string;
  kind: "payment" | "broker";
  /** The member's name. */
  name: string;
  /** What the member wrote with their proof. */
  note: string | null;
  /** How many days of VIP approving it gives. */
  days: number;
  /** Where the proof file is kept. */
  proofPath: string;
  createdAt: string;
}

export async function loadRequests(client: SupabaseClient, spaceId: string): Promise<RequestItem[]> {
  type Row = { id: string; kind: "payment" | "broker"; name: string; note: string | null; days: number; proof_path: string; created_at: string };
  return rows<Row>(await client.rpc("list_requests", { p_space: spaceId })).map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    note: row.note,
    days: row.days,
    proofPath: row.proof_path,
    createdAt: row.created_at,
  }));
}

export const approveRequest = async (client: SupabaseClient, id: string) =>
  done(await client.rpc("approve_request", { p_request: id }));

export const declineRequest = async (client: SupabaseClient, id: string, reason: string) =>
  done(await client.rpc("decline_request", { p_request: id, p_reason: reason.trim() || null }));

/** A short-lived address for a proof file. Only the member and the space's staff can get one. */
export async function proofUrl(client: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await client.storage.from("proofs").createSignedUrl(path, 300);
  if (error || !data) throw new Error(error?.message ?? "The file could not be opened.");
  return data.signedUrl;
}

// --- Members --------------------------------------------------------------------------------

export interface MemberItem extends MemberRow {
  userId: string;
  name: string;
  joinedAt: string;
}

type MemberAnswer = MemberRow & { user_id: string; name: string; joined_at: string };

const memberItem = (row: MemberAnswer): MemberItem => ({
  userId: row.user_id,
  name: row.name,
  role: row.role,
  status: row.status,
  vip_until: row.vip_until,
  vip: row.vip,
  joinedAt: row.joined_at,
});

/** The space's people, in the order a mentor wants them: VIP about to end comes first. */
export async function loadMembers(client: SupabaseClient, spaceId: string, search: string, limit: number): Promise<MemberItem[]> {
  const result = await client.rpc("list_members", { p_space: spaceId, p_search: search.trim() || null, p_limit: limit });
  return rows<MemberAnswer>(result).map(memberItem);
}

export async function loadMember(client: SupabaseClient, spaceId: string, userId: string): Promise<MemberItem | null> {
  const result = await client.rpc("list_members", { p_space: spaceId, p_user: userId, p_limit: 1 });
  const row = rows<MemberAnswer>(result)[0];
  return row ? memberItem(row) : null;
}

export interface MemberCounts {
  members: number;
  vip: number;
  expiring: number;
  removed: number;
}

/** How many people are in the space, counted by the database. */
export async function loadMemberCounts(client: SupabaseClient, spaceId: string): Promise<MemberCounts> {
  const row = rows<MemberCounts>(await client.rpc("member_counts", { p_space: spaceId }))[0];
  return row ?? { members: 0, vip: 0, expiring: 0, removed: 0 };
}

export const grantVip = async (client: SupabaseClient, spaceId: string, userId: string, count: number) =>
  done(await client.rpc("grant_vip", { p_space: spaceId, p_user: userId, p_days: count }));

export const endVip = async (client: SupabaseClient, spaceId: string, userId: string) =>
  done(await client.rpc("end_vip", { p_space: spaceId, p_user: userId }));

export const setRole = async (client: SupabaseClient, spaceId: string, userId: string, role: "admin" | "member") =>
  done(await client.rpc("set_member_role", { p_space: spaceId, p_user: userId, p_role: role }));

export const banMember = async (client: SupabaseClient, spaceId: string, userId: string) =>
  done(await client.rpc("ban_member", { p_space: spaceId, p_user: userId }));

export const unbanMember = async (client: SupabaseClient, spaceId: string, userId: string) =>
  done(await client.rpc("unban_member", { p_space: spaceId, p_user: userId }));

// --- Invite codes ---------------------------------------------------------------------------

export interface CodeItem extends CodeRow {
  id: string;
  code: string;
}

export async function loadCodes(client: SupabaseClient, spaceId: string): Promise<CodeItem[]> {
  const result = await client
    .from("invite_codes")
    .select("id, code, days, max_uses, used_count, expires_at, revoked")
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false })
    .limit(100);
  return rows<CodeItem>(result);
}

export const createCode = async (client: SupabaseClient, spaceId: string, count: number, maxUses: number | null) =>
  done(await client.rpc("create_invite_code", { p_space: spaceId, p_days: count, p_max_uses: maxUses }));

export const revokeCode = async (client: SupabaseClient, id: string) =>
  done(await client.rpc("revoke_invite_code", { p_code_id: id }));

// --- Price, payment and links ---------------------------------------------------------------

export interface Setup {
  slug: string;
  /** The card processor members can pay through, or null. It is connected on the web. */
  cardProvider: string | null;
  form: SetupForm;
}

export async function loadSetup(client: SupabaseClient, spaceId: string): Promise<Setup> {
  const [space, settings] = await Promise.all([
    client.from("spaces").select("slug, tagline, vip_price_cents, vip_currency, vip_days, broker_name, card_provider").eq("id", spaceId).limit(1),
    client.from("space_settings").select("payment_link, payment_instructions, broker_link, broker_vip_days").eq("space_id", spaceId).limit(1),
  ]);
  type SpaceRow = { slug: string; tagline: string | null; vip_price_cents: number | null; vip_currency: string | null; vip_days: number; broker_name: string | null; card_provider: string | null };
  type SettingsRow = { payment_link: string | null; payment_instructions: string | null; broker_link: string | null; broker_vip_days: number };
  const s = rows<SpaceRow>(space)[0];
  const t = rows<SettingsRow>(settings)[0];
  if (!s) throw new Error("The space could not be read.");
  const cents = s.vip_price_cents;
  return {
    slug: s.slug,
    cardProvider: s.card_provider,
    form: {
      tagline: s.tagline ?? "",
      price: cents === null ? "" : Number.isInteger(cents / 100) ? String(cents / 100) : (cents / 100).toFixed(2),
      currency: s.vip_currency ?? "NGN",
      vipDays: String(s.vip_days),
      instructions: t?.payment_instructions ?? "",
      paymentLink: t?.payment_link ?? "",
      brokerName: s.broker_name ?? "",
      brokerLink: t?.broker_link ?? "",
      brokerDays: String(t?.broker_vip_days ?? 30),
    },
  };
}

/** A card payment that went through. */
export type PaymentItem = PaymentRow & { id: string };

/** The card payments that went through, newest first. For the mentor and admins. */
export async function loadPayments(client: SupabaseClient, spaceId: string): Promise<PaymentItem[]> {
  return rows<PaymentItem>(await client.rpc("list_payments", { p_space: spaceId, p_limit: 100 }));
}

/** Why the last member who tried could not start a card payment, if one could not. */
export interface CardTrouble {
  provider: string | null;
  problem: string | null;
}

/**
 * Whether card payments have hit trouble. Only the mentor may ask: for anyone else the
 * database says no, and that reads as no trouble to show.
 */
export async function loadCardTrouble(client: SupabaseClient, spaceId: string): Promise<CardTrouble> {
  const { data, error } = await client.rpc("payment_account", { p_space: spaceId });
  const row = error ? undefined : ((data ?? []) as { provider: string; last_error: string | null }[])[0];
  return { provider: row?.provider ?? null, problem: row?.last_error ?? null };
}

/** Saves the form. Asking for the rows back shows whether the database let the change through. */
export async function saveSetup(client: SupabaseClient, spaceId: string, form: SetupForm): Promise<string | null> {
  const changes = setupChanges(form);
  const space = await client.from("spaces").update(changes.space).eq("id", spaceId).select("id");
  if (space.error) return actionMessage(space.error);
  if (!space.data?.length) return "Only the mentor can change this.";
  const settings = await client.from("space_settings").update(changes.settings).eq("space_id", spaceId).select("space_id");
  if (settings.error) return actionMessage(settings.error);
  if (!settings.data?.length) return "Only the mentor can change this.";
  return null;
}
