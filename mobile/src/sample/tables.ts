// The handful of tables the app reads or changes directly, in the sample space, and the rule
// each one keeps about who may. They follow the row policies in web/supabase/migrations.
//
// The app asks the way it asks Supabase: from("posts").select("id, title").eq("id", x).limit(1).
// Only the parts of that the app uses are here. No phone code.

import { checkName } from "./functions/names";
import { failedCheck, hasAccess, isMember, isMentor, isStaff, Refusal, sharesSpace, type Ctx } from "./rules";
import type { World } from "./world";

type Row = Record<string, unknown>;

interface Table {
  rows: (world: World) => object[];
  /** May the person asking see this row? */
  read: (ctx: Ctx, row: never) => boolean;
  /** Present on a table the app may change: which columns, whose rows, and what a change must pass. */
  write?: {
    columns: string[];
    may: (ctx: Ctx, row: never) => boolean;
    check?: (ctx: Ctx, next: never) => void;
  };
}

const text = (value: unknown, longest: number) => value === null || (typeof value === "string" && value.length <= longest);
const link = (value: unknown) => value === null || (typeof value === "string" && /^https:\/\//i.test(value));
const count = (value: unknown, low: number, high: number) => typeof value === "number" && Number.isInteger(value) && value >= low && value <= high;

const TABLES: Record<string, Table> = {
  posts: {
    rows: (world) => world.posts,
    read: (ctx, row: World["posts"][number]) => row.deleted_at === null && hasAccess(ctx, row.space_id, row.audience === "vip"),
  },
  lessons: {
    rows: (world) => world.lessons,
    read: (ctx, row: World["lessons"][number]) =>
      isStaff(ctx, row.space_id) || (row.published_at !== null && (row.video_status === "none" || row.video_status === "ready") && hasAccess(ctx, row.space_id, true)),
  },
  memberships: {
    rows: (world) => world.memberships,
    read: (ctx, row: World["memberships"][number]) => row.user_id === ctx.uid || isStaff(ctx, row.space_id),
  },
  invite_codes: {
    rows: (world) => world.invite_codes,
    read: (ctx, row: World["invite_codes"][number]) => isStaff(ctx, row.space_id),
  },
  suspensions: {
    rows: (world) => world.suspensions,
    read: (ctx, row: World["suspensions"][number]) => isStaff(ctx, row.space_id),
  },
  spaces: {
    rows: (world) => world.spaces,
    read: (ctx, row: World["spaces"][number]) => row.status === "active" || row.owner_id === ctx.uid || isStaff(ctx, row.id),
    write: {
      columns: ["name", "tagline", "theme", "vip_price_cents", "vip_currency", "vip_days", "broker_name", "logo_path"],
      may: (ctx, row: World["spaces"][number]) => isMentor(ctx, row.id),
      check: (_ctx, next: World["spaces"][number]) => {
        const name = typeof next.name === "string" ? next.name.trim() : "";
        if (name.length < 1 || name.length > 40) throw failedCheck("spaces", "spaces_name_length");
        if (!text(next.tagline, 80)) throw failedCheck("spaces", "spaces_tagline_length");
        if (!["night", "dawn", "smoke"].includes(next.theme)) throw failedCheck("spaces", "spaces_theme");
        if (next.vip_price_cents !== null && !count(next.vip_price_cents, 0, 2_147_483_647)) throw failedCheck("spaces", "spaces_vip_price");
        if (next.vip_currency !== null && !/^[A-Z]{3,5}$/.test(next.vip_currency)) throw failedCheck("spaces", "spaces_vip_currency");
        if (!count(next.vip_days, 1, 3660)) throw failedCheck("spaces", "spaces_vip_days");
        if (!text(next.broker_name, 40)) throw failedCheck("spaces", "spaces_broker_name");
        if (next.logo_path !== null && !(next.logo_path.length <= 200 && next.logo_path.startsWith(`${next.id}/`))) throw failedCheck("spaces", "spaces_logo_path");
      },
    },
  },
  space_settings: {
    rows: (world) => world.space_settings,
    read: (ctx, row: World["space_settings"][number]) => isMember(ctx, row.space_id),
    write: {
      columns: ["payment_link", "payment_instructions", "broker_link", "broker_vip_days", "block_capture", "watermark"],
      may: (ctx, row: World["space_settings"][number]) => isMentor(ctx, row.space_id),
      check: (_ctx, next: World["space_settings"][number]) => {
        if (!link(next.payment_link)) throw failedCheck("space_settings", "space_settings_payment_link");
        if (!text(next.payment_instructions, 1000)) throw failedCheck("space_settings", "space_settings_instructions");
        if (!link(next.broker_link)) throw failedCheck("space_settings", "space_settings_broker_link");
        if (!count(next.broker_vip_days, 1, 3660)) throw failedCheck("space_settings", "space_settings_broker_days");
      },
    },
  },
  profiles: {
    rows: (world) => world.profiles,
    read: (ctx, row: World["profiles"][number]) => row.id === ctx.uid || sharesSpace(ctx, row.id),
    write: {
      columns: ["display_name"],
      may: (ctx, row: World["profiles"][number]) => row.id === ctx.uid,
      check: (ctx, next: World["profiles"][number]) => checkName(ctx, next.id, typeof next.display_name === "string" ? next.display_name : ""),
    },
  },
};

/** The names of the tables the sample space can answer for. */
export const TABLE_NAMES = Object.keys(TABLES);

export interface Query {
  table: string;
  /** The columns asked for. Null when no rows are wanted back. */
  select: string | null;
  /** The new values, for a change. */
  update: Row | null;
  equals: [string, unknown][];
  order: { column: string; ascending: boolean } | null;
  limit: number | null;
}

/** Runs one question or change, as the person asking. Answers with the rows, or null when none were asked for. */
export function runQuery(ctx: Ctx, query: Query): Row[] | null {
  const table = TABLES[query.table];
  if (!table) throw new Refusal(`relation "public.${query.table}" does not exist`, "42P01");
  const matches = (row: Row) => query.equals.every(([column, value]) => row[column] === value);
  let found = (table.rows(ctx.world) as Row[]).filter((row) => table.read(ctx, row as never) && matches(row));

  if (query.update) {
    const write = table.write;
    const changes = query.update;
    const unknown = Object.keys(changes).find((column) => !write || !write.columns.includes(column));
    if (unknown) throw new Refusal(`permission denied for table ${query.table}`, "42501");
    // A row the person may see but not change is quietly left alone, as the database leaves it.
    found = found.filter((row) => write?.may(ctx, row as never));
    for (const row of found) write?.check?.(ctx, { ...row, ...changes } as never);
    for (const row of found) Object.assign(row, changes);
  }
  if (query.select === null) return null;

  const order = query.order;
  if (order) {
    found = [...found].sort((a, b) => String(a[order.column] ?? "").localeCompare(String(b[order.column] ?? "")) * (order.ascending ? 1 : -1));
  }
  if (query.limit !== null) found = found.slice(0, query.limit);

  const columns = query.select.split(",").map((column) => column.trim()).filter(Boolean);
  return found.map((row) => {
    if (columns.length === 0 || columns.includes("*")) return { ...row };
    const picked: Row = {};
    for (const column of columns) {
      if (!(column in row)) throw new Refusal(`column ${query.table}.${column} does not exist`, "42703");
      picked[column] = row[column];
    }
    return picked;
  });
}
