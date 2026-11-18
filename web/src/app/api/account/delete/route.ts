import { after } from "next/server";

import { bearer, body, preflight, refusalFor, refuse, reply } from "@/server/http";
import { runJobs } from "@/server/jobs";
import { asPerson, asServer } from "@/server/supabase";

export const OPTIONS = preflight;
export const maxDuration = 60;

interface Summary {
  user_id: string;
  space_id: string | null;
  space_name: string | null;
}

/** Names are compared the way a person would: ignoring capitals and stray spaces. */
const plain = (value: unknown) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : "");

/**
 * A person deletes their own account, from the app or from the web. The database says who is
 * asking. Their files and videos are queued for removal, and then the account itself goes,
 * taking with it everything that pointed at it.
 *
 * A mentor's account takes their space with it. To be sure they mean that, they have to send
 * the space's name, typed out.
 */
export async function POST(request: Request) {
  const token = bearer(request);
  if (!token) return refuse(401, "signed_out");
  const sent = await body(request);

  const asked = await asPerson(token).rpc("account_summary");
  const refusal = refusalFor(asked.error);
  if (refusal) return refusal;
  const mine = ((asked.data ?? []) as Summary[])[0];
  if (!mine) return refuse(401, "signed_out");
  if (mine.space_id && plain(sent.spaceName) !== plain(mine.space_name)) return refuse(400, "name_needed");

  let database;
  try {
    database = asServer();
  } catch {
    return refuse(503, "not_set_up");
  }
  const erased = await database.rpc("erase_account", { p_user: mine.user_id });
  if (erased.error) return refuse(502, "database_unavailable");
  const gone = await database.auth.admin.deleteUser(mine.user_id);
  // Nothing is half done that trying again will not finish: the first step is safe to repeat.
  // An account that is already gone is what was asked for.
  if (gone.error && gone.error.status !== 404) return refuse(502, "try_again");

  // Their files and videos were queued for removal. Start on that now.
  after(() => runJobs().catch(() => {}));
  return reply({ deleted: true });
}
