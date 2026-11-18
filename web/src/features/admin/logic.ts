// Floor's own page for reports and suspension: its plain logic. Tested in tests/.

/** One open report, as the database lists it for Floor. */
export interface ReportRow {
  id: string;
  space_id: string;
  space_name: string;
  slug: string;
  space_status: "active" | "suspended";
  reason: string;
  details: string | null;
  /** The name the reporter goes by. Never their email. */
  reporter: string;
  created_at: string;
}

/** A space, as Floor sees it when judging one. */
export interface SpaceRow {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended";
  created_at: string;
  members: number;
  vip: number;
  open_reports: number;
  /** What Floor told the mentor when it suspended the space. */
  note: string | null;
}

/** The reasons a member can pick, in the words Floor's page shows. */
export const REASON_WORDS: Record<string, string> = {
  scam: "A scam",
  guaranteed_profits: "Promises guaranteed profits",
  asks_for_money: "Asks members to hand over trading money",
  abuse: "Abuse or harassment",
  other: "Something else",
};

export const reasonWords = (reason: string) => REASON_WORDS[reason] ?? "Something else";

/** Reports about one space, together. */
export interface ReportGroup {
  spaceId: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  reports: ReportRow[];
}

/** Groups the open reports by space, the space with the newest report first. */
export function groupReports(rows: ReportRow[]): ReportGroup[] {
  const groups = new Map<string, ReportGroup>();
  for (const row of rows) {
    const group = groups.get(row.space_id) ?? { spaceId: row.space_id, name: row.space_name, slug: row.slug, status: row.space_status, reports: [] };
    group.reports.push(row);
    groups.set(row.space_id, group);
  }
  const newest = (group: ReportGroup) => Math.max(...group.reports.map((report) => Date.parse(report.created_at)));
  return [...groups.values()].sort((a, b) => newest(b) - newest(a));
}

/** "3 members, 1 VIP". */
export function sizeLine(space: Pick<SpaceRow, "members" | "vip">): string {
  return `${space.members} ${space.members === 1 ? "member" : "members"}, ${space.vip} VIP`;
}

/** What to say when one of Floor's own actions failed. */
export function adminMessage(message: string | null | undefined): string {
  if (message === "not_allowed") return "Only Floor's own team can do that.";
  if (message === "note_needed") return "Write a note for the mentor first: what the problem is and what would fix it.";
  if (message === "space_not_found") return "That space no longer exists.";
  return "That couldn't be done. Try again.";
}
