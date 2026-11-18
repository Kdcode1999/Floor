// Classes and live sessions, in the sample space. Each function follows the database's own of
// the same name: see web/supabase/migrations/…_live.sql.
//
// There is no video service here. Where the real thing streams the mentor's camera and screen,
// the sample plays the short film that comes with the app, and where the real thing keeps a
// recording, the sample makes the draft lesson at once, with the same film. The screens say so.
//
// One rule is left out on purpose. The database counts a session as over once its broadcaster
// has been quiet for three minutes. Nobody really broadcasts here, so a sample session stays on
// until someone ends it.

import { FILM_SECONDS } from "../seed";
import { hasAccess, isStaff, MINUTE, nameOf, notAllowed, Refusal, spaceIsActive, words, DAY, HOUR, type Ctx } from "../rules";
import { iso, newId, type LiveRow } from "../world";
import { removeGroup } from "./chat";

/** True while a session is on. */
const liveOn = (row: LiveRow) => row.status === "live";

const sessionById = (ctx: Ctx, id: string | null | undefined) => ctx.world.live_sessions.find((each) => each.id === id);

/** The draft lesson a session's recording becomes, in a module of its own. */
function recordingLesson(ctx: Ctx, row: LiveRow): string {
  let module = ctx.world.modules.find((each) => each.space_id === row.space_id && each.title === "Live recordings");
  if (!module) {
    const last = Math.max(0, ...ctx.world.modules.filter((each) => each.space_id === row.space_id).map((each) => each.position));
    module = { id: newId(), space_id: row.space_id, title: "Live recordings", position: last + 1, created_at: iso(ctx.now) };
    ctx.world.modules.push(module);
  }
  const moduleId = module.id;
  const last = Math.max(0, ...ctx.world.lessons.filter((each) => each.module_id === moduleId).map((each) => each.position));
  const id = newId();
  ctx.world.lessons.push({
    id,
    space_id: row.space_id,
    module_id: moduleId,
    title: row.title,
    description: row.about,
    position: last + 1,
    published_at: null,
    video_id: "sample-recording",
    video_status: "ready",
    duration_seconds: FILM_SECONDS,
    created_at: iso(ctx.now),
  });
  return id;
}

/** Ends a session. Its chat stays to be read, and nobody but staff can add to it. */
function close(ctx: Ctx, row: LiveRow): void {
  if (row.status !== "live") return;
  row.status = "ended";
  row.ended_at = iso(ctx.now);
  if (row.record) {
    // The real thing takes a few minutes over this. The sample has the lesson ready at once.
    row.lesson_id = recordingLesson(ctx, row);
    row.recording_status = "saved";
  }
  for (const group of ctx.world.groups) if (group.session_id === row.id) group.posting = "staff";
  // The chats of sessions that ended more than a week ago are thrown away.
  const old = new Set(
    ctx.world.live_sessions
      .filter((each) => each.space_id === row.space_id && each.status === "ended" && each.ended_at !== null && Date.parse(each.ended_at) < ctx.now - 7 * DAY)
      .map((each) => each.id),
  );
  for (const group of ctx.world.groups.filter((each) => each.session_id !== null && old.has(each.session_id))) removeGroup(ctx, group.id);
}

const staffOnly = (ctx: Ctx, space: string) => {
  if (!isStaff(ctx, space)) throw notAllowed();
};

