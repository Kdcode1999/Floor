// Groups and chat, in the sample space. Each function follows the database's own of the same
// name: see web/supabase/migrations/…_community.sql.

import { hasLink, hasPhone } from "@/features/chat/logic";

import {
  canReadGroup,
  failedCheck,
  groupById,
  hasAccess,
  HOUR,
  isMentor,
  isMuted,
  isStaff,
  membershipOf,
  nameOf,
  notAllowed,
  Refusal,
  roleIn,
  sharesSpace,
  within,
  words,
  type Ctx,
} from "../rules";
import { iso, newId, type GroupRow, type MessageRow } from "../world";

const staffOnly = (ctx: Ctx, space: string) => {
  if (!isStaff(ctx, space)) throw notAllowed();
};

/** A group staff may change, or a refusal. */
function groupForStaff(ctx: Ctx, id: string): GroupRow {
  const group = groupById(ctx, id);
  if (!group || !isStaff(ctx, group.space_id)) throw notAllowed();
  return group;
}

const blockedByMe = (ctx: Ctx, author: string) => ctx.world.blocks.some((each) => each.user_id === ctx.uid && each.blocked_id === author);

/** A blocked person's messages are hidden, unless that person is the mentor or an admin. */
const hiddenFromMe = (ctx: Ctx, space: string, author: string) => blockedByMe(ctx, author) && (roleIn(ctx.world, space, author) ?? "member") === "member";

/** A message as the app is given it. A deleted one keeps its place and loses its words. */
function messageRow(ctx: Ctx, message: MessageRow) {
  const deleted = message.deleted_at !== null;
  const answered = message.reply_to === null ? undefined : ctx.world.messages.find((each) => each.id === message.reply_to);
  return {
    id: message.id,
    user_id: message.user_id,
    name: nameOf(ctx.world, message.user_id),
    role: roleIn(ctx.world, message.space_id, message.user_id),
    body: deleted ? null : message.body,
    image_path: deleted ? null : message.image_path,
    image_width: deleted ? null : message.image_width,
    image_height: deleted ? null : message.image_height,
    reply_to: message.reply_to,
    reply_name: answered ? nameOf(ctx.world, answered.user_id) : null,
    reply_body: answered && answered.deleted_at === null ? (answered.body ?? "Picture").slice(0, 120) : null,
    created_at: message.created_at,
    changed_at: message.changed_at,
    deleted,
    mine: message.user_id === ctx.uid,
  };
}

/** Takes a group's messages away, with every report made about them. */
function removeMessages(ctx: Ctx, groupId: string): void {
  const gone = new Set(ctx.world.messages.filter((each) => each.group_id === groupId).map((each) => each.id));
  ctx.world.messages = ctx.world.messages.filter((each) => !gone.has(each.id));
  ctx.world.message_reports = ctx.world.message_reports.filter((each) => !gone.has(each.message_id));
}

/** Takes a group away with everything said in it. */
export function removeGroup(ctx: Ctx, groupId: string): void {
  removeMessages(ctx, groupId);
  ctx.world.group_members = ctx.world.group_members.filter((each) => each.group_id !== groupId);
  ctx.world.group_reads = ctx.world.group_reads.filter((each) => each.group_id !== groupId);
  ctx.world.groups = ctx.world.groups.filter((each) => each.id !== groupId);
}

