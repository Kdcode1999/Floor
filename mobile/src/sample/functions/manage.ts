// The mentor's tools, in the sample space: requests, members and invite codes.
// Each function follows the database's own of the same name: see
// web/supabase/migrations/…_foundation.sql and …_mentor_tools.sql.

import { DAY, isMentor, isStaff, membershipOf, nameOf, notAllowed, randomCode, Refusal, spaceIsActive, within, words, type Ctx } from "../rules";
import { iso, membership, newId, type CodeRow, type RequestRow } from "../world";

const staffOnly = (ctx: Ctx, space: string) => {
  if (!isStaff(ctx, space)) throw notAllowed();
};

const goodDays = (days: number | null | undefined): days is number => typeof days === "number" && Number.isInteger(days) && days >= 1 && days <= 3660;

/** Adds days of VIP: on top of what is left, or from now when none is. Answers with the new end. */
function extendVip(ctx: Ctx, space: string, user: string, days: number | null | undefined): string {
  if (!goodDays(days)) throw new Refusal("bad_days");
  const row = membershipOf(ctx, space, user);
  if (!row || row.status !== "active") throw new Refusal("member_not_found");
  const from = Math.max(row.vip_until ? Date.parse(row.vip_until) : ctx.now, ctx.now);
  row.vip_until = iso(from + days * DAY);
  return row.vip_until;
}

/** A request that is still waiting and that the person may answer, or a refusal. */
function waitingRequest(ctx: Ctx, id: string): RequestRow {
  const request = ctx.world.access_requests.find((each) => each.id === id);
  if (!request) throw new Refusal("request_not_found");
  staffOnly(ctx, request.space_id);
  if (request.status !== "pending") throw new Refusal("already_decided");
  return request;
}

/** Makes someone a member of a space if they are not one yet, as joining by a link does. */
function ensureMembership(ctx: Ctx, space: string): void {
  const row = membershipOf(ctx, space);
  if (row?.status === "banned") throw new Refusal("banned");
  if (!spaceIsActive(ctx, space)) throw new Refusal("space_unavailable");
  if (!row) ctx.world.memberships.push(membership(space, ctx.uid, ctx.now));
}

