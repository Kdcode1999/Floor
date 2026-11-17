import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, type AccessApi } from "../src/auth/access";
import { createAuthStore, type AuthClient } from "../src/auth/authStore";

const ADA = { user: { id: "user-ada", email: "ada@example.com" } };

/** A stand-in for Supabase's sign-in client and the two database functions. */
function backend(options: { kept?: typeof ADA | null } = {}) {
  let listener: ((event: string, session: typeof ADA | null) => void) | null = null;
  const world = {
    /** What the database will answer. An Error is thrown instead. */
    claim: "ok" as string | Error,
    status: "ok" as string | Error,
    verifyError: null as { code: string; status: number } | null,
    sendError: null as { code: string; status: number } | null,
    claims: [] as string[],
    signOuts: 0,
  };
  const answer = async (value: string | Error) => {
    if (value instanceof Error) throw value;
    return value;
  };
  const auth: AuthClient = {
    onAuthStateChange(callback) {
      listener = callback;
      // Supabase reports the kept login, or its absence, shortly after subscribing.
      setTimeout(() => callback("INITIAL_SESSION", options.kept ?? null), 0);
      return { data: { subscription: { unsubscribe: () => (listener = null) } } };
    },
    signInWithOtp: async () => ({ error: world.sendError }),
    verifyOtp: async () => {
      if (world.verifyError) return { error: world.verifyError };
      listener?.("SIGNED_IN", ADA);
      return { error: null };
    },
    signOut: async () => {
      world.signOuts++;
      listener?.("SIGNED_OUT", null);
      return { error: null };
    },
  };
  const api: AccessApi = {
    claimSession: (deviceId) => {
      world.claims.push(deviceId);
      return answer(world.claim);
    },
    sessionStatus: () => answer(world.status),
  };
  const store = createAuthStore({ auth, api, deviceId: async () => "this-phone-0123456789", retryAfterMs: 1000 });
  return { store, world };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Lets pending timers and promises run. */
const settle = () => vi.advanceTimersByTimeAsync(10);

describe("opening the app", () => {
  it("starts out loading, then shows sign-in when no login was kept", async () => {
    const { store } = backend();
    expect(store.getSnapshot().status).toBe("loading");
    store.start();
    await settle();
    expect(store.getSnapshot()).toEqual({ status: "signed_out", user: null, detail: null });
  });

  it("lets a kept login in when it is still the current one", async () => {
    const { store, world } = backend({ kept: ADA });
    store.start();
    await settle();
    expect(store.getSnapshot().status).toBe("ready");
    expect(store.getSnapshot().user).toEqual({ id: "user-ada", email: "ada@example.com" });
    expect(world.claims).toEqual([]); // It asked. It did not take over.
  });

  it("stops a kept login that another phone has replaced", async () => {
    const { store, world } = backend({ kept: ADA });
    world.status = "not_current";
    store.start();
    await settle();
    expect(store.getSnapshot().status).toBe("elsewhere");
    expect(world.claims).toEqual([]);
  });

  it("signs out a kept login the server no longer accepts", async () => {
    const { store, world } = backend({ kept: ADA });
    world.status = new ApiError("JWT expired", true);
    store.start();
    await settle();
    expect(store.getSnapshot().status).toBe("signed_out");
    expect(world.signOuts).toBe(1);
  });

  it("lets a kept login in on a dead connection, then stops it once the server answers", async () => {
    const { store, world } = backend({ kept: ADA });
    world.status = new Error("Network request failed");
    store.start();
    await settle();
    expect(store.getSnapshot().status).toBe("ready");

    world.status = "not_current";
    await vi.advanceTimersByTimeAsync(1100);
    expect(store.getSnapshot().status).toBe("elsewhere");
  });
});

describe("signing in with a code", () => {
  it("claims the login for this phone and lets the person in", async () => {
    const { store, world } = backend();
    store.start();
    await settle();

    expect(await store.sendCode(" ada@example.com ")).toBeNull();
    const seen: string[] = [];
    store.subscribe(() => seen.push(store.getSnapshot().status));
    expect(await store.verifyCode("ada@example.com", "123456")).toBeNull();
    await settle();

    expect(world.claims).toEqual(["this-phone-0123456789"]);
    expect(store.getSnapshot().status).toBe("ready");
    expect(seen).toContain("signing_in"); // The code screen stays up while the phone is claimed.
    expect(seen).not.toContain("loading");
  });

  it("gives a message and stays signed out when the code is wrong", async () => {
    const { store, world } = backend();
    store.start();
    await settle();
    world.verifyError = { code: "otp_expired", status: 403 };
    expect(await store.verifyCode("ada@example.com", "000000")).toMatch(/wrong or has run out/);
    expect(store.getSnapshot().status).toBe("signed_out");
    expect(world.claims).toEqual([]);
  });

  it("gives a message when the code cannot be sent", async () => {
    const { store, world } = backend();
    store.start();
    await settle();
    world.sendError = { code: "over_email_send_rate_limit", status: 429 };
    expect(await store.sendCode("ada@example.com")).toMatch(/Wait a minute/);
  });

  it("stops at the phone limit", async () => {
    const { store, world } = backend();
    store.start();
    await settle();
    world.claim = "device_limit";
    expect(await store.verifyCode("ada@example.com", "123456")).toBeNull();
    expect(store.getSnapshot().status).toBe("device_limit");
  });

  it("reports trouble with the server's words, and recovers on Try again", async () => {
    const { store, world } = backend();
    store.start();
    await settle();
    world.claim = new ApiError("Could not find the function public.claim_session");
    await store.verifyCode("ada@example.com", "123456");
    expect(store.getSnapshot()).toMatchObject({
      status: "trouble",
      detail: "Could not find the function public.claim_session",
    });

    world.claim = "ok";
    await store.useThisPhone();
    expect(store.getSnapshot().status).toBe("ready");
  });
});

describe("while signed in", () => {
  it("notices on a recheck that another phone has taken over", async () => {
    const { store, world } = backend({ kept: ADA });
    store.start();
    await settle();
    world.status = "not_current";
    store.recheck();
    await settle();
    expect(store.getSnapshot().status).toBe("elsewhere");
  });

  it("takes the login back with Use this phone", async () => {
    const { store, world } = backend({ kept: ADA });
    world.status = "not_current";
    store.start();
    await settle();
    await store.useThisPhone();
    expect(world.claims).toEqual(["this-phone-0123456789"]);
    expect(store.getSnapshot().status).toBe("ready");
  });

  it("does not recheck, and so cannot loop, while stopped at the phone limit", async () => {
    const { store, world } = backend({ kept: ADA });
    world.status = "not_current";
    world.claim = "device_limit";
    store.start();
    await settle();
    await store.useThisPhone();
    expect(store.getSnapshot().status).toBe("device_limit");
    store.recheck();
    await settle();
    expect(store.getSnapshot().status).toBe("device_limit");
  });

  it("signs out of this phone", async () => {
    const { store } = backend({ kept: ADA });
    store.start();
    await settle();
    await store.signOut();
    expect(store.getSnapshot()).toEqual({ status: "signed_out", user: null, detail: null });
  });
});
