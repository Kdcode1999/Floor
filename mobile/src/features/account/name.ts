// The name a person goes by, and what the phone says about it. The database decides what is
// allowed: see "Names" in the community migration. This is the same list of words, so the
// app can say what is wrong before asking. Plain logic, tested in tests/.

import { hasLink, hasPhone } from "@/features/chat/logic";

export const NAME_MAX = 40;

const STAFF_WORDS = /(^|[^a-z])(admin|admins|administrator|moderator|support|official|mentor|mentors|helpdesk|help desk|customer care)([^a-z]|$)/;

const WORDS = {
  length: "Use a name of 1 to 40 letters.",
  staff: "Names can't use words like Admin, Mentor, Support or Official. The mentor and admins get a badge instead.",
  contact: "A name can't carry a link, an @name or a phone number.",
  taken: "That is the name of this space, its mentor or an admin. Choose another.",
};

/** What is wrong with a name before it is saved, or null. */
export function nameProblem(name: string): string | null {
  const text = name.trim();
  if (text.length < 1 || text.length > NAME_MAX) return WORDS.length;
  const lower = text.toLowerCase();
  if (lower === "floor" || STAFF_WORDS.test(lower)) return WORDS.staff;
  if (hasLink(text) || hasPhone(text)) return WORDS.contact;
  return null;
}

/** What to say when the database refused a name. */
export function nameMessage(failure: { message?: string | null }): string {
  const message = failure.message ?? "";
  if (message.includes("name_has_contact")) return WORDS.contact;
  if (message.includes("name_taken")) return WORDS.taken;
  if (message.includes("profiles_display_name_reserved")) return WORDS.staff;
  if (message.includes("profiles_display_name")) return WORDS.length;
  return "Couldn't save your name. Check your connection and try again.";
}
