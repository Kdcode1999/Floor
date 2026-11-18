// Whether a person can open a space. Plain logic, tested in tests/.

export type Role = "mentor" | "admin" | "member";

/**
 * A space Floor has suspended does not open for its members. Its mentor and admins can still
 * get in, to see what Floor said and to answer for it. The database enforces the same.
 */
export function canOpen(entry: { suspended: boolean; role: Role }): boolean {
  return !entry.suspended || entry.role !== "member";
}
