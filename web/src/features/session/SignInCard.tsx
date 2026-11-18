"use client";

import { useEffect, useState } from "react";

import { cleanCode, CODE_LENGTH, looksLikeEmail } from "@/auth/messages";
import { Button, Card, Field } from "@/components/ui";

import type { SessionTools } from "./useSession";

/** Supabase sends at most one code a minute to an address. */
const RESEND_WAIT_SECONDS = 60;

interface SignInCardProps {
  title: string;
  /** One line under the title saying who this page is for. */
  detail: string;
  tools: SessionTools;
}

/** Sign-in by emailed code: type the email, then the six digits. */
export function SignInCard({ title, detail, tools }: SignInCardProps) {
  const [email, setEmail] = useState("");
  /** The address the code went to. Null while the email is still being typed. */
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
    if (!looksLikeEmail(address)) return setError("That email address doesn't look right.");
    setBusy(true);
    setError(null);
    const problem = await tools.sendCode(address);
    setBusy(false);
    if (problem) return setError(problem);
    setSentTo(address.trim());
    setCode("");
    setWait(RESEND_WAIT_SECONDS);
  };

  const verify = async (value: string) => {
    if (!sentTo || value.length < CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    const problem = await tools.verifyCode(sentTo, value);
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
        <h1 className="h2">{title}</h1>
        <p className="body">{detail}</p>
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
        <p className="small center">We&apos;ll email you a {CODE_LENGTH}-digit code. Use the email you sign in to the app with.</p>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="h2">Enter your code</h1>
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
            if (next.length === CODE_LENGTH) void verify(next);
          }}
        />
        <Button type="submit" busy={busy} disabled={code.length < CODE_LENGTH}>
          Continue
        </Button>
      </form>
      <p className="small center">
        {wait > 0 ? (
          `You can ask for a new code in ${wait} seconds.`
        ) : (
          <button className="link" onClick={() => void send(sentTo)}>
            Send a new code
          </button>
        )}{" "}
        <button
          className="link"
          onClick={() => {
            setSentTo(null);
            setError(null);
          }}>
          Use a different email
        </button>
      </p>
    </Card>
  );
}
