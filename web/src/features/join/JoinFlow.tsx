"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { cleanCode, CODE_LENGTH, looksLikeEmail } from "@/auth/messages";
import { Avatar, Button, Card, Field } from "@/components/ui";

import { stepFor, type PublicSpace } from "./logic";
import { MemberView } from "./MemberView";
import { useJoin, type Join } from "./useJoin";

interface JoinFlowProps {
  space: PublicSpace;
  /** "₦25,000 for 30 days", or null when the mentor has not set a price. */
  price: string | null;
}

/** A space's join page: see the space, sign in with an emailed code, join, and get VIP. */
export function JoinFlow({ space, price }: JoinFlowProps) {
  const join = useJoin(space);
  const step = stepFor({
    signedIn: join.signedIn,
    membership: join.membership,
    displayName: join.displayName,
    wantsToJoin: join.wantsToJoin,
  });

  return (
    <>
      <header style={{ display: "flex", alignItems: "center", gap: 16, paddingTop: 16 }}>
        <Avatar name={space.name} />
        <div style={{ minWidth: 0 }}>
          <h1 className="h1" style={{ overflowWrap: "anywhere" }}>
            {space.name}
          </h1>
          {space.tagline ? <p className="body">{space.tagline}</p> : null}
        </div>
      </header>

      {join.trouble ? (
        <Card>
          <h2 className="h2">Something went wrong</h2>
          <p className="body">Check your connection and try again.</p>
          <p className="small">{join.trouble}</p>
          <Button onClick={join.reload}>Try again</Button>
        </Card>
      ) : step === "loading" ? (
        <Card>
          <p className="body" role="status">
            One moment…
          </p>
        </Card>
      ) : step === "intro" ? (
        <Intro space={space} price={price} join={join} />
      ) : step === "sign-in" ? (
        <SignIn space={space} join={join} />
      ) : step === "name" ? (
        <Name join={join} />
      ) : step === "banned" ? (
        <Card>
          <h2 className="h2">You can&apos;t join this space</h2>
          <p className="body">The mentor has removed you from it.</p>
          <Button kind="ghost" onClick={join.signOut}>
            Sign out
          </Button>
        </Card>
      ) : (
        <MemberView space={space} price={price} join={join} />
      )}

      <footer className="stack" style={{ paddingTop: 8 }}>
        <p className="small center">
          Floor does not check or vouch for what a mentor claims. Trading can lose money.
        </p>
        <p className="small center">
          <Link className="link" href="/terms">
            Terms
          </Link>
          <Link className="link" href="/privacy">
            Privacy
          </Link>
        </p>
      </footer>
    </>
  );
}

function Intro({ space, price, join }: { space: PublicSpace; price: string | null; join: Join }) {
  return (
    <>
      <Card>
        <div className="rows">
          <div className="row">
            <h2 className="h3">Free</h2>
            <p className="body">Open posts and updates from {space.name}.</p>
          </div>
          <div className="row">
            <h2 className="h3">VIP{price ? ` · ${price}` : ""}</h2>
            <p className="body">Trade setups, lessons, VIP groups and live sessions.</p>
          </div>
        </div>
        <Button onClick={join.join}>Join {space.name}</Button>
        {join.signedIn ? (
          <p className="small center">
            You&apos;re signed in as <span className="strong">{join.email}</span>.{" "}
            <button className="link" onClick={join.signOut}>
              Not you?
            </button>
          </p>
        ) : (
          <p className="small center">Joining is free. You choose VIP afterwards.</p>
        )}
      </Card>
    </>
  );
}

/** Supabase sends at most one code a minute to an address. */
const RESEND_WAIT_SECONDS = 60;

function SignIn({ space, join }: { space: PublicSpace; join: Join }) {
  const [email, setEmail] = useState("");
  /** The address the code went to. Null while the visitor is still typing their email. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const send = async (address: string) => {
    if (!looksLikeEmail(address)) {
      setError("That email address doesn't look right.");
      return;
    }
    setBusy(true);
    setError(null);
    const problem = await join.sendCode(address);
    setBusy(false);
    if (problem) {
      setError(problem);
      return;
    }
    setSentTo(address.trim());
    setCode("");
    setWait(RESEND_WAIT_SECONDS);
  };

  const verify = async (value: string) => {
    if (!sentTo || value.length < CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    const problem = await join.verifyCode(sentTo, value);
    setBusy(false);
    if (problem) {
      setError(problem);
      setCode("");
    }
    // When the code is right the page moves on by itself.
  };

  if (!sentTo) {
    return (
      <Card>
        <h2 className="h2">Join {space.name}</h2>
        <form
        noValidate
          className="stack"
          style={{ gap: 16 }}
          onSubmit={(event) => {
            event.preventDefault();
            void send(email);
          }}>
          <Field
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder="you@example.com"
            value={email}
            error={error}
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
            }}
          />
          <Button type="submit" busy={busy}>
            Send code
          </Button>
        </form>
        <p className="small center">
          We&apos;ll email you a {CODE_LENGTH}-digit code. New here? The same code creates your account.
        </p>
        <button className="link" style={{ alignSelf: "center" }} onClick={join.cancelJoin}>
          Back
        </button>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="h2">Enter your code</h2>
      <p className="body">
        We sent a {CODE_LENGTH}-digit code to <span className="strong">{sentTo}</span>.
      </p>
      <form
        noValidate
        className="stack"
        style={{ gap: 16 }}
        onSubmit={(event) => {
          event.preventDefault();
          void verify(code);
        }}>
        <Field
          code
          label="Code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          value={code}
          error={error}
          onChange={(event) => {
            const next = cleanCode(event.target.value);
            setCode(next);
            setError(null);
            // No need to press the button once the last digit is in.
            if (next.length === CODE_LENGTH) void verify(next);
          }}
        />
        <Button type="submit" busy={busy} disabled={code.length < CODE_LENGTH}>
          Sign in
        </Button>
      </form>
      <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap" }}>
        <button className="link" disabled={wait > 0 || busy} onClick={() => send(sentTo)}>
          {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
        </button>
        <button
          className="link"
          onClick={() => {
            setSentTo(null);
            setError(null);
          }}>
          Use a different email
        </button>
      </div>
    </Card>
  );
}

function Name({ join }: { join: Join }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (name.trim().length === 0) {
      setError("Type the name your mentor knows you by.");
      return;
    }
    setBusy(true);
    setError(null);
    const problem = await join.saveName(name);
    setBusy(false);
    if (problem) setError(problem);
  };

  return (
    <Card>
      <h2 className="h2">You&apos;re in. What should we call you?</h2>
      <form
        noValidate
        className="stack"
        style={{ gap: 16 }}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}>
        <Field
          label="Your name"
          autoComplete="name"
          maxLength={40}
          placeholder="Ada O."
          hint="Your mentor sees this name when they approve you."
          value={name}
          error={error}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
        <Button type="submit" busy={busy}>
          Continue
        </Button>
      </form>
    </Card>
  );
}
