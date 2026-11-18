// What an alert says. Plain logic, tested in tests/. No secrets, nothing to send.

export interface AlertWords {
  /** The notification's first line: the space's name, so the member knows who it is from. */
  title: string;
  body: string;
  /** True when only people who could open it are told: VIP members and staff. */
  vipOnly: boolean;
  /**
   * Which kind of alert this is, for each member's own switches. "payment" goes to the mentor
   * alone, and "staff" to the mentor and admins.
   */
  kind: "setup" | "lesson" | "live" | "payment" | "staff";
  /** Travels with the notification, so a tap opens the right screen. */
  data: { type: string; space: string; id: string };
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * Words the alert for one job from the queue. Null when the job is of a kind nobody is told about.
 *
 * An alert only ever goes to people who could open what it is about, so it can say what that is.
 */
export function alertWords(payload: Record<string, unknown>, space: { id: string; name: string }): AlertWords | null {
  const type = text(payload.type);
  if (type === "setup") {
    const side = payload.side === "sell" ? "Sell" : "Buy";
    return {
      title: space.name,
      body: `New setup: ${text(payload.pair)} · ${side}`,
      vipOnly: payload.audience !== "everyone",
      kind: "setup",
      data: { type, space: space.id, id: text(payload.post_id) },
    };
  }
  if (type === "lesson") {
    return {
      title: space.name,
      body: `New lesson: ${text(payload.title)}`,
      vipOnly: true,
      kind: "lesson",
      data: { type, space: space.id, id: text(payload.lesson_id) },
    };
  }
  if (type === "live") {
    return {
      title: space.name,
      body: `Live now: ${text(payload.title)}`,
      vipOnly: payload.audience !== "everyone",
      kind: "live",
      data: { type, space: space.id, id: text(payload.session_id) },
    };
  }
  if (type === "class") {
    // No time in the words: every member is in their own time zone, and the app shows it in theirs.
    return {
      title: space.name,
      body: `New class: ${text(payload.title)}. Open Floor to see when.`,
      vipOnly: payload.audience !== "everyone",
      kind: "live",
      data: { type, space: space.id, id: text(payload.session_id) },
    };
  }
  if (type === "payment") {
    const days = typeof payload.days === "number" ? payload.days : 0;
    const name = text(payload.name) || "A member";
    return {
      title: space.name,
      body:
        payload.vip === false
          ? `${name} paid by card, but is no longer in your space. No VIP was given.`
          : `${name} paid by card. ${days} ${days === 1 ? "day" : "days"} of VIP added.`,
      vipOnly: true,
      kind: "payment",
      data: { type, space: space.id, id: text(payload.payment_id) },
    };
  }
  if (type === "payment_problem") {
    return {
      title: space.name,
      body: "A member could not pay by card. Open your mentor page on the web to see why.",
      vipOnly: true,
      kind: "payment",
      data: { type, space: space.id, id: "" },
    };
  }
  if (type === "report") {
    const group = text(payload.group);
    return {
      title: space.name,
      body: `A member reported a message${group ? ` in ${group}` : ""}. Open Reported messages to look at it.`,
      vipOnly: true,
      kind: "staff",
      data: { type, space: space.id, id: text(payload.message_id) },
    };
  }
  return null;
}

/** Cuts a list into pieces of at most `size`. The notification service takes 100 at a time. */
export function inPieces<T>(list: T[], size: number): T[][] {
  const pieces: T[][] = [];
  for (let start = 0; start < list.length; start += size) pieces.push(list.slice(start, start + size));
  return pieces;
}
