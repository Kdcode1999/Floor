// A person's spaces and their own account, in the sample space. Each function follows the
// database's own of the same name: see web/supabase/migrations/…_foundation.sql, …_learn.sql,
// …_alerts.sql and …_safety.sql.

import { failedCheck, membershipOf, notAllowed, Refusal, words, type Ctx } from "../rules";
import { firstGroups, iso, membership, newId, settings } from "../world";

const RESERVED_SLUGS = [
  "about", "account", "admin", "api", "app", "auth", "contact", "delete", "download", "floor",
  "help", "join", "legal", "live", "login", "logout", "mentor", "new", "pay", "privacy",
  "report", "settings", "signup", "status", "support", "terms", "www",
];

const REPORT_REASONS = ["scam", "guaranteed_profits", "asks_for_money", "abuse", "other"];

export const accountFunctions = {
  /** The spaces the person belongs to, in the order they joined them, with their place in each. */
  my_spaces(ctx: Ctx) {
    return ctx.world.memberships
      .filter((each) => each.user_id === ctx.uid && each.status === "active")
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at) || a.space_id.localeCompare(b.space_id))
      .flatMap((each) => {
        const space = ctx.world.spaces.find((row) => row.id === each.space_id);
        const set = ctx.world.space_settings.find((row) => row.space_id === each.space_id);
        if (!space || !set) return [];
        return [
          {
            id: space.id,
            slug: space.slug,
            name: space.name,
            theme: space.theme,
            logo_path: space.logo_path,
            status: space.status,
            role: each.role,
            vip_until: each.vip_until,
            block_capture: set.block_capture,
            watermark: set.watermark,
            display_name: ctx.world.profiles.find((row) => row.id === ctx.uid)?.display_name ?? "Member",
          },
        ];
      });
  },

  /** A mentor starts their space. It begins with its two first groups and nothing else. */
  create_space(ctx: Ctx, args: { p_name: string; p_slug: string; p_theme?: string | null; p_terms_version: string }) {
    const slug = (args.p_slug ?? "").trim().toLowerCase();
    const name = (args.p_name ?? "").trim();
    const theme = args.p_theme ?? "night";
    if ((args.p_terms_version ?? "").trim() === "") throw new Refusal("terms_required");
    if (RESERVED_SLUGS.includes(slug)) throw new Refusal("slug_reserved");
    if (ctx.world.spaces.some((each) => each.owner_id === ctx.uid)) throw new Refusal("already_has_space");
    if (ctx.world.spaces.some((each) => each.slug === slug)) throw new Refusal("slug_taken");
    if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(slug)) throw failedCheck("spaces", "spaces_slug_format");
    if (name.length < 1 || name.length > 40) throw failedCheck("spaces", "spaces_name_length");
    if (!["night", "dawn", "smoke"].includes(theme)) throw failedCheck("spaces", "spaces_theme");

    const id = newId();
    ctx.world.spaces.push({
      id,
      slug,
      name,
      tagline: null,
      logo_path: null,
      theme,
      owner_id: ctx.uid,
      status: "active",
      vip_price_cents: null,
      vip_currency: null,
      vip_days: 30,
      broker_name: null,
      card_provider: null,
      created_at: iso(ctx.now),
    });
    ctx.world.space_settings.push(settings(id));
    ctx.world.memberships.push(membership(id, ctx.uid, ctx.now, { role: "mentor" }));
    ctx.world.groups.push(...firstGroups(id, ctx.now));
    return id;
  },

  /** A member tells Floor that a space breaks the rules. One open report each. */
  report_space(ctx: Ctx, args: { p_space: string; p_reason: string; p_details?: string | null }) {
    if (!membershipOf(ctx, args.p_space)) throw notAllowed();
    if (ctx.world.reports.some((each) => each.space_id === args.p_space && each.reporter_id === ctx.uid && each.status === "open")) {
      throw new Refusal("already_reported");
    }
    const details = words(args.p_details);
    if (!REPORT_REASONS.includes(args.p_reason)) throw failedCheck("reports", "reports_reason");
    if (details !== null && details.length > 1000) throw failedCheck("reports", "reports_details");
    const id = newId();
    ctx.world.reports.push({ id, space_id: args.p_space, reporter_id: ctx.uid, reason: args.p_reason, details, status: "open", created_at: iso(ctx.now) });
    return id;
  },

  /** What deleting the person's account would take with it. */
  account_summary(ctx: Ctx) {
    const user = ctx.world.users.find((each) => each.id === ctx.uid);
    if (!user) return [];
    const space = ctx.world.spaces.find((each) => each.owner_id === ctx.uid);
    const others = space ? ctx.world.memberships.filter((each) => each.space_id === space.id && each.status === "active" && each.user_id !== ctx.uid).length : null;
    return [{ user_id: user.id, email: user.email, space_id: space?.id ?? null, space_name: space?.name ?? null, members: others }];
  },

  /** Which alerts the person wants from a space. A switch left out stays as it was. */
  set_alerts(ctx: Ctx, args: { p_space: string; p_setups?: boolean | null; p_live?: boolean | null; p_lessons?: boolean | null }) {
    const row = membershipOf(ctx, args.p_space);
    if (!row) throw notAllowed();
    row.alert_setups = args.p_setups ?? row.alert_setups;
    row.alert_live = args.p_live ?? row.alert_live;
    row.alert_lessons = args.p_lessons ?? row.alert_lessons;
    return null;
  },

  // No alerts are sent from the sample space, so there is no phone address to keep.
  save_push_token() {
    return null;
  },
  remove_push_token() {
    return null;
  },
};