export const liveFunctions = {
  /** Puts a class on the schedule, or changes one that has not started. Answers with its id. */
  save_class(ctx: Ctx, args: { p_space: string; p_title: string; p_starts_at: string; p_about?: string | null; p_record?: boolean | null; p_session?: string | null }) {
    staffOnly(ctx, args.p_space);
    const title = (args.p_title ?? "").trim();
    const about = words(args.p_about);
    const starts = Date.parse(args.p_starts_at ?? "");
    if (Number.isNaN(starts) || starts < ctx.now - 5 * MINUTE || starts > ctx.now + 366 * DAY) throw new Refusal("bad_time");
    if (title.length < 1 || title.length > 120) throw new Refusal('new row for relation "live_sessions" violates check constraint "live_sessions_title"', "23514");
    if (about !== null && about.length > 500) throw new Refusal('new row for relation "live_sessions" violates check constraint "live_sessions_about"', "23514");

    if (args.p_session == null) {
      if (ctx.world.live_sessions.filter((each) => each.space_id === args.p_space && each.status === "scheduled").length >= 60) throw new Refusal("too_many_classes");
      const made: LiveRow = {
        id: newId(),
        space_id: args.p_space,
        title,
        about,
        starts_at: iso(starts),
        status: "scheduled",
        started_at: null,
        ended_at: null,
        host_id: null,
        host_seen_at: null,
        record: args.p_record ?? true,
        recording_status: "none",
        lesson_id: null,
        created_at: iso(ctx.now),
      };
      ctx.world.live_sessions.push(made);
      return made.id;
    }
    const found = sessionById(ctx, args.p_session);
    if (!found || found.space_id !== args.p_space || found.status !== "scheduled") throw new Refusal("session_not_found");
    Object.assign(found, { title, about, starts_at: iso(starts), record: args.p_record ?? found.record });
    return found.id;
  },

  /** Takes a class off the schedule. */
  cancel_class(ctx: Ctx, args: { p_session: string }) {
    const found = sessionById(ctx, args.p_session);
    if (!found || found.status !== "scheduled") throw new Refusal("session_not_found");
    staffOnly(ctx, found.space_id);
    found.status = "cancelled";
    return null;
  },

  /**
   * What is on: the live session if there is one, then the classes to come. Someone without VIP
   * is told a class's title and time and that it is locked. Staff also see the classes whose
   * time has passed, and for two weeks the sessions that ended.
   */
  live_schedule(ctx: Ctx, args: { p_space: string }) {
    if (!hasAccess(ctx, args.p_space)) throw notAllowed();
    const staff = isStaff(ctx, args.p_space);
    const vip = hasAccess(ctx, args.p_space, true);
    const order = { live: 0, scheduled: 1, ended: 2, cancelled: 3 } as const;
    const overAt = (row: LiveRow) => Date.parse(row.ended_at ?? row.host_seen_at ?? row.starts_at);

    return ctx.world.live_sessions
      .filter((row) => row.space_id === args.p_space && row.status !== "cancelled")
      .map((row) => ({ row, state: row.status }))
      .filter(
        ({ row, state }) =>
          state === "live" ||
          (state === "scheduled" && (staff || Date.parse(row.starts_at) > ctx.now - HOUR)) ||
          (state === "ended" && staff && overAt(row) > ctx.now - 14 * DAY),
      )
      .sort(
        (a, b) =>
          order[a.state] - order[b.state] ||
          (a.state === "scheduled" ? Date.parse(a.row.starts_at) - Date.parse(b.row.starts_at) : overAt(b.row) - overAt(a.row)) ||
          a.row.id.localeCompare(b.row.id),
      )
      .slice(0, 100)
      .map(({ row, state }) => ({
        id: row.id,
        title: row.title,
        about: vip ? row.about : null,
        starts_at: row.starts_at,
        state,
        started_at: row.started_at,
        ended_at: row.ended_at,
        locked: !vip,
        record: row.record,
        recording_status: staff ? row.recording_status : null,
        lesson_id: staff ? row.lesson_id : null,
      }));
  },

  /**
   * The mentor or an admin goes live: with a class from the schedule, or with a title and
   * nothing scheduled. Asked again for the session that is already on, it hands the broadcast
   * to whoever asks.
   */
  live_start(ctx: Ctx, args: { p_space: string; p_title?: string | null; p_session?: string | null; p_record?: boolean | null }) {
    staffOnly(ctx, args.p_space);
    if (!spaceIsActive(ctx, args.p_space)) throw new Refusal("space_unavailable");

    const on = ctx.world.live_sessions.find((each) => each.space_id === args.p_space && each.status === "live");
    if (on) {
      if (args.p_session != null && on.id === args.p_session) {
        Object.assign(on, { host_id: ctx.uid, host_seen_at: iso(ctx.now) });
        return on.id;
      }
      throw new Refusal("already_live");
    }

    let row: LiveRow;
    if (args.p_session != null) {
      const found = sessionById(ctx, args.p_session);
      if (!found || found.space_id !== args.p_space || found.status !== "scheduled") throw new Refusal("session_not_found");
      Object.assign(found, { status: "live", started_at: iso(ctx.now), host_id: ctx.uid, host_seen_at: iso(ctx.now), record: args.p_record ?? found.record });
      row = found;
    } else {
      const title = (args.p_title ?? "").trim();
      if (title.length < 1 || title.length > 120) throw new Refusal('new row for relation "live_sessions" violates check constraint "live_sessions_title"', "23514");
      row = {
        id: newId(),
        space_id: args.p_space,
        title,
        about: null,
        starts_at: iso(ctx.now),
        status: "live",
        started_at: iso(ctx.now),
        ended_at: null,
        host_id: ctx.uid,
        host_seen_at: iso(ctx.now),
        record: args.p_record ?? true,
        recording_status: "none",
        lesson_id: null,
        created_at: iso(ctx.now),
      };
      ctx.world.live_sessions.push(row);
    }
    ctx.world.groups.push({
      id: newId(),
      space_id: args.p_space,
      name: `Live: ${row.title}`.slice(0, 40),
      about: null,
      audience: "vip",
      posting: "all",
      position: 0,
      created_at: iso(ctx.now),
      last_message_at: null,
      session_id: row.id,
    });
    return row.id;
  },

  /** The broadcaster's app says it is still there. Answers with where the session stands. */
  live_heartbeat(ctx: Ctx, args: { p_session: string }) {
    const row = sessionById(ctx, args.p_session);
    if (!row || !isStaff(ctx, row.space_id)) throw notAllowed();
    if (row.status === "live" && row.host_id === ctx.uid) {
      row.host_seen_at = iso(ctx.now);
      return "live";
    }
    // Still on, with someone else broadcasting now.
    return row.status === "live" ? "taken_over" : row.status;
  },

  /** The mentor or an admin ends the session. */
  live_end(ctx: Ctx, args: { p_session: string }) {
    const row = sessionById(ctx, args.p_session);
    if (!row || !isStaff(ctx, row.space_id)) throw notAllowed();
    close(ctx, row);
    return null;
  },

  /** Someone opens the live room. It opens for VIP members and for staff, while the session is on. */
  live_join(ctx: Ctx, args: { p_session: string }) {
    const row = sessionById(ctx, args.p_session);
    if (!row || !hasAccess(ctx, row.space_id, true)) throw notAllowed();
    if (!liveOn(row)) throw new Refusal("not_live");
    return [
      {
        space_id: row.space_id,
        title: row.title,
        started_at: row.started_at,
        group_id: ctx.world.groups.find((each) => each.session_id === row.id)?.id ?? null,
        is_host: row.host_id === ctx.uid,
        is_staff: isStaff(ctx, row.space_id),
        viewer_name: nameOf(ctx.world, ctx.uid),
        record: row.record,
        recording_status: row.recording_status,
      },
    ];
  },
};