export const chatFunctions = {
  // --- Reading -------------------------------------------------------------------------------

  /** The space's groups as this person sees them. A VIP group is listed for a free member, locked. */
  my_groups(ctx: Ctx, args: { p_space: string }) {
    const staff = isStaff(ctx, args.p_space);
    if (!staff && !hasAccess(ctx, args.p_space)) throw notAllowed();
    const muted = isMuted(ctx, args.p_space);
    const joined = membershipOf(ctx, args.p_space)?.joined_at ?? null;

    return ctx.world.groups
      // A live session's chat is reached from its room, never from this list.
      .filter((group) => group.space_id === args.p_space && group.session_id === null)
      .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
      .map((group) => ({ group, open: canReadGroup(ctx, group.id) }))
      .filter(({ group, open }) => open || group.audience === "vip")
      .map(({ group, open }) => {
        const said = open ? ctx.world.messages.filter((each) => each.group_id === group.id && each.deleted_at === null && !blockedByMe(ctx, each.user_id)) : [];
        const last = said.reduce<MessageRow | null>((newest, each) => (newest === null || each.created_at > newest.created_at ? each : newest), null);
        // Unread counts from the later of the person's last visit and the day they joined.
        const read = ctx.world.group_reads.find((each) => each.group_id === group.id && each.user_id === ctx.uid)?.read_at ?? group.created_at;
        const from = Math.max(Date.parse(read), Date.parse(joined ?? group.created_at));
        return {
          id: group.id,
          name: group.name,
          about: group.about,
          audience: group.audience,
          posting: group.posting,
          can_open: open,
          can_post: open && (staff || (group.posting === "all" && !muted)),
          last_at: last?.created_at ?? null,
          last_name: last ? nameOf(ctx.world, last.user_id) : null,
          last_body: last ? (last.body?.slice(0, 120) ?? null) : null,
          last_has_image: last ? last.image_path !== null : null,
          unread: Math.min(said.filter((each) => each.user_id !== ctx.uid && Date.parse(each.created_at) > from).length, 100),
        };
      });
  },

  mark_read(ctx: Ctx, args: { p_group: string }) {
    const group = groupById(ctx, args.p_group);
    if (!group || !canReadGroup(ctx, args.p_group)) throw notAllowed();
    const upTo = group.last_message_at ?? group.created_at;
    const held = ctx.world.group_reads.find((each) => each.group_id === group.id && each.user_id === ctx.uid);
    if (!held) ctx.world.group_reads.push({ group_id: group.id, user_id: ctx.uid, read_at: upTo });
    else if (held.read_at < upTo) held.read_at = upTo;
    return null;
  },

  /** The newest messages in a group, or those before a moment. Newest first. */
  chat_page(ctx: Ctx, args: { p_group: string; p_before?: string | null; p_limit?: number | null }) {
    if (!canReadGroup(ctx, args.p_group)) throw notAllowed();
    const before = args.p_before ? Date.parse(args.p_before) : null;
    return ctx.world.messages
      .filter(
        (each) =>
          each.group_id === args.p_group &&
          each.deleted_at === null &&
          (before === null || Date.parse(each.created_at) < before) &&
          !hiddenFromMe(ctx, each.space_id, each.user_id),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, within(args.p_limit, 1, 100, 50))
      .map((each) => messageRow(ctx, each));
  },

  /** Everything new or changed in a group since a moment, deleted messages included. */
  chat_changes(ctx: Ctx, args: { p_group: string; p_since?: string | null }) {
    if (!canReadGroup(ctx, args.p_group)) throw notAllowed();
    const since = args.p_since ? Date.parse(args.p_since) : ctx.now;
    return ctx.world.messages
      .filter((each) => each.group_id === args.p_group && Date.parse(each.changed_at) > since && !hiddenFromMe(ctx, each.space_id, each.user_id))
      .sort((a, b) => a.changed_at.localeCompare(b.changed_at))
      .slice(0, 200)
      .map((each) => messageRow(ctx, each));
  },

  // --- Writing -------------------------------------------------------------------------------

  send_message(
    ctx: Ctx,
    args: { p_group: string; p_body?: string | null; p_reply_to?: string | null; p_image_path?: string | null; p_image_width?: number | null; p_image_height?: number | null },
  ) {
    const group = groupById(ctx, args.p_group);
    if (!group || !canReadGroup(ctx, args.p_group)) throw notAllowed();
    const body = words(args.p_body);
    const picture = args.p_image_path ?? null;

    if (!isStaff(ctx, group.space_id)) {
      if (group.posting === "staff") throw new Refusal("staff_only");
      if (isMuted(ctx, group.space_id)) throw new Refusal("muted");
      if (picture !== null) throw new Refusal("pictures_staff_only");
      if (body !== null && hasLink(body)) throw new Refusal("no_links");
      if (body !== null && hasPhone(body)) throw new Refusal("no_numbers");
      const lately = ctx.world.messages.filter((each) => each.user_id === ctx.uid && Date.parse(each.created_at) > ctx.now - 60_000);
      if (lately.length >= 20) throw new Refusal("slow_down");
    }
    if (body === null && picture === null) throw new Refusal("message_empty");
    if ((body ?? "").length > 2000) throw new Refusal("message_too_long");
    if (picture !== null && !picture.startsWith(`${group.space_id}/${group.id}/`)) throw new Refusal("bad_picture");
    const size = (value: number | null | undefined) => typeof value === "number" && value >= 1 && value <= 10_000;
    if (picture !== null && !(size(args.p_image_width) && size(args.p_image_height))) throw failedCheck("messages", "messages_image");

    // Each message in a group is stamped later than the one before, whatever the clock says.
    const at = iso(Math.max(ctx.now, Date.parse(group.last_message_at ?? group.created_at) + 1));
    group.last_message_at = at;
    const answered = ctx.world.messages.find((each) => each.id === args.p_reply_to && each.group_id === group.id);
    const made: MessageRow = {
      id: newId(),
      group_id: group.id,
      space_id: group.space_id,
      user_id: ctx.uid,
      body,
      image_path: picture,
      image_width: picture === null ? null : (args.p_image_width ?? null),
      image_height: picture === null ? null : (args.p_image_height ?? null),
      reply_to: answered?.id ?? null,
      created_at: at,
      changed_at: at,
      deleted_at: null,
    };
    ctx.world.messages.push(made);

    const held = ctx.world.group_reads.find((each) => each.group_id === group.id && each.user_id === ctx.uid);
    if (held) held.read_at = at;
    else ctx.world.group_reads.push({ group_id: group.id, user_id: ctx.uid, read_at: at });
    return made.id;
  },

  /** A person deletes their own message. The mentor deletes any. An admin deletes any but the mentor's. */
  delete_message(ctx: Ctx, args: { p_message: string }) {
    const message = ctx.world.messages.find((each) => each.id === args.p_message);
    const may =
      message !== undefined &&
      (isMentor(ctx, message.space_id) ||
        (message.user_id === ctx.uid && canReadGroup(ctx, message.group_id)) ||
        (isStaff(ctx, message.space_id) && roleIn(ctx.world, message.space_id, message.user_id) !== "mentor"));
    if (!message || !may) throw notAllowed();
    if (message.deleted_at !== null) return null;
    Object.assign(message, { body: null, image_path: null, image_width: null, image_height: null, deleted_at: iso(ctx.now), changed_at: iso(ctx.now) } satisfies Partial<MessageRow>);
    for (const report of ctx.world.message_reports) if (report.message_id === message.id) report.status = "closed";
    return null;
  },

  // --- Keeping order -------------------------------------------------------------------------

  /** Stops a member writing for that many hours, in every group. Zero lifts it. */
  mute_member(ctx: Ctx, args: { p_space: string; p_user: string; p_hours: number }) {
    staffOnly(ctx, args.p_space);
    if (typeof args.p_hours !== "number" || args.p_hours < 0 || args.p_hours > 24 * 365) throw new Refusal("bad_hours");
    const row = membershipOf(ctx, args.p_space, args.p_user);
    if (!row || row.role !== "member" || row.status !== "active") throw new Refusal("member_not_found");
    row.muted_until = args.p_hours === 0 ? null : iso(ctx.now + args.p_hours * HOUR);
    return row.muted_until;
  },

  report_message(ctx: Ctx, args: { p_message: string }) {
    const message = ctx.world.messages.find((each) => each.id === args.p_message && each.deleted_at === null);
    if (!message || !canReadGroup(ctx, message.group_id)) throw notAllowed();
    if (message.user_id === ctx.uid) throw new Refusal("own_message");
    if (!ctx.world.message_reports.some((each) => each.message_id === message.id && each.reporter_id === ctx.uid)) {
      ctx.world.message_reports.push({ message_id: message.id, space_id: message.space_id, reporter_id: ctx.uid, status: "open", created_at: iso(ctx.now) });
    }
    return null;
  },

  /** The messages members have reported that staff have not yet dealt with. The most reported come first. */
  reported_messages(ctx: Ctx, args: { p_space: string }) {
    staffOnly(ctx, args.p_space);
    const open = ctx.world.message_reports.filter((each) => each.space_id === args.p_space && each.status === "open");
    const rows = [];
    for (const id of new Set(open.map((each) => each.message_id))) {
      const message = ctx.world.messages.find((each) => each.id === id);
      const group = message ? groupById(ctx, message.group_id) : undefined;
      if (!message || !group) continue;
      const mine = open.filter((each) => each.message_id === id);
      rows.push({
        message_id: message.id,
        group_id: group.id,
        group_name: group.name,
        user_id: message.user_id,
        name: nameOf(ctx.world, message.user_id),
        role: roleIn(ctx.world, args.p_space, message.user_id),
        body: message.body,
        has_image: message.image_path !== null,
        created_at: message.created_at,
        reports: mine.length,
        first_reported: mine.map((each) => each.created_at).sort()[0],
      });
    }
    return rows.sort((a, b) => b.reports - a.reports || a.first_reported.localeCompare(b.first_reported)).slice(0, 100);
  },

  dismiss_message_reports(ctx: Ctx, args: { p_message: string }) {
    const message = ctx.world.messages.find((each) => each.id === args.p_message);
    if (!message || !isStaff(ctx, message.space_id)) throw notAllowed();
    for (const report of ctx.world.message_reports) if (report.message_id === message.id) report.status = "closed";
    return null;
  },

  /** A person stops seeing someone's messages. The mentor and admins cannot be blocked. */
  block_member(ctx: Ctx, args: { p_user: string }) {
    if (!args.p_user || args.p_user === ctx.uid || !sharesSpace(ctx, args.p_user)) throw notAllowed();
    const staffOfMine = ctx.world.memberships.some(
      (mine) => mine.user_id === ctx.uid && mine.status === "active" && (roleIn(ctx.world, mine.space_id, args.p_user) ?? "member") !== "member",
    );
    if (staffOfMine) throw new Refusal("cannot_block_staff");
    if (!blockedByMe(ctx, args.p_user)) ctx.world.blocks.push({ user_id: ctx.uid, blocked_id: args.p_user, created_at: iso(ctx.now) });
    return null;
  },

  unblock_member(ctx: Ctx, args: { p_user: string }) {
    ctx.world.blocks = ctx.world.blocks.filter((each) => !(each.user_id === ctx.uid && each.blocked_id === args.p_user));
    return null;
  },

  my_blocks(ctx: Ctx) {
    return ctx.world.blocks
      .filter((each) => each.user_id === ctx.uid)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((each) => ({ user_id: each.blocked_id, name: nameOf(ctx.world, each.blocked_id), blocked_at: each.created_at }));
  },

  // --- Groups --------------------------------------------------------------------------------

  /** Creates a group, or changes one. Answers with its id. */
  save_group(ctx: Ctx, args: { p_space: string; p_name: string; p_about?: string | null; p_audience?: string | null; p_posting?: string | null; p_group?: string | null }) {
    staffOnly(ctx, args.p_space);
    const name = (args.p_name ?? "").replace(/\s+/g, " ").trim();
    const about = words(args.p_about);
    const audience = args.p_audience ?? "everyone";
    const posting = args.p_posting ?? "all";
    const check = () => {
      if (name.length < 1 || name.length > 40) throw failedCheck("groups", "groups_name");
      if (about !== null && about.length > 200) throw failedCheck("groups", "groups_about");
      if (audience !== "everyone" && audience !== "vip" && audience !== "invited") throw failedCheck("groups", "groups_audience");
      if (posting !== "all" && posting !== "staff") throw failedCheck("groups", "groups_posting");
      return { name, about, audience, posting } as const;
    };
    // A live session's group does not count towards the thirty, and is not changed here.
    const mine = ctx.world.groups.filter((each) => each.space_id === args.p_space && each.session_id === null);
    if (args.p_group != null) {
      const found = mine.find((each) => each.id === args.p_group);
      if (!found) throw new Refusal("group_not_found");
      Object.assign(found, check());
      return found.id;
    }
    if (mine.length >= 30) throw new Refusal("too_many_groups");
    const made: GroupRow = {
      id: newId(),
      space_id: args.p_space,
      ...check(),
      position: mine.length === 0 ? 0 : Math.max(...mine.map((each) => each.position)) + 1,
      created_at: iso(ctx.now),
      last_message_at: null,
      session_id: null,
    };
    ctx.world.groups.push(made);
    return made.id;
  },

  /** Deletes a group with everything said in it. Only the mentor may. */
  delete_group(ctx: Ctx, args: { p_group: string }) {
    const group = groupById(ctx, args.p_group);
    // A live session's group goes with its session, not by hand.
    if (!group || group.session_id !== null || !isMentor(ctx, group.space_id)) throw notAllowed();
    removeGroup(ctx, group.id);
    return null;
  },

  reorder_groups(ctx: Ctx, args: { p_space: string; p_groups: string[] }) {
    staffOnly(ctx, args.p_space);
    for (const group of ctx.world.groups) {
      const place = (args.p_groups ?? []).indexOf(group.id);
      if (group.space_id === args.p_space && place >= 0) group.position = place + 1;
    }
    return null;
  },

  /** Adds people to an invited group and takes people out of it. */
  set_group_members(ctx: Ctx, args: { p_group: string; p_add?: string[] | null; p_remove?: string[] | null }) {
    const group = groupForStaff(ctx, args.p_group);
    const remove = args.p_remove ?? [];
    ctx.world.group_members = ctx.world.group_members.filter((each) => !(each.group_id === group.id && remove.includes(each.user_id)));
    for (const user of args.p_add ?? []) {
      const inSpace = membershipOf(ctx, group.space_id, user)?.status === "active";
      const already = ctx.world.group_members.some((each) => each.group_id === group.id && each.user_id === user);
      if (inSpace && !already) ctx.world.group_members.push({ group_id: group.id, user_id: user });
    }
    return null;
  },

  group_member_ids(ctx: Ctx, args: { p_group: string }) {
    const group = groupForStaff(ctx, args.p_group);
    return ctx.world.group_members.filter((each) => each.group_id === group.id).map((each) => ({ user_id: each.user_id }));
  },
};
