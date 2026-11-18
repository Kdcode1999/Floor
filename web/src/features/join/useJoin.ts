"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";

import { sendCodeMessage, verifyCodeMessage } from "@/auth/messages";
import { payMessage, type CardSettings } from "@/features/pay/logic";
import { callServer, ServerError } from "@/lib/server";
import { supabase } from "@/lib/supabase";

import {
  inviteMessage,
  nameMessage,
  proofMessage,
  proofPath,
  proofProblem,
  type AccessRequest,
  type Membership,
  type PublicSpace,
  type RequestKind,
  type Settings,
} from "./logic";

/** What the page knows about the signed-in visitor and this space. */
interface Loaded {
  userId: string;
  membership: Membership | null;
  settings: Settings | null;
  /** The space's price and card processor as they are right now. The page itself may be a few minutes old. */
  card: (CardSettings & { vip_days: number }) | null;
  requests: AccessRequest[];
  displayName: string;
}

/** How often the page looks again while a request is waiting for the mentor. */
const WAITING_RECHECK_MS = 20_000;

async function load(client: SupabaseClient, space: PublicSpace, userId: string, join: boolean): Promise<Loaded> {
  if (join) {
    // Safe to call again: it changes nothing for someone who is already a member.
    const { error } = await client.rpc("join_space", { p_slug: space.slug });
    if (error && error.message !== "banned") throw new Error(error.message);
  }

  const [membership, profile] = await Promise.all([
    client.from("memberships").select("role,status,vip_until").eq("space_id", space.id).eq("user_id", userId).maybeSingle(),
    client.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
  ]);
  if (membership.error) throw new Error(membership.error.message);

  const mine = (membership.data as Membership | null) ?? null;
  let settings: Settings | null = null;
  let card: Loaded["card"] = null;
  let requests: AccessRequest[] = [];
  if (mine?.status === "active") {
    // How to pay is only shown to people who have joined.
    const [settingsRow, cardRow, requestRows] = await Promise.all([
      client.from("space_settings").select("payment_link,payment_instructions,broker_link,broker_vip_days").eq("space_id", space.id).maybeSingle(),
      client.from("spaces").select("card_provider,card_test,vip_price_cents,vip_currency,vip_days").eq("id", space.id).maybeSingle(),
      client
        .from("access_requests")
        .select("kind,status,decline_reason,created_at")
        .eq("space_id", space.id)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    settings = (settingsRow.data as Settings | null) ?? null;
    card = (cardRow.data as Loaded["card"]) ?? null;
    requests = (requestRows.data as AccessRequest[] | null) ?? [];
  }

  return {
    userId,
    membership: mine,
    settings,
    card,
    requests,
    displayName: (profile.data as { display_name: string } | null)?.display_name ?? "Member",
  };
}

/** Everything the join page does: who is looking, their place in the space, and the ways in. */
export function useJoin(space: PublicSpace) {
  /** Undefined until the browser has said whether someone is signed in. */
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);
  const [wantsToJoin, setWantsToJoin] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !userId) return;
    let current = true;
    load(supabase, space, userId, wantsToJoin).then(
      (next) => {
        if (!current) return;
        setLoaded(next);
        setTrouble(null);
      },
      (error: Error) => current && setTrouble(error.message),
    );
    return () => {
      current = false;
    };
  }, [space, userId, wantsToJoin, round]);

  const mine = loaded && loaded.userId === userId ? loaded : null;
  const reload = useCallback(() => setRound((count) => count + 1), []);

  // While the mentor has not answered a request yet, look again every so often.
  const waiting = mine?.requests.some((request) => request.status === "pending") ?? false;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(reload, WAITING_RECHECK_MS);
    return () => clearInterval(timer);
  }, [waiting, reload]);

  return {
    signedIn: session === undefined ? undefined : session !== null,
    email: session?.user.email ?? "",
    membership: userId ? (mine ? mine.membership : undefined) : undefined,
    settings: mine?.settings ?? null,
    card: mine?.card ?? null,
    requests: mine?.requests ?? [],
    displayName: mine?.displayName,
    wantsToJoin,
    /** The server's own words when the visitor's details could not be loaded. */
    trouble,
    reload,

    /** The visitor pressed Join. Signed out, that leads to sign-in. Signed in, it joins them. */
    join: () => setWantsToJoin(true),
    cancelJoin: () => setWantsToJoin(false),

    /** Emails a 6-digit code. Resolves with a message to show if it failed, or null. */
    async sendCode(email: string): Promise<string | null> {
      if (!supabase) return "Sign-in isn't set up here yet.";
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
      return error ? sendCodeMessage(error) : null;
    },

    async verifyCode(email: string, code: string): Promise<string | null> {
      if (!supabase) return "Sign-in isn't set up here yet.";
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: "email" });
      return error ? verifyCodeMessage(error) : null;
    },

    /** Saves what the mentor will see this person called. */
    async saveName(name: string): Promise<string | null> {
      if (!supabase || !userId) return "Sign in first.";
      const { error } = await supabase.from("profiles").update({ display_name: name.trim() }).eq("id", userId);
      if (error) return nameMessage(error);
      reload();
      return null;
    },

    /** Uses an invite code. VIP starts at once. */
    async redeem(code: string): Promise<string | null> {
      if (!supabase) return "Sign in first.";
      const { error } = await supabase.rpc("redeem_invite", { p_code: code.trim(), p_space: space.id });
      if (error) return inviteMessage(error);
      reload();
      return null;
    },

    /** Uploads a proof and puts the request in the mentor's queue. */
    async sendProof(kind: RequestKind, file: File, note: string): Promise<string | null> {
      if (!supabase || !userId) return "Sign in first.";
      const problem = proofProblem(file);
      if (problem) return problem;
      const path = proofPath(space.id, userId, file.name, Date.now());
      const upload = await supabase.storage.from("proofs").upload(path, file, { contentType: file.type });
      if (upload.error) return "The file couldn't be uploaded. Check your connection and try again.";
      const { error } = await supabase.rpc("request_access", {
        p_space: space.id,
        p_kind: kind,
        p_proof_path: path,
        p_note: note.trim() || null,
      });
      if (error) return proofMessage(error);
      reload();
      return null;
    },

    /**
     * Starts a card payment and sends the member to the processor's page. Resolves with a
     * message to show if it could not be started. When it works the browser leaves this page.
     */
    async payByCard(): Promise<string | null> {
      try {
        const { url } = await callServer<{ url: string }>("/api/pay/start", { space: space.id });
        window.location.assign(url);
        return null;
      } catch (error) {
        return payMessage(error instanceof ServerError ? error.code : null, space.name);
      }
    },

    async signOut() {
      setWantsToJoin(false);
      await supabase?.auth.signOut({ scope: "local" });
    },
  };
}

export type Join = ReturnType<typeof useJoin>;
