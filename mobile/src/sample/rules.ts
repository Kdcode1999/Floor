// Who may do what in the sample space. These follow the rules the real database keeps (the
// private.* functions in web/supabase/migrations), so the sample behaves the way the real
// thing does: a free member finds VIP posts locked, only staff may write where only staff may.
//
// The real rules are the database's. This copy guards nothing: it only makes the sample true
// to life. No phone code in here.

import type { GroupRow, MembershipRow, Role, World } from "./world";

/** A "no" from the sample backend, worded the way the database words its own. */
export class Refusal extends Error {
  constructor(
    message: string,
    /** The Postgres error code. "42501" is "not permitted", "23514" a failed check. */
    public readonly code: string = "P0001",
  ) {
    super(message);
  }
}

export const notAllowed = () => new Refusal("not_allowed", "42501");

/** A failed check on a table, in the database's own words. The apps look for the check's name. */
export const failedCheck = (table: string, check: string) =>
  new Refusal(`new row for relation "${table}" violates check constraint "${check}"`, "23514");

/** One request: the world, who is asking, and the time it is. */
export interface Ctx {
  world: World;
  /** The person asking. */
  uid: string;
  now: number;
}

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

const after = (value: string | null, now: number) => value !== null && Date.parse(value) > now;

/** The person's row in a space, whatever its standing. */
export function membershipOf(ctx: Ctx, space: string, user: string = ctx.uid): MembershipRow | undefined {
  return ctx.world.memberships.find((each) => each.space_id === space && each.user_id === user);
}

const active = (ctx: Ctx, space: string, user?: string) => {
  const row = membershipOf(ctx, space, user);
  return row && row.status === "active" ? row : undefined;
};

export const isMember = (ctx: Ctx, space: string) => active(ctx, space) !== undefined;
export const isStaff = (ctx: Ctx, space: string) => (active(ctx, space)?.role ?? "member") !== "member";
export const isMentor = (ctx: Ctx, space: string) => active(ctx, space)?.role === "mentor";

/** Staff count as VIP. A member is VIP while their date is still ahead. */
export function isVip(ctx: Ctx, space: string): boolean {
  const row = active(ctx, space);
  return row !== undefined && (row.role !== "member" || after(row.vip_until, ctx.now));
}

export const spaceIsActive = (ctx: Ctx, space: string) => ctx.world.spaces.some((each) => each.id === space && each.status === "active");

/** May the person open the space at all, or with `vip` what is for VIP members? Staff always may. */
export function hasAccess(ctx: Ctx, space: string, vip = false): boolean {
  return isStaff(ctx, space) || (spaceIsActive(ctx, space) && (vip ? isVip(ctx, space) : isMember(ctx, space)));
}

export const groupById = (ctx: Ctx, id: string): GroupRow | undefined => ctx.world.groups.find((each) => each.id === id);

/** May the person read this group? An invited group is read by those invited, and by staff. */
export function canReadGroup(ctx: Ctx, groupId: string): boolean {
  const group = groupById(ctx, groupId);
  if (!group) return false;
  if (isStaff(ctx, group.space_id)) return true;
  if (!hasAccess(ctx, group.space_id, group.audience === "vip")) return false;
  return group.audience !== "invited" || ctx.world.group_members.some((each) => each.group_id === groupId && each.user_id === ctx.uid);
}

/** Whether the person is muted in the space right now. */
export const isMuted = (ctx: Ctx, space: string) => after(membershipOf(ctx, space)?.muted_until ?? null, ctx.now);

/** The name someone goes by. */
export const nameOf = (world: World, user: string) => world.profiles.find((each) => each.id === user)?.display_name ?? "Member";

/** Someone's place in a space while they are in it, or null. */
export function roleIn(world: World, space: string, user: string): Role | null {
  const row = world.memberships.find((each) => each.space_id === space && each.user_id === user && each.status === "active");
  return row?.role ?? null;
}

/** True when the two people are in a space together, and the one asking is in good standing there. */
export function sharesSpace(ctx: Ctx, other: string): boolean {
  return ctx.world.memberships.some(
    (mine) => mine.user_id === ctx.uid && mine.status === "active" && ctx.world.memberships.some((theirs) => theirs.space_id === mine.space_id && theirs.user_id === other),
  );
}

/** Text with the spaces at its ends removed, or null when nothing is left. */
export const words = (text: string | null | undefined): string | null => (text ?? "").trim() || null;

/** A number kept within two ends, with a stand-in when none was given. */
export const within = (value: number | null | undefined, low: number, high: number, otherwise: number) =>
  Math.min(Math.max(value ?? otherwise, low), high);

/** A code a person can read out loud: no 0, O, 1, I or L. */
export function randomCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}
