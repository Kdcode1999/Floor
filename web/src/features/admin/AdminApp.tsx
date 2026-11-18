"use client";

import { useEffect, useState } from "react";

import { Button, Card, Field } from "@/components/ui";
import { formatDay } from "@/features/join/logic";
import { SignInCard } from "@/features/session/SignInCard";
import { useSession } from "@/features/session/useSession";
import { backendConfigured } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import { themes } from "@/theme/themes";
import { themeVars } from "@/theme/vars";

import { adminMessage, groupReports, reasonWords, sizeLine, type ReportGroup, type ReportRow, type SpaceRow } from "./logic";

interface Loaded {
  user: string;
  /** False for anyone who is not one of Floor's own people. */
  allowed: boolean;
  reports: ReportRow[];
  trouble: string | null;
}

/**
 * Floor's own page: the reports members have sent, and suspending or restoring a space.
 * The database lets nobody but Floor's own people read or do any of it. This page only shows.
 */
export function AdminApp() {
  const tools = useSession();
  const { session, userId } = tools;
  const [loaded, setLoaded] = useState<Loaded | undefined>(undefined);
  const [round, setRound] = useState(0);
  const reload = () => setRound((count) => count + 1);

  useEffect(() => {
    if (!supabase || !userId) return;
    const client = supabase;
    let current = true;
    (async () => {
      const allowed = await client.rpc("floor_admin");
      if (allowed.error || allowed.data !== true) {
        return { user: userId, allowed: false, reports: [], trouble: allowed.error ? allowed.error.message : null };
      }
      const reports = await client.rpc("admin_reports");
      return { user: userId, allowed: true, reports: (reports.data ?? []) as ReportRow[], trouble: reports.error ? reports.error.message : null };
    })().then((next) => current && setLoaded(next));
    return () => {
      current = false;
    };
  }, [userId, round]);

  const mine = loaded && loaded.user === userId ? loaded : undefined;

  return (
    <main className="space" style={themeVars(themes.night)}>
      <div className="column wide">
        <header className="bar">
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="small strong">Floor · Our own tools</p>
            <h1 className="h2">Reports and suspension</h1>
          </div>
          {session ? (
            <button className="link" onClick={() => void tools.signOut()}>
              Sign out
            </button>
          ) : null}
        </header>

        {!backendConfigured ? (
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
          <SignInCard title="Sign in" detail="For Floor's own team." tools={tools} />
        ) : mine?.trouble ? (
          <Card>
            <h2 className="h2">Something went wrong</h2>
            <p className="small">{mine.trouble}</p>
            <Button onClick={reload}>Try again</Button>
          </Card>
        ) : !mine?.allowed ? (
          <Card>
            <h2 className="h2">This page is for Floor&apos;s own team</h2>
            <p className="body">You are signed in as {tools.email}, which is not on the team.</p>
          </Card>
        ) : (
          <>
            <Reports groups={groupReports(mine.reports)} onChange={reload} />
            <FindSpaces onChange={reload} round={round} />
          </>
        )}
      </div>
    </main>
  );
}

function Reports({ groups, onChange }: { groups: ReportGroup[]; onChange: () => void }) {
  if (groups.length === 0) {
    return (
      <Card>
        <h2 className="h2">Open reports</h2>
        <p className="body">Nothing is waiting.</p>
      </Card>
    );
  }
  return (
    <>
      {groups.map((group) => (
        <Card key={group.spaceId}>
          <span className="pill">{group.status === "suspended" ? "Suspended" : `${group.reports.length} open`}</span>
          <h2 className="h2">{group.name}</h2>
          <p className="small">/{group.slug}</p>
          <div className="rows">
            {group.reports.map((report) => (
              <div className="row" key={report.id}>
                <p className="body strong">{reasonWords(report.reason)}</p>
                {report.details ? <p className="body pre">{report.details}</p> : null}
                <p className="small">
                  {report.reporter} · {formatDay(report.created_at)}
                </p>
              </div>
            ))}
          </div>
          <SpaceActions spaceId={group.spaceId} name={group.name} status={group.status} hasReports onChange={onChange} />
        </Card>
      ))}
    </>
  );
}

