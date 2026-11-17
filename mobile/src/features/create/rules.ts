// The rules for a new space's name and link word, and the words for when creating one fails.
// The database enforces the same rules (create_space and the checks on `spaces`). Checking
// here first only saves a round trip. Plain logic, tested in tests/.

export const NAME_MAX = 40;
export const SLUG_MIN = 3;
export const SLUG_MAX = 32;

/** The version of the Mentor Terms a mentor agrees to. Change it whenever the terms change. */
export const MENTOR_TERMS_VERSION = "2026-11-17";

/**
 * Turns a space's name into a link word: "Kings FX Academy" becomes "kings-fx-academy".
 * Only small letters, numbers and single dashes survive.
 */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // drop accents: "é" becomes "e"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, SLUG_MAX)
    .replace(/^-+|-+$/g, "");
}

/** Tidies what someone types into the link word box, as they type. */
export function cleanSlug(typed: string): string {
  return typed
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, SLUG_MAX);
}

/** What is wrong with a space name, or null when it is fine. */
export function nameProblem(name: string): string | null {
  const clean = name.trim();
  if (clean.length === 0) return "Give your space a name.";
  if (clean.length > NAME_MAX) return `Keep the name to ${NAME_MAX} letters or fewer.`;
  return null;
}

/** What is wrong with a link word, or null when it is fine. */
export function slugProblem(slug: string): string | null {
  if (slug.length < SLUG_MIN) return `Use at least ${SLUG_MIN} letters or numbers.`;
  if (slug.length > SLUG_MAX) return `Keep it to ${SLUG_MAX} or fewer.`;
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) return "Start and end with a letter or a number.";
  return null;
}

export interface CreateFailure {
  /** The database's short message, for example "slug_taken". */
  message?: string | null;
  /** The Postgres error code, for example "23505". */
  code?: string | null;
}

/** Where a failure belongs on the screen, and what to say there. */
export function createSpaceMessage(failure: CreateFailure): { field: "name" | "slug" | "form"; text: string } {
  const message = failure.message ?? "";
  if (message === "slug_taken" || failure.code === "23505") {
    return { field: "slug", text: "That link word is taken. Try another." };
  }
  if (message === "slug_reserved") return { field: "slug", text: "That word is kept for Floor. Try another." };
  if (message.includes("spaces_slug_format")) {
    return { field: "slug", text: "Use small letters, numbers and dashes only." };
  }
  if (message.includes("spaces_name_length")) return { field: "name", text: "That name can't be used. Try another." };
  if (message === "already_has_space") return { field: "form", text: "You already have a space." };
  if (message === "terms_required") return { field: "form", text: "Agree to the Mentor Terms to go on." };
  if (message === "not_signed_in") return { field: "form", text: "Sign in again, then try once more." };
  return { field: "form", text: "The space couldn't be created. Check your connection and try again." };
}
