// Learn, in the sample space. Each function follows the database's own of the same name: see
// web/supabase/migrations/…_learn.sql.

import { failedCheck, hasAccess, isStaff, notAllowed, Refusal, words, type Ctx } from "../rules";
import { iso, newId, type LessonRow, type ModuleRow } from "../world";

import { teased } from "./telegram";

const inOrder = (a: { position: number; created_at: string; id: string }, b: { position: number; created_at: string; id: string }) =>
  a.position - b.position || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

/** A module staff may change, or a refusal. */
function moduleForStaff(ctx: Ctx, id: string): ModuleRow {
  const found = ctx.world.modules.find((each) => each.id === id);
  if (!found) throw new Refusal("module_not_found");
  if (!isStaff(ctx, found.space_id)) throw notAllowed();
  return found;
}

/** A lesson staff may change, or a refusal. */
function lessonForStaff(ctx: Ctx, id: string): LessonRow {
  const found = ctx.world.lessons.find((each) => each.id === id);
  if (!found) throw new Refusal("lesson_not_found");
  if (!isStaff(ctx, found.space_id)) throw notAllowed();
  return found;
}

function checkTitle(table: "modules" | "lessons", title: string, longest: number): void {
  if (title.length < 1 || title.length > longest) throw failedCheck(table, `${table}_title`);
}

/** True when the list names every one of these rows, once each. */
const sameSet = (rows: { id: string }[], ids: string[]) => rows.length === ids.length && rows.every((row) => ids.includes(row.id));

/** May the person open this lesson? Staff may open any. A member needs VIP, and the lesson to be published. */
export function canOpenLesson(ctx: Ctx, lesson: LessonRow): boolean {
  return isStaff(ctx, lesson.space_id) || (lesson.published_at !== null && hasAccess(ctx, lesson.space_id, true));
}

/** Takes a lesson away, with what its viewers had watched of it. */
function removeLesson(ctx: Ctx, id: string): void {
  ctx.world.lessons = ctx.world.lessons.filter((each) => each.id !== id);
  ctx.world.lesson_progress = ctx.world.lesson_progress.filter((each) => each.lesson_id !== id);
}

