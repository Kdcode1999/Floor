// Floor's own server, in the sample space: the few jobs that need a secret key in the real
// thing. Each answers the way its route in web/src/app/api does, or refuses with the same
// short word. Two refuse with "sample": nothing here can take a video or delete an account.
//
// No phone code.

import { canOpenLesson } from "./functions/learn";
import { liveFunctions } from "./functions/live";
import { telegramFunctions } from "./functions/telegram";
import { isStaff, Refusal, type Ctx } from "./rules";
import type { SampleAsset } from "./world";

/** The name the sample gives Floor's Telegram bot. */
export const SAMPLE_BOT = "FloorTeaserBot";

/** How long an address for a video works, as the real server sets it. */
const PLAY_SECONDS = 6 * 60 * 60;

export type ServerAnswer = { ok: true; data: unknown } | { ok: false; code: string };

type Route = (ctx: Ctx, body: Record<string, unknown>, assetUri: (asset: SampleAsset) => string) => unknown;

const lessonNamed = (ctx: Ctx, id: unknown) => ctx.world.lessons.find((each) => each.id === id);

const ROUTES: Record<string, Route> = {
  // Jobs are what the real server does after the fact, such as sending alerts. The sample has none.
  "/api/jobs/run": () => ({}),

  "/api/telegram/start": (ctx, body) => {
    const space = String(body.space ?? "");
    const status = telegramFunctions.telegram_status(ctx, { p_space: space })[0];
    // The code already waiting is given again, unless a new one is asked for.
    if (body.renew !== true && status.code && status.code_expires_at) return { code: status.code, expiresAt: status.code_expires_at, bot: SAMPLE_BOT };
    const made = telegramFunctions.telegram_start(ctx, { p_space: space })[0];
    return { code: made.code, expiresAt: made.expires_at, bot: SAMPLE_BOT };
  },

  "/api/video/play": (ctx, body, assetUri) => {
    const lesson = lessonNamed(ctx, body.lessonId);
    if (!lesson || lesson.video_status !== "ready" || !canOpenLesson(ctx, lesson)) throw new Refusal("not_allowed", "42501");
    // Every lesson in the sample plays the one short film that comes with the app.
    return { url: assetUri("lesson"), poster: assetUri("poster"), expires: Math.floor(ctx.now / 1000) + PLAY_SECONDS };
  },

  "/api/video/status": (ctx, body) => {
    const lesson = lessonNamed(ctx, body.lessonId);
    if (!lesson || !isStaff(ctx, lesson.space_id)) throw new Refusal("not_allowed", "42501");
    return { status: lesson.video_status, seconds: lesson.duration_seconds };
  },

  "/api/video/upload": (ctx, body) => {
    const lesson = lessonNamed(ctx, body.lessonId);
    if (!lesson || !isStaff(ctx, lesson.space_id)) throw new Refusal("not_allowed", "42501");
    throw new Refusal("sample");
  },

  "/api/account/delete": () => {
    throw new Refusal("sample");
  },

  // The real server asks the database whether the room opens for this person, then hands out
  // a key to the video service. Here the film that comes with the app stands in for the stream.
  "/api/live/join": (ctx, body, assetUri) => {
    const pass = liveFunctions.live_join(ctx, { p_session: String(body.session ?? "") })[0];
    return {
      title: pass.title,
      startedAt: pass.started_at,
      groupId: pass.group_id,
      isHost: pass.is_host,
      isStaff: pass.is_staff,
      viewerName: pass.viewer_name,
      recorded: pass.record,
      sampleFilm: assetUri("lesson"),
    };
  },

  "/api/live/end": (ctx, body) => {
    liveFunctions.live_end(ctx, { p_session: String(body.session ?? "") });
    return { ok: true };
  },
};

/** The addresses the sample server answers at. */
export const SERVER_PATHS = Object.keys(ROUTES);

/** Answers one call to the server, as the person asking. */
export function runRoute(ctx: Ctx, path: string, body: Record<string, unknown>, assetUri: (asset: SampleAsset) => string): ServerAnswer {
  const route = ROUTES[path];
  if (!route) return { ok: false, code: "server_unavailable" };
  try {
    return { ok: true, data: route(ctx, body, assetUri) };
  } catch (failure) {
    if (!(failure instanceof Refusal)) throw failure;
    // The same short words the real server sends: see refusalFor in web/src/server/http.ts.
    const code = failure.code === "42501" ? "not_allowed" : /^[a-z_]{3,40}$/.test(failure.message) ? failure.message : "database_unavailable";
    return { ok: false, code };
  }
}
