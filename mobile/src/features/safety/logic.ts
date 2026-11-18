// Reporting a space and what a suspended space says: plain logic, tested in tests/.

/** The reasons a member can give, as the database knows them. */
export type ReportReason = "scam" | "guaranteed_profits" | "asks_for_money" | "abuse" | "other";

/** The reasons in the order they are offered, each with a line saying what it covers. */
export const REPORT_REASONS: { value: ReportReason; label: string; detail: string }[] = [
  { value: "guaranteed_profits", label: "Promises guaranteed profits", detail: "Says members will make money, or cannot lose." },
  { value: "asks_for_money", label: "Asks for trading money", detail: "Wants members to send money to trade for them, or to hand over an account." },
  { value: "scam", label: "A scam", detail: "Took payment and gave nothing, or is not who they say they are." },
  { value: "abuse", label: "Abuse or harassment", detail: "Threats, hate or harassment, in posts, chats or live sessions." },
  { value: "other", label: "Something else", detail: "Tell us below." },
];

export const DETAILS_MAX = 1000;

/** What is wrong with a report before it is sent, or null. "Something else" needs a few words. */
export function reportProblem(reason: ReportReason | null, details: string): string | null {
  if (!reason) return "Choose what is wrong.";
  if (reason === "other" && details.trim().length < 10) return "Tell us what is wrong, in a sentence or two.";
  if (details.length > DETAILS_MAX) return "That is too long. Keep it under 1,000 characters.";
  return null;
}

/** What to say when sending a report failed. */
export function reportMessage(failure: { message?: string | null }): string {
  const message = failure.message ?? "";
  if (message === "already_reported") return "You have already reported this space. Floor is looking into it.";
  if (message === "not_allowed") return "Only members of a space can report it.";
  return "Your report couldn't be sent. Check your connection and try again.";
}

/** What a member reads when the space they belong to is suspended. */
export function suspendedForMember(spaceName: string, supportEmail: string): { title: string; text: string } {
  return {
    title: `${spaceName} is closed for now`,
    text:
      "Floor has suspended this space, so nothing in it can be opened. If it opens again, everything will be where you left it." +
      (supportEmail ? ` Questions about it go to ${supportEmail}.` : ""),
  };
}

/** What the space's own staff read at the top of the app while it is suspended. */
export function suspendedForStaff(note: string | null, supportEmail: string): { title: string; text: string } {
  return {
    title: "Floor has suspended this space",
    text:
      "Members cannot open it, and nobody can join or pay." +
      (note ? ` Floor's note: “${note}”` : "") +
      (supportEmail ? ` To answer, write to ${supportEmail}.` : ""),
  };
}
