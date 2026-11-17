// Keeps track of whether someone is signed in and whether this phone holds their one login.
// No screen code in here, so it can be tested on a computer with stand-ins. See tests/.

import { checkLogin, claimLogin, type AccessApi, type AccessResult } from "./access";
import { sendCodeMessage, verifyCodeMessage, type AuthFailure } from "./messages";

export type AuthStatus =
  /** Finding out whether there is a login, and whether it is still the current one. */
  | "loading"
  | "signed_out"
  /** The code was right. This phone is being made the account's one login. */
  | "signing_in"
  /** Signed in, on the phone that holds the login. */
  | "ready"
  /** Another phone has taken the login over. */
  | "elsewhere"
  /** The account has moved between phones too often to move to this one now. */
  | "device_limit"
  /** The server could not be asked. */
  | "trouble";

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthSnapshot {
  status: AuthStatus;
  user: AuthUser | null;
  /** The server's own words when status is "trouble". */
  detail: string | null;
}

interface SessionLike {
  user: { id: string; email?: string };
}

type Failed = { error: AuthFailure | null };

/** The parts of Supabase's sign-in client the store uses. */
export interface AuthClient {
  onAuthStateChange(callback: (event: string, session: SessionLike | null) => void): {
    data: { subscription: { unsubscribe(): void } };
  };
  signInWithOtp(credentials: { email: string; options?: { shouldCreateUser?: boolean } }): Promise<Failed>;
  verifyOtp(params: { email: string; token: string; type: "email" }): Promise<Failed>;
  signOut(options: { scope: "local" }): Promise<Failed>;
}

export interface AuthStoreOptions {
  auth: AuthClient;
  api: AccessApi;
  /** The id the database knows this phone by. */
  deviceId: () => Promise<string>;
  /** How long to wait before asking again after the server could not be reached. */
  retryAfterMs?: number;
}

export type AuthStore = ReturnType<typeof createAuthStore>;

export function createAuthStore({ auth, api, deviceId, retryAfterMs = 15_000 }: AuthStoreOptions) {
  let session: SessionLike | null = null;
  /** True once Supabase has said whether a login was kept from last time. */
  let restored = false;
  let signingIn = false;
  /** Where this login stands. Null until the server has been asked. */
  let result: AccessResult | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const listeners = new Set<() => void>();
  let snapshot = derive();

  function derive(): AuthSnapshot {
    const user = session ? { id: session.user.id, email: session.user.email ?? "" } : null;
    let status: AuthStatus;
    if (!restored) status = "loading";
    else if (!session) status = "signed_out";
    else if (!result) status = signingIn ? "signing_in" : "loading";
    else if (result.access === "ok") status = "ready";
    else if (result.access === "elsewhere" || result.access === "device_limit") status = result.access;
    else status = "trouble";
    return { status, user, detail: result?.detail ?? null };
  }

  function emit() {
    const next = derive();
    const same =
      next.status === snapshot.status &&
      next.detail === snapshot.detail &&
      next.user?.id === snapshot.user?.id &&
      next.user?.email === snapshot.user?.email;
    if (same) return;
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function cancelRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }

  /** Records the server's answer. "signed_out" means the login is dead, so drop it. */
  async function apply(next: AccessResult) {
    if (next.access === "signed_out") {
      await auth.signOut({ scope: "local" });
      return;
    }
    result = next;
    emit();
  }

  /** Make this phone the account's one login. Used after signing in and for "Use this phone". */
  async function claim(): Promise<AccessResult> {
    cancelRetry();
    const next = await claimLogin(api, await deviceId());
    if (session) await apply(next);
    return next;
  }

  /** Ask whether this is still the account's one login. Never takes it over. */
  async function check() {
    cancelRetry();
    const asked = session?.user.id;
    if (!asked) return;
    const next = await checkLogin(api);
    if (session?.user.id !== asked) return; // Signed out, or someone else signed in, meanwhile.
    if (next === "unknown") {
      // The server cannot be reached. Let them in rather than lock them out on a weak
      // connection, and ask again shortly. The database still guards the content.
      if (!result) {
        result = { access: "ok" };
        emit();
      }
      retryTimer = setTimeout(() => void check(), retryAfterMs);
      return;
    }
    await apply(next);
  }

  function onAuthChange(event: string, next: SessionLike | null) {
    session = next;
    if (event === "INITIAL_SESSION") restored = true;
    if (!next) {
      result = null;
      signingIn = false;
      cancelRetry();
    } else if (!result && !signingIn) {
      // A login kept from last time. Supabase asks that its client is not called from inside
      // this callback, so ask the server a moment later.
      setTimeout(() => void check(), 0);
    }
    emit();
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,

    /** Starts listening to Supabase. Returns a function that stops it. */
    start() {
      const { data } = auth.onAuthStateChange(onAuthChange);
      return () => {
        data.subscription.unsubscribe();
        cancelRetry();
      };
    },

    /** Emails a 6-digit code. Resolves with a message to show if it failed, or null. */
    async sendCode(email: string): Promise<string | null> {
      const { error } = await auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
      return error ? sendCodeMessage(error) : null;
    },

    /** Checks the code and, if right, makes this phone the account's one login. */
    async verifyCode(email: string, code: string): Promise<string | null> {
      signingIn = true;
      emit();
      try {
        const { error } = await auth.verifyOtp({ email: email.trim(), token: code, type: "email" });
        if (error) return verifyCodeMessage(error);
        const next = await claim();
        return next.access === "signed_out" ? "That didn't work. Ask for a new code and try again." : null;
      } finally {
        signingIn = false;
        emit();
      }
    },

    /** Take the login over on this phone. Also the "Try again" after trouble. */
    async useThisPhone() {
      await claim();
    },

    /** Ask again whether this phone still holds the login. Only while all is well. */
    recheck() {
      if (snapshot.status === "ready") void check();
    },

    /** Signs out of this phone only. Works without a connection. */
    async signOut() {
      await auth.signOut({ scope: "local" });
    },
  };
}