export const learnFunctions = {
  /** The course as the person asking may see it: one row for each lesson, in order. */
  learn_outline(ctx: Ctx, args: { p_space: string }) {
    if (!hasAccess(ctx, args.p_space)) throw notAllowed();
    const staff = isStaff(ctx, args.p_space);
    const vip = hasAccess(ctx, args.p_space, true);
    const rows = [];
    for (const module of ctx.world.modules.filter((each) => each.space_id === args.p_space).sort(inOrder)) {
      const lessons = ctx.world.lessons
        .filter((lesson) => lesson.module_id === module.id && (staff || (lesson.published_at !== null && (lesson.video_status === "none" || lesson.video_status === "ready"))))
        .sort(inOrder);
      const head = { module_id: module.id, module_title: module.title };
      // Staff see a module with nothing in it yet. Members do not.
      if (lessons.length === 0 && staff) {
        rows.push({ ...head, lesson_id: null, lesson_title: null, duration_seconds: null, has_video: false, video_status: null, published: false, locked: false, seconds: 0, completed: false });
      }
      for (const lesson of lessons) {
        const progress = ctx.world.lesson_progress.find((each) => each.lesson_id === lesson.id && each.user_id === ctx.uid);
        rows.push({
          ...head,
          lesson_id: lesson.id,
          lesson_title: lesson.title,
          duration_seconds: lesson.duration_seconds,
          has_video: lesson.video_id !== null,
          video_status: staff ? lesson.video_status : null,
          published: lesson.published_at !== null,
          locked: !vip,
          seconds: vip ? (progress?.seconds ?? 0) : 0,
          completed: vip && progress != null && progress.completed_at !== null,
        });
      }
    }
    return rows;
  },

  /** Adds a module, or renames one. */
  save_module(ctx: Ctx, args: { p_space: string; p_title: string; p_module?: string | null }) {
    if (!isStaff(ctx, args.p_space)) throw notAllowed();
    const title = (args.p_title ?? "").trim();
    if (args.p_module == null) {
      checkTitle("modules", title, 80);
      const last = Math.max(0, ...ctx.world.modules.filter((each) => each.space_id === args.p_space).map((each) => each.position));
      const made: ModuleRow = { id: newId(), space_id: args.p_space, title, position: last + 1, created_at: iso(ctx.now) };
      ctx.world.modules.push(made);
      return made.id;
    }
    const found = ctx.world.modules.find((each) => each.id === args.p_module && each.space_id === args.p_space);
    if (!found) throw new Refusal("module_not_found");
    checkTitle("modules", title, 80);
    found.title = title;
    return found.id;
  },

  delete_module(ctx: Ctx, args: { p_module: string }) {
    const found = moduleForStaff(ctx, args.p_module);
    for (const lesson of ctx.world.lessons.filter((each) => each.module_id === found.id)) removeLesson(ctx, lesson.id);
    ctx.world.modules = ctx.world.modules.filter((each) => each.id !== found.id);
    return null;
  },

  reorder_modules(ctx: Ctx, args: { p_space: string; p_modules: string[] }) {
    if (!isStaff(ctx, args.p_space)) throw notAllowed();
    const mine = ctx.world.modules.filter((each) => each.space_id === args.p_space);
    if (!sameSet(mine, args.p_modules ?? [])) throw new Refusal("bad_order");
    for (const module of mine) module.position = args.p_modules.indexOf(module.id) + 1;
    return null;
  },

  /** Adds a lesson to a module, or changes one's words or the module it is in. */
  save_lesson(ctx: Ctx, args: { p_module: string; p_title: string; p_description?: string | null; p_lesson?: string | null }) {
    const module = moduleForStaff(ctx, args.p_module);
    const title = (args.p_title ?? "").trim();
    const description = words(args.p_description);
    const last = () => Math.max(0, ...ctx.world.lessons.filter((each) => each.module_id === module.id).map((each) => each.position));
    const check = () => {
      checkTitle("lessons", title, 120);
      if (description !== null && description.length > 4000) throw failedCheck("lessons", "lessons_description");
    };
    if (args.p_lesson == null) {
      check();
      const made: LessonRow = {
        id: newId(),
        space_id: module.space_id,
        module_id: module.id,
        title,
        description,
        position: last() + 1,
        published_at: null,
        video_id: null,
        video_status: "none",
        duration_seconds: null,
        created_at: iso(ctx.now),
      };
      ctx.world.lessons.push(made);
      return made.id;
    }
    const found = ctx.world.lessons.find((each) => each.id === args.p_lesson && each.space_id === module.space_id);
    if (!found) throw new Refusal("lesson_not_found");
    check();
    // A lesson moved to another module goes to the end of it.
    if (found.module_id !== module.id) found.position = last() + 1;
    found.module_id = module.id;
    found.title = title;
    found.description = description;
    return found.id;
  },

  reorder_lessons(ctx: Ctx, args: { p_module: string; p_lessons: string[] }) {
    const module = moduleForStaff(ctx, args.p_module);
    const mine = ctx.world.lessons.filter((each) => each.module_id === module.id);
    if (!sameSet(mine, args.p_lessons ?? [])) throw new Refusal("bad_order");
    for (const lesson of mine) lesson.position = args.p_lessons.indexOf(lesson.id) + 1;
    return null;
  },

  /** Shows a lesson to VIP members, or takes it back to a draft. */
  publish_lesson(ctx: Ctx, args: { p_lesson: string; p_published?: boolean | null }) {
    const lesson = lessonForStaff(ctx, args.p_lesson);
    if (args.p_published === false) {
      lesson.published_at = null;
      return null;
    }
    if (lesson.video_status !== "none" && lesson.video_status !== "ready") throw new Refusal("video_not_ready");
    if (lesson.video_status === "none" && lesson.description === null) throw new Refusal("lesson_empty");
    if (lesson.published_at === null) {
      lesson.published_at = iso(ctx.now);
      teased(ctx, lesson.space_id, "tease_lessons");
    }
    return null;
  },

  delete_lesson(ctx: Ctx, args: { p_lesson: string }) {
    removeLesson(ctx, lessonForStaff(ctx, args.p_lesson).id);
    return null;
  },

  /** Remembers where the viewer is in a lesson. Once done, a lesson stays done. */
  save_progress(ctx: Ctx, args: { p_lesson: string; p_seconds: number; p_completed?: boolean | null }) {
    const lesson = ctx.world.lessons.find((each) => each.id === args.p_lesson);
    if (!lesson || !canOpenLesson(ctx, lesson)) throw notAllowed();
    const seconds = Math.max(args.p_seconds ?? 0, 0);
    const done = args.p_completed ? iso(ctx.now) : null;
    const held = ctx.world.lesson_progress.find((each) => each.lesson_id === lesson.id && each.user_id === ctx.uid);
    if (held) {
      held.seconds = seconds;
      held.completed_at = held.completed_at ?? done;
    } else {
      ctx.world.lesson_progress.push({ user_id: ctx.uid, lesson_id: lesson.id, seconds, completed_at: done });
    }
    return null;
  },
};
