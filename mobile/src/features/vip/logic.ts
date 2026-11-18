// Getting VIP: what counts as proof, where it is kept, and how requests and refusals are worded.
// Shared by the join page and the phone app: the two copies must stay identical (a test in
// web/tests/join.test.ts checks). No browser or phone code in here.

export type RequestKind = "payment" | "broker";

/** A request for VIP someone has sent. Mirrors `access_requests`. */
export interface AccessRequest {
  kind: RequestKind;
  status: "pending" | "approved" | "declined";
  decline_reason: string | null;
  created_at: string;
}

export interface Failure {
  message?: string | null;
  code?: string | null;
}

export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PROOF_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** What is wrong with a file offered as proof, or null when it is fine. The storage bucket enforces the same. */
export function proofProblem(file: { size: number; type: string }): string | null {
  if (!PROOF_TYPES.includes(file.type)) return "Use a photo (JPG, PNG or WebP) or a PDF.";
  if (file.size > PROOF_MAX_BYTES) return "That file is over 5 MB. Use a smaller one.";
  if (file.size === 0) return "That file is empty.";
  return null;
}

/**
 * Where a proof file is kept: `<space>/<member>/<time>-<name>`. The database only accepts a
 * request whose file sits under the member's own folder in that space.
 */
export function proofPath(spaceId: string, userId: string, fileName: string, now: number): string {
  const dot = fileName.lastIndexOf(".");
  const extension = dot >= 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) : "";
  const stem = (dot >= 0 ? fileName.slice(0, dot) : fileName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${spaceId}/${userId}/${now}-${stem || "proof"}${extension ? `.${extension}` : ""}`;
}

/** The newest request of each kind. */
export function latestRequests(requests: AccessRequest[]): Partial<Record<RequestKind, AccessRequest>> {
  const latest: Partial<Record<RequestKind, AccessRequest>> = {};
  for (const request of requests) {
    const current = latest[request.kind];
    if (!current || Date.parse(request.created_at) > Date.parse(current.created_at)) latest[request.kind] = request;
  }
  return latest;
}

/** What to say about a declined request, above the form to send another. */
export function declinedLine(request: AccessRequest): string {
  return `Your last one was not accepted${request.decline_reason ? `: ${request.decline_reason}` : "."} You can send another.`;
}

/** What to say when using an invite code failed. */
export function inviteMessage(failure: Failure): string {
  const message = failure.message ?? "";
  if (message === "invite_invalid") return "That code doesn't work. Check it with your mentor.";
  if (message === "invite_already_used") return "You've already used that code.";
  if (message === "banned") return "You can't join this space.";
  return "The code couldn't be checked. Try again.";
}

/** What to say when sending a proof failed. */
export function proofMessage(failure: Failure): string {
  const message = failure.message ?? "";
  if (message === "already_pending") return "You've already sent one. Wait for your mentor to check it.";
  if (message === "banned") return "You can't join this space.";
  if (message === "space_unavailable") return "This space isn't open right now.";
  return "That couldn't be sent. Check your connection and try again.";
}