export const manageFunctions = {
  // --- For members: getting VIP ---------------------------------------------------------------

  /** A member sends proof of a payment or a broker account. It waits in the mentor's queue. */
  request_access(ctx: Ctx, args: { p_space: string; p_kind: string; p_proof_path: string; p_note?: string | null }) {
    ensureMembership(ctx, args.p_space);
    let days: number;
    if (args.p_kind === "payment") days = ctx.world.spaces.find((each) => each.id === args.p_space)?.vip_days ?? 30;
    else if (args.p_kind === "broker") days = ctx.world.space_settings.find((each) => each.space_id === args.p_space)?.broker_vip_days ?? 30;
    else throw new Refusal("bad_kind");
    if (!args.p_proof_path?.startsWith(`${args.p_space}/${ctx.uid}/`)) throw new Refusal("bad_proof_path");
    const kind = args.p_kind;
    if (ctx.world.access_requests.some((each) => each.space_id === args.p_space && each.user_id === ctx.uid && each.kind === kind && each.status === "pending")) {
      throw new Refusal("already_pending");
    }
    const made: RequestRow = {
      id: newId(),
      space_id: args.p_space,
      user_id: ctx.uid,
      kind,
      proof_path: args.p_proof_path,
      note: words(args.p_note),
      days,
      status: "pending",
      decline_reason: null,
      created_at: iso(ctx.now),
    };
    ctx.world.access_requests.push(made);
    return made.id;
  },

  /** Uses an invite code: VIP starts at once. */
  redeem_invite(ctx: Ctx, args: { p_code: string; p_space?: string | null }) {
    const code = ctx.world.invite_codes.find((each) => each.code === (args.p_code ?? "").trim().toUpperCase());
    if (
      !code ||
      (args.p_space != null && code.space_id !== args.p_space) ||
      code.revoked ||
      (code.expires_at !== null && Date.parse(code.expires_at) <= ctx.now) ||
      (code.max_uses !== null && code.used_count >= code.max_uses)
    ) {
      throw new Refusal("invite_invalid");
    }
    ensureMembership(ctx, code.space_id);
    if (ctx.world.invite_redemptions.some((each) => each.code_id === code.id && each.user_id === ctx.uid)) throw new Refusal("invite_already_used");
    ctx.world.invite_redemptions.push({ code_id: code.id, user_id: ctx.uid });
    code.used_count += 1;
    return { space_id: code.space_id, vip_until: extendVip(ctx, code.space_id, ctx.uid, code.days) };
  },

  // --- Requests ------------------------------------------------------------------------------

  /** Everyone waiting for VIP, oldest first. */
  list_requests(ctx: Ctx, args: { p_space: string }) {
    staffOnly(ctx, args.p_space);
    return ctx.world.access_requests
      .filter((each) => each.space_id === args.p_space && each.status === "pending")
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
      .slice(0, 200)
      .map((each) => ({
        id: each.id,
        kind: each.kind,
        name: nameOf(ctx.world, each.user_id),
        note: each.note,
        days: each.days,
        proof_path: each.proof_path,
        created_at: each.created_at,
      }));
  },

  approve_request(ctx: Ctx, args: { p_request: string; p_days?: number | null }) {
    const request = waitingRequest(ctx, args.p_request);
    const days = args.p_days ?? request.days;
    if (!goodDays(days)) throw new Refusal("bad_days");
    const until = extendVip(ctx, request.space_id, request.user_id, days);
    request.status = "approved";
    request.days = days;
    return until;
  },

  decline_request(ctx: Ctx, args: { p_request: string; p_reason?: string | null }) {
    const request = waitingRequest(ctx, args.p_request);
    request.status = "declined";
    request.decline_reason = words((args.p_reason ?? "").trim().slice(0, 200));
    return null;
  },

  // --- Members -------------------------------------------------------------------------------

  /** The space's people, in the order a mentor wants them: VIP about to end comes first. */
  list_members(ctx: Ctx, args: { p_space: string; p_search?: string | null; p_limit?: number | null; p_user?: string | null }) {
    staffOnly(ctx, args.p_space);
    const search = (args.p_search ?? "").trim().toLowerCase();
    const left = (until: string | null) => (until === null ? null : Date.parse(until) - ctx.now);
    const rank = (row: { status: string; role: string; vip_until: string | null }) => {
      const time = left(row.vip_until);
      if (row.status === "banned") return 5;
      if (row.role === "mentor") return 2;
      if (row.role === "admin") return 3;
      if (time !== null && time > 0) return time <= 5 * DAY ? 0 : 1;
      return 4;
    };
    return ctx.world.memberships
      .filter((each) => each.space_id === args.p_space && (args.p_user == null || each.user_id === args.p_user))
      .map((each) => ({ row: each, name: nameOf(ctx.world, each.user_id) }))
      .filter((each) => search === "" || each.name.toLowerCase().includes(search))
      .sort(
        (a, b) =>
          rank(a.row) - rank(b.row) ||
          (a.row.vip_until === null ? 1 : 0) - (b.row.vip_until === null ? 1 : 0) ||
          (a.row.vip_until ?? "").localeCompare(b.row.vip_until ?? "") ||
          a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
          a.row.user_id.localeCompare(b.row.user_id),
      )
      .slice(0, within(args.p_limit, 1, 500, 50))
      .map(({ row, name }) => ({
        user_id: row.user_id,
        name,
        role: row.role,
        status: row.status,
        vip_until: row.vip_until,
        vip: row.status === "active" && (left(row.vip_until) ?? 0) > 0,
        joined_at: row.joined_at,
      }));
  },

  member_counts(ctx: Ctx, args: { p_space: string }) {
    staffOnly(ctx, args.p_space);
    const rows = ctx.world.memberships.filter((each) => each.space_id === args.p_space);
    const vip = rows.filter((each) => each.status === "active" && each.role === "member" && each.vip_until !== null && Date.parse(each.vip_until) > ctx.now);
    return [
      {
        members: rows.filter((each) => each.status === "active").length,
        vip: vip.length,
        expiring: vip.filter((each) => Date.parse(each.vip_until ?? "") <= ctx.now + 5 * DAY).length,
        removed: rows.filter((each) => each.status === "banned").length,
      },
    ];
  },

  grant_vip(ctx: Ctx, args: { p_space: string; p_user: string; p_days: number }) {
    staffOnly(ctx, args.p_space);
    return extendVip(ctx, args.p_space, args.p_user, args.p_days);
  },

  end_vip(ctx: Ctx, args: { p_space: string; p_user: string }) {
    staffOnly(ctx, args.p_space);
    const row = membershipOf(ctx, args.p_space, args.p_user);
    if (!row || row.role !== "member") throw new Refusal("member_not_found");
    row.vip_until = iso(ctx.now);
    return null;
  },

  /** Makes a member an admin, or an admin a member again. Only the mentor may. */
  set_member_role(ctx: Ctx, args: { p_space: string; p_user: string; p_role: string }) {
    if (!isMentor(ctx, args.p_space)) throw notAllowed();
    if (args.p_role !== "admin" && args.p_role !== "member") throw new Refusal("bad_role");
    const row = membershipOf(ctx, args.p_space, args.p_user);
    if (!row || row.role === "mentor" || row.status !== "active") throw new Refusal("member_not_found");
    row.role = args.p_role;
    return null;
  },

  /** Removes someone from the space. An admin may remove members. Only the mentor may remove an admin. */
  ban_member(ctx: Ctx, args: { p_space: string; p_user: string }) {
    staffOnly(ctx, args.p_space);
    const row = membershipOf(ctx, args.p_space, args.p_user);
    if (!row) throw new Refusal("member_not_found");
    if (row.role === "mentor" || (row.role === "admin" && !isMentor(ctx, args.p_space))) throw notAllowed();
    row.status = "banned";
    row.role = "member";
    row.vip_until = null;
    // Anything they were waiting on is closed, so it does not sit in the queue.
    for (const request of ctx.world.access_requests) {
      if (request.space_id === args.p_space && request.user_id === args.p_user && request.status === "pending") {
        request.status = "declined";
        request.decline_reason = "Removed from the space";
      }
    }
    return null;
  },

  unban_member(ctx: Ctx, args: { p_space: string; p_user: string }) {
    staffOnly(ctx, args.p_space);
    const row = membershipOf(ctx, args.p_space, args.p_user);
    if (!row || row.status !== "banned") throw new Refusal("member_not_found");
    row.status = "active";
    return null;
  },

  // --- Invite codes --------------------------------------------------------------------------

  create_invite_code(ctx: Ctx, args: { p_space: string; p_days: number; p_max_uses?: number | null; p_expires_at?: string | null; p_code?: string | null }) {
    staffOnly(ctx, args.p_space);
    if (!goodDays(args.p_days)) throw new Refusal("bad_days");
    if (args.p_max_uses != null && args.p_max_uses < 1) throw new Refusal("bad_max_uses");
    const taken = (code: string) => ctx.world.invite_codes.some((each) => each.code === code);
    let code = (args.p_code ?? "").trim().toUpperCase();
    if (code !== "") {
      if (!/^[A-Z0-9]{4,20}$/.test(code)) throw new Refusal("bad_code");
      if (taken(code)) throw new Refusal("code_taken");
    } else {
      do {
        code = randomCode();
      } while (taken(code));
    }
    const made: CodeRow = {
      id: newId(),
      space_id: args.p_space,
      code,
      days: args.p_days,
      max_uses: args.p_max_uses ?? null,
      used_count: 0,
      expires_at: args.p_expires_at ?? null,
      revoked: false,
      created_at: iso(ctx.now),
    };
    ctx.world.invite_codes.push(made);
    return code;
  },

  revoke_invite_code(ctx: Ctx, args: { p_code_id: string }) {
    const code = ctx.world.invite_codes.find((each) => each.id === args.p_code_id);
    if (!code) throw new Refusal("code_not_found");
    staffOnly(ctx, code.space_id);
    code.revoked = true;
    return null;
  },
};
