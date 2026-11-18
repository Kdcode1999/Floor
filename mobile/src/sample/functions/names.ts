// The rules about the name a person goes by, in the sample space. They follow the database's:
// see "Names" in web/supabase/migrations/…_community.sql.

import { hasLink, hasPhone } from "@/features/chat/logic";

import { failedCheck, Refusal, type Ctx } from "../rules";

const STAFF_WORDS = /(^|[^a-z])(admin|admins|administrator|moderator|support|official|mentor|mentors|helpdesk|help desk|customer care)([^a-z]|$)/;

const reserved = (name: string) => name.trim().toLowerCase() === "floor" || STAFF_WORDS.test(name.toLowerCase());

/** A name with everything but its letters and numbers taken out, so "K a y" and "kay" are one name. */
const plain = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** True when the name is the space's own, or its mentor's or an admin's. */
function takenIn(ctx: Ctx, space: string, user: string, name: string): boolean {
  const wanted = plain(name);
  if (wanted === "" || wanted === "member") return false;
  if (ctx.world.spaces.some((each) => each.id === space && plain(each.name) === wanted)) return true;
  return ctx.world.memberships.some(
    (each) =>
      each.space_id === space &&
      each.status === "active" &&
      each.role !== "member" &&
      each.user_id !== user &&
      plain(ctx.world.profiles.find((profile) => profile.id === each.user_id)?.display_name ?? "") === wanted,
  );
}

/** Refuses a name a person may not take, in the database's own words. */
export function checkName(ctx: Ctx, user: string, name: string): void {
  if (hasLink(name) || hasPhone(name)) throw new Refusal("name_has_contact");
  const asMember = ctx.world.memberships.filter((each) => each.user_id === user && each.status === "active" && each.role === "member");
  if (asMember.some((each) => takenIn(ctx, each.space_id, user, name))) throw new Refusal("name_taken");
  const length = name.trim().length;
  if (length < 1 || length > 40) throw failedCheck("profiles", "profiles_display_name_length");
  if (reserved(name)) throw failedCheck("profiles", "profiles_display_name_reserved");
}