function FindSpaces({ onChange, round }: { onChange: () => void; round: number }) {
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [spaces, setSpaces] = useState<SpaceRow[] | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let current = true;
    supabase.rpc("admin_spaces", { p_search: search || null }).then(({ data, error }) => {
      if (!current) return;
      setSpaces((data ?? []) as SpaceRow[]);
      setTrouble(error ? adminMessage(error.message) : null);
    });
    return () => {
      current = false;
    };
  }, [search, round]);

  return (
    <Card>
      <h2 className="h2">Spaces</h2>
      <form
        noValidate
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(typed.trim());
        }}>
        <Field label="Find a space by name or link word" autoComplete="off" value={typed} onChange={(event) => setTyped(event.target.value)} />
        <Button type="submit" kind="ghost">
          Search
        </Button>
      </form>
      {trouble ? (
        <p className="error" role="alert">
          {trouble}
        </p>
      ) : null}
      {spaces === null ? (
        <p className="body" role="status">
          One moment…
        </p>
      ) : spaces.length === 0 ? (
        <p className="body">No space matches that.</p>
      ) : (
        <div className="rows">
          {spaces.map((space) => (
            <div className="row" key={space.id}>
              <p className="body strong">
                {space.name} <span className="small">/{space.slug}</span>
              </p>
              <p className="small">
                {space.status === "suspended" ? "Suspended · " : ""}
                {sizeLine(space)} · {space.open_reports} open {space.open_reports === 1 ? "report" : "reports"} · since {formatDay(space.created_at)}
              </p>
              {space.note ? <p className="small pre">Note to the mentor: {space.note}</p> : null}
              <SpaceActions spaceId={space.id} name={space.name} status={space.status} hasReports={false} onChange={onChange} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

interface SpaceActionsProps {
  spaceId: string;
  name: string;
  status: "active" | "suspended";
  /** True where the reports are listed, so they can be closed from there. */
  hasReports: boolean;
  onChange: () => void;
}

/** Suspend with a note for the mentor, restore, or close the reports. */
function SpaceActions({ spaceId, name, status, hasReports, onChange }: SpaceActionsProps) {
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (what: string, call: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(what);
    setError(null);
    const { error: failed } = await call();
    setBusy(null);
    if (failed) return setError(adminMessage(failed.message));
    setNoting(false);
    setNote("");
    onChange();
  };

  if (!supabase) return null;
  const client = supabase;

  return (
    <div className="stack">
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {noting ? (
        <form
          noValidate
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void run("suspend", () => client.rpc("suspend_space", { p_space: spaceId, p_note: note }));
          }}>
          <div className="field">
            <label className="label" htmlFor={`note-${spaceId}`}>
              Note to the mentor of {name}
            </label>
            <textarea
              id={`note-${spaceId}`}
              className="input textarea"
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <p className="small">They read this in the app. Say what the problem is and what would fix it.</p>
          </div>
          <Button type="submit" busy={busy === "suspend"}>
            Suspend {name}
          </Button>
          <Button kind="ghost" onClick={() => setNoting(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="actions" style={{ flexWrap: "wrap" }}>
          {status === "active" ? (
            <Button kind="ghost" onClick={() => setNoting(true)}>
              Suspend…
            </Button>
          ) : (
            <Button kind="ghost" busy={busy === "restore"} onClick={() => void run("restore", () => client.rpc("restore_space", { p_space: spaceId }))}>
              Restore
            </Button>
          )}
          {hasReports ? (
            <Button kind="ghost" busy={busy === "close"} onClick={() => void run("close", () => client.rpc("close_reports", { p_space: spaceId }))}>
              Close reports
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
