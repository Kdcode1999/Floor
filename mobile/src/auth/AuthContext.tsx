import type { SupabaseClient } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { AppState } from "react-native";

import { forgetAddress } from "@/features/alerts/push";
import { getDeviceId } from "@/lib/deviceId";
import { supabase } from "@/lib/supabase";
import { sampleSession } from "@/sample/session";

import { ApiError, type AccessApi } from "./access";
import { createAuthStore, type AuthSnapshot } from "./authStore";

/** How often an open app asks whether its login is still the current one. */
const RECHECK_EVERY_MS = 5 * 60_000;

/** The two database functions behind "one login at a time", called through Supabase. */
function accessApi(client: SupabaseClient): AccessApi {
  const call = async (name: string, args?: Record<string, unknown>) => {
    const { data, error, status } = await client.rpc(name, args);
    if (error) {
      // 401 means the server rejected the login itself, not just this request.
      throw new ApiError(error.message, status === 401 || error.message === "not_signed_in");
    }
    return String(data);
  };
  return {
    claimSession: (deviceId) => call("claim_session", { p_device_id: deviceId }),
    sessionStatus: () => call("session_status"),
  };
}

// One store for the life of the app. Null when there is no backend to sign in to.
const store = supabase
  ? createAuthStore({ auth: supabase.auth, api: accessApi(supabase), deviceId: getDeviceId })
  : null;

// Without a backend the app shows its sample space, as one of the sample's own people. There
// is no sign-in: the Account screen chooses whose eyes to look through.
const samples = new Map<string, AuthSnapshot>();
function getSample(): AuthSnapshot {
  const person = sampleSession.person();
  let snapshot = samples.get(person.id);
  if (!snapshot) {
    snapshot = { status: "ready", user: { id: person.id, email: person.email }, detail: null };
    samples.set(person.id, snapshot);
  }
  return snapshot;
}

interface AuthContextValue extends AuthSnapshot {
  /** True when the app runs on sample content because mobile/.env is not filled in. */
  sample: boolean;
  /** Emails a 6-digit code. Resolves with a message to show if it failed, or null. */
  sendCode: (email: string) => Promise<string | null>;
  /** Checks the code. Resolves with a message to show if it failed, or null. */
  verifyCode: (email: string, code: string) => Promise<string | null>;
  /** Makes this phone the account's one login. Also the "Try again" after trouble. */
  useThisPhone: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const nothing = async () => {};
const notAvailable = async () => "Sign-in isn't set up in this build.";

/** Knows whether someone is signed in and whether this phone holds their one login. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(
    store ? store.subscribe : sampleSession.subscribe,
    store ? store.getSnapshot : getSample,
    store ? store.getSnapshot : getSample,
  );

  // Listen to Supabase for sign-ins and sign-outs.
  useEffect(() => store?.start(), []);

  // While signed in, ask every few minutes and whenever the app comes back into view whether
  // another phone has taken the login over.
  const ready = snapshot.status === "ready";
  useEffect(() => {
    if (!store || !ready) return;
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") store.recheck();
    });
    const timer = setInterval(store.recheck, RECHECK_EVERY_MS);
    return () => {
      listener.remove();
      clearInterval(timer);
    };
  }, [ready]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...snapshot,
      sample: store === null,
      sendCode: store ? store.sendCode : notAvailable,
      verifyCode: store ? store.verifyCode : notAvailable,
      useThisPhone: store ? store.useThisPhone : nothing,
      signOut: store
        ? async () => {
            // A signed-out phone gets no more alerts for this account.
            if (supabase) await forgetAddress(supabase);
            await store.signOut();
          }
        : nothing,
    }),
    [snapshot],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
