"use client";

import { useEffect, useState } from "react";

import { Avatar, Button, Card } from "@/components/ui";
import { SignInCard } from "@/features/session/SignInCard";
import { useSession } from "@/features/session/useSession";
import { backendConfigured, logoUrl } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import { themeFor, themes } from "@/theme/themes";
import { themeVars } from "@/theme/vars";

import { CardPayments } from "./CardPayments";
import { Course } from "./Course";
import { Live } from "./Live";

/** A space the signed-in person helps run. */
export interface StaffSpace {
  id: string;
  slug: string;
  name: string;
  theme: string;
  logo_path: string | null;
  role: "mentor" | "admin" | "member";
}

type Tool = "course" | "live" | "payments";

/**
 * The mentor's laptop page: the jobs that are easier with a big screen and a fast connection.
 * Building the course and uploading lesson videos, going live with a shared screen, and
 * connecting a card processor, which means copying a key out of that processor's own website.
 */
export function MentorApp() {
  const tools = useSession();
  const { session, userId } = tools;
  const [tool, setTool] = useState<Tool>("course");
  /** The spaces this person runs. Undefined while they are being loaded. */
  const [spaces, setSpaces] = useState<
    { user: string; list: StaffSpace[]; trouble: string | null } | undefined
  >(undefined);
  const [chosen, setChosen] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!supabase || !userId) return;
    let current = true;
    supabase.rpc("my_spaces").then(({ data, error }) => {
      if (!current) return;
      const list = ((data ?? []) as StaffSpace[]).filter(
        (space) => space.role !== "member",
      );
      setSpaces({ user: userId, list, trouble: error ? error.message : null });
    });
    return () => {
      current = false;
    };
  }, [userId, attempt]);

  const mine = spaces && spaces.user === userId ? spaces : undefined;
  const space = mine
    ? mine.list.length === 1
      ? mine.list[0]
      : (mine.list.find((each) => each.id === chosen) ?? null)
    : null;
  const theme = space ? themeFor(space.theme) : themes.night;

  return (
    <main className="space" style={themeVars(theme)}>
      <div className="column wide">
        <header className="bar">
          {space ? (
            <Avatar
              name={space.name}
              image={space.logo_path ? logoUrl(space.logo_path) : null}
            />
          ) : null}
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="small strong">Floor · Mentor tools</p>
            {space ? <h1 className="h2 clip">{space.name}</h1> : null}
          </div>
          {session ? (
            <button className="link" onClick={() => void tools.signOut()}>
              Sign out
            </button>
          ) : null}
        </header>

        {!backendConfigured ? (
          <Card>
            <h1 className="h2">Not connected yet</h1>
            <p className="body">
              This copy of Floor is not connected to its database yet.
            </p>
          </Card>
        ) : session === undefined || (session && !mine) ? (
          <Card>
            <p className="body" role="status">
              One moment…
            </p>
          </Card>
        ) : !session ? (
          <SignInCard
            title="Sign in"
            detail="For mentors and their admins. Members use the Floor app."
            tools={tools}
          />
        ) : mine?.trouble ? (
          <Card>
            <h1 className="h2">Something went wrong</h1>
            <p className="body">Check your connection and try again.</p>
            <p className="small">{mine.trouble}</p>
            <Button onClick={() => setAttempt((count) => count + 1)}>
              Try again
            </Button>
          </Card>
        ) : mine && mine.list.length === 0 ? (
          <Card>
            <h1 className="h2">You don&apos;t run a space</h1>
            <p className="body">
              This page is for mentors and their admins. Start your space in the
              Floor app first, then come back here.
            </p>
            <p className="small">Signed in as {tools.email}.</p>
          </Card>
        ) : !space ? (
          <Card>
            <h1 className="h2">Which space?</h1>
            <div className="stack">
              {mine?.list.map((each) => (
                <Button
                  key={each.id}
                  kind="ghost"
                  onClick={() => setChosen(each.id)}
                >
                  {each.name}
                </Button>
              ))}
            </div>
          </Card>
        ) : (
          <>
            {/* Only the mentor connects a processor: whoever holds it receives every card payment. */}
            <div className="choices" role="tablist" aria-label="Tools">
              {(space.role === "mentor"
                ? (["course", "live", "payments"] as const)
                : (["course", "live"] as const)
              ).map((each) => (
                <button
                  key={each}
                  type="button"
                  role="tab"
                  aria-selected={tool === each}
                  className={tool === each ? "choice chosen" : "choice"}
                  onClick={() => setTool(each)}
                >
                  {each === "course"
                    ? "Course"
                    : each === "live"
                      ? "Live"
                      : "Card payments"}
                </button>
              ))}
            </div>
            {space.role === "mentor" && tool === "payments" ? (
              <CardPayments space={space} />
            ) : tool === "live" ? (
              <Live space={space} />
            ) : (
              <Course space={space} />
            )}
          </>
        )}
      </div>
    </main>
  );
}
