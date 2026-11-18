"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button, Card, Field } from "@/components/ui";
import { SignInCard } from "@/features/session/SignInCard";
import { useSession } from "@/features/session/useSession";
import { backendConfigured, SUPPORT_EMAIL } from "@/lib/env";
import { callServer, ServerError } from "@/lib/server";
import { supabase } from "@/lib/supabase";
import { themes } from "@/theme/themes";
import { themeVars } from "@/theme/vars";

import { deleteMessage, nameMatches, whatGoes, type AccountSummary } from "./logic";

/**
 * A person's own account on the web. Today it does one thing: delete the account, for anyone
 * who cannot or does not want to do it in the app.
 */
export function AccountApp() {
  const tools = useSession();
  const { session, userId } = tools;
  const [summary, setSummary] = useState<{ user: string; found: AccountSummary | null; trouble: string | null } | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    if (!supabase || !userId) return;
    let current = true;
    supabase.rpc("account_summary").then(({ data, error }) => {
      if (!current) return;
      setSummary({ user: userId, found: ((data ?? []) as AccountSummary[])[0] ?? null, trouble: error ? error.message : null });
    });
    return () => {
      current = false;
    };
  }, [userId, attempt]);

  const mine = summary && summary.user === userId ? summary : undefined;

  return (
    <main className="space" style={themeVars(themes.night)}>
      <div className="column">
        <p className="small strong" style={{ paddingTop: 44 }}>
          Floor
        </p>
        <h1 className="h1">Your account</h1>

        {deleted ? (
          <Card role="status">
            <h2 className="h2">Your account is deleted</h2>
            <p className="body">Everything that went with it is gone or on its way out. You can close this page.</p>
          </Card>
        ) : !backendConfigured ? (
          <Card>
            <h2 className="h2">Not connected yet</h2>
            <p className="body">This copy of Floor is not connected to its database yet.</p>
          </Card>
        ) : session === undefined || (session && !mine) ? (
          <Card>
            <p className="body" role="status">
              One moment…
            </p>
          </Card>
        ) : !session ? (
          <SignInCard title="Sign in" detail="With the email you use in the Floor app." tools={tools} />
        ) : mine?.trouble || !mine?.found ? (
          <Card>
            <h2 className="h2">Something went wrong</h2>
            <p className="body">Check your connection and try again.</p>
            {mine?.trouble ? <p className="small">{mine.trouble}</p> : null}
            <Button onClick={() => setAttempt((count) => count + 1)}>Try again</Button>
          </Card>
        ) : (
          <DeleteCard
            summary={mine.found}
            onDeleted={async () => {
              setDeleted(true);
              await tools.signOut();
            }}
            onSignOut={() => void tools.signOut()}
          />
        )}

        <p className="small center">
          <Link className="link" href="/terms">
            Terms
          </Link>
          <Link className="link" href="/privacy">
            Privacy
          </Link>
          {SUPPORT_EMAIL ? (
            <a className="link" href={`mailto:${SUPPORT_EMAIL}`}>
              Contact
            </a>
          ) : null}
        </p>
      </div>
    </main>
  );
}

function DeleteCard({ summary, onDeleted, onSignOut }: { summary: AccountSummary; onDeleted: () => Promise<void>; onSignOut: () => void }) {
  const [sure, setSure] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ownsSpace = summary.space_id !== null;

  const remove = async () => {
    if (ownsSpace && !nameMatches(typed, summary.space_name)) {
      setError(deleteMessage("name_needed"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await callServer("/api/account/delete", { spaceName: typed });
      await onDeleted();
    } catch (failure) {
      setError(deleteMessage(failure instanceof ServerError ? failure.code : null));
      setBusy(false);
    }
  };

  return (
    <>
      <Card>
        <p className="small">Signed in as</p>
        <p className="body strong" style={{ overflowWrap: "anywhere" }}>
          {summary.email}
        </p>
        <button className="link" style={{ alignSelf: "flex-start" }} onClick={onSignOut}>
          Sign out
        </button>
      </Card>

      <Card>
        <h2 className="h2">Delete your account</h2>
        <p className="body">This cannot be undone. It deletes:</p>
        <ul className="list">
          {whatGoes(summary).map((line) => (
            <li key={line} className="body">
              {line}
            </li>
          ))}
        </ul>
        <p className="small">
          Money you paid a mentor stays with the mentor. Floor never held it, so Floor cannot return it: ask the mentor.
        </p>
        {!sure ? (
          <Button kind="ghost" onClick={() => setSure(true)}>
            Delete my account
          </Button>
        ) : (
          <form
            noValidate
            className="stack"
            style={{ gap: 14 }}
            onSubmit={(event) => {
              event.preventDefault();
              void remove();
            }}>
            {ownsSpace ? (
              <Field
                label={`Type "${summary.space_name}" to confirm`}
                autoComplete="off"
                value={typed}
                error={error}
                onChange={(event) => {
                  setTyped(event.target.value);
                  setError(null);
                }}
              />
            ) : error ? (
              <p className="error" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" busy={busy}>
              Delete my account for good
            </Button>
            <Button kind="ghost" onClick={() => setSure(false)}>
              Keep my account
            </Button>
          </form>
        )}
      </Card>
    </>
  );
}
