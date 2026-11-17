// The rules for "one login at a time, one phone per account", as the phone app applies them.
// The database enforces them (claim_session and session_status in the migrations). This file
// only decides what the app shows. Plain logic, tested in tests/.

/**
 * Where this login stands.
 * - "ok": this phone holds the account's one login.
 * - "elsewhere": another phone has taken over.
 * - "device_limit": the account has moved between phones too often to move again now.
 * - "signed_out": the server no longer accepts this login at all.
 * - "trouble": the server could not be asked, or gave an answer we do not understand.
 */
export type Access = "ok" | "elsewhere" | "device_limit" | "signed_out" | "trouble";

/** The two database functions behind the rules. Each rejects with an `ApiError` on failure. */
export interface AccessApi {
  /** Makes this login the account's one login, on this phone. Answers "ok" or "device_limit". */
  claimSession(deviceId: string): Promise<string>;
  /** Answers "ok", "not_current" or "signed_out". */
  sessionStatus(): Promise<string>;
}

/** A failed call to the server. `notSignedIn` is true when the server rejected the login itself. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly notSignedIn = false,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface AccessResult {
  access: Access;
  /** The server's own words when something went wrong, for the person fixing it. */
  detail?: string;
}

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Run straight after someone signs in: make this phone the account's one login.
 * Signing in is a deliberate act, so it takes over from any other phone.
 */
export async function claimLogin(api: AccessApi, deviceId: string): Promise<AccessResult> {
  try {
    const answer = await api.claimSession(deviceId);
    if (answer === "ok") return { access: "ok" };
    if (answer === "device_limit") return { access: "device_limit" };
    return { access: "trouble", detail: `Unexpected answer: ${answer}` };
  } catch (error) {
    if (error instanceof ApiError && error.notSignedIn) return { access: "signed_out" };
    return { access: "trouble", detail: describe(error) };
  }
}

/**
 * Run when the app opens with a login it kept from last time, and every so often after that:
 * is this still the account's one login?
 *
 * It never takes over by itself. If it did, two phones would keep taking the login from each
 * other and use up the account's phone changes without anyone choosing to.
 *
 * Answers "unknown" when the server cannot be reached. The caller then carries on as before:
 * a weak connection must not lock anyone out, and the database still guards the content.
 */
export async function checkLogin(api: AccessApi): Promise<AccessResult | "unknown"> {
  try {
    const answer = await api.sessionStatus();
    if (answer === "ok") return { access: "ok" };
    if (answer === "not_current") return { access: "elsewhere" };
    if (answer === "signed_out") return { access: "signed_out" };
    return "unknown";
  } catch (error) {
    if (error instanceof ApiError && error.notSignedIn) return { access: "signed_out" };
    return "unknown";
  }
}
