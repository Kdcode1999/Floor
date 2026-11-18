"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import { sendCodeMessage, verifyCodeMessage } from "@/auth/messages";
import { supabase } from "@/lib/supabase";

/**
 * Who is signed in on this browser, for the pages a mentor or Floor's own staff use.
 * Sign-in is the same emailed code as everywhere else.
 */
export function useSession() {
  /** Undefined until the browser has said whether someone is signed in. */
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  return {
    session,
    email: session?.user.email ?? null,
    userId: session?.user.id ?? null,

    /** Emails a code. Resolves with a sentence to show if it failed, or null. */
    async sendCode(email: string): Promise<string | null> {
      if (!supabase) return "Sign-in isn't set up here yet.";
      // Only people who already have an account use these pages, so none is created here.
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
      if (error?.code === "otp_disabled" || error?.message.includes("Signups not allowed")) {
        return "No account uses that email. Use the one you sign in to the Floor app with.";
      }
      return error ? sendCodeMessage(error) : null;
    },

    async verifyCode(email: string, code: string): Promise<string | null> {
      if (!supabase) return "Sign-in isn't set up here yet.";
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: "email" });
      return error ? verifyCodeMessage(error) : null;
    },

    async signOut(): Promise<void> {
      await supabase?.auth.signOut({ scope: "local" });
    },
  };
}

export type SessionTools = ReturnType<typeof useSession>;
