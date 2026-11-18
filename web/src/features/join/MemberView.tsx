"use client";

import { useState } from "react";

import { Button, Card, Field } from "@/components/ui";
import { APP_STORE_URL, PLAY_STORE_URL, SITE_URL } from "@/lib/env";

import { days, declinedLine, formatDay, isVip, latestRequests, type AccessRequest, type PublicSpace, type RequestKind } from "./logic";
import type { Join } from "./useJoin";

interface MemberViewProps {
  space: PublicSpace;
  price: string | null;
  join: Join;
}

/** What a member sees on the join page: where they stand, how to get VIP, and how to get the app. */
export function MemberView({ space, price, join }: MemberViewProps) {
  // The clock is read once, when the page opens. VIP dates are days away, not seconds.
  const [now] = useState(() => Date.now());
  const membership = join.membership;
  if (!membership) return null;

  const staff = membership.role !== "member";
  const vip = isVip(membership, now);
  const latest = latestRequests(join.requests);
  const settings = join.settings;
  const canPay = Boolean(settings?.payment_instructions || settings?.payment_link);
  const canBroker = Boolean(settings?.broker_link);

  if (staff) {
    return (
      <>
        <Card>
          <h2 className="h2">This is your join page</h2>
          <p className="body">Share this link. People who open it can join {space.name}.</p>
          <ShareLink slug={space.slug} />
        </Card>
        <SignedInAs join={join} />
      </>
    );
  }

  return (
    <>
      <Card>
        {vip && membership.vip_until ? (
          <>
            <span className="pill">VIP</span>
            <h2 className="h2">You&apos;re VIP until {formatDay(membership.vip_until)}</h2>
          </>
        ) : (
          <>
            <span className="pill">Free member</span>
            <h2 className="h2">You&apos;re in</h2>
          </>
        )}
        <p className="body">
          Open the Floor app on your phone and sign in with <span className="strong">{join.email}</span>.
        </p>
        {APP_STORE_URL || PLAY_STORE_URL ? (
          <div className="stack">
            {APP_STORE_URL ? (
              <a className="btn btn-ghost" href={APP_STORE_URL}>
                Get it for iPhone
              </a>
            ) : null}
            {PLAY_STORE_URL ? (
              <a className="btn btn-ghost" href={PLAY_STORE_URL}>
                Get it for Android
              </a>
            ) : null}
          </div>
        ) : null}
      </Card>

      <h2 className="h3" style={{ padding: "8px 6px 0" }}>
        {vip ? "Add more VIP time" : "Get VIP"}
      </h2>

      {canPay ? (
        <Card>
          <h3 className="h2">Pay {space.name}</h3>
          {price ? <p className="body strong">{price}</p> : null}
          {settings?.payment_instructions ? <p className="body pre">{settings.payment_instructions}</p> : null}
          {settings?.payment_link ? (
            <a className="btn btn-ghost" href={settings.payment_link} target="_blank" rel="noopener noreferrer">
              Open the payment page
            </a>
          ) : null}
          <ProofForm
            kind="payment"
            latest={latest.payment}
            spaceName={space.name}
            join={join}
            fileLabel="Proof of payment"
            noteLabel="Note for your mentor"
            notePlaceholder="Transfer from Ada O."
          />
          <p className="small">You pay {space.name} directly. Floor never holds your money.</p>
        </Card>
      ) : null}

      {canBroker && settings?.broker_link ? (
        <Card>
          <h3 className="h2">Free VIP with a broker account</h3>
          <p className="body">
            Open an account with {space.broker_name ?? "the mentor's broker"} through this link, then send proof. You
            get {days(settings.broker_vip_days)} of VIP.
          </p>
          <a className="btn btn-ghost" href={settings.broker_link} target="_blank" rel="noopener noreferrer">
            Open the broker&apos;s page
          </a>
          <ProofForm
            kind="broker"
            latest={latest.broker}
            spaceName={space.name}
            join={join}
            fileLabel="Proof of your account"
            noteLabel="Your account number"
            notePlaceholder="4830 2291"
          />
          <p className="small">{space.name} may be paid by the broker for accounts opened through this link.</p>
        </Card>
      ) : null}

      <Card>
        <h3 className="h2">Have an invite code?</h3>
        <InviteForm join={join} />
      </Card>

      {!canPay && !canBroker ? (
        <p className="small center">{space.name} has not set up payment here yet. Ask them how to get VIP.</p>
      ) : null}

      <SignedInAs join={join} />
    </>
  );
}

function SignedInAs({ join }: { join: Join }) {
  return (
    <p className="small center">
      Signed in as <span className="strong">{join.email}</span>.{" "}
      <button className="link" onClick={join.signOut}>
        Sign out
      </button>
    </p>
  );
}

function ShareLink({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${SITE_URL || (typeof window === "undefined" ? "" : window.location.origin)}/${slug}`;
  return (
    <>
      <p className="body strong pre">{link}</p>
      <Button
        onClick={async () => {
          await navigator.clipboard.writeText(link);
          setCopied(true);
        }}>
        {copied ? "Copied" : "Copy link"}
      </Button>
    </>
  );
}

interface ProofFormProps {
  kind: RequestKind;
  /** The newest request of this kind, if the member has sent one. */
  latest: AccessRequest | undefined;
  spaceName: string;
  join: Join;
  fileLabel: string;
  noteLabel: string;
  notePlaceholder: string;
}

/** Upload a proof and send it to the mentor's queue. Shows where the last one stands. */
function ProofForm({ kind, latest, spaceName, join, fileLabel, noteLabel, notePlaceholder }: ProofFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (latest?.status === "pending") {
    return (
      <div className="stack" role="status">
        <p className="body strong">Sent on {formatDay(latest.created_at)}</p>
        <p className="body">Waiting for {spaceName} to check it. This page updates when they do.</p>
      </div>
    );
  }

  const send = async () => {
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    setBusy(true);
    setError(null);
    const problem = await join.sendProof(kind, file, note);
    setBusy(false);
    if (problem) setError(problem);
  };

  return (
    <form
        noValidate
      className="stack"
      style={{ gap: 14 }}
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}>
      {latest?.status === "declined" ? (
        <p className="error" role="status">
          {declinedLine(latest)}
        </p>
      ) : null}
      <div className="field">
        <label className="label" htmlFor={`proof-${kind}`}>
          {fileLabel}
        </label>
        <input
          id={`proof-${kind}`}
          className="file"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError(null);
          }}
        />
        <p className="small">A photo or PDF, up to 5 MB.</p>
      </div>
      <Field
        label={noteLabel}
        id={`note-${kind}`}
        maxLength={200}
        placeholder={notePlaceholder}
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" busy={busy}>
        Send for approval
      </Button>
    </form>
  );
}

function InviteForm({ join }: { join: Join }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const use = async () => {
    if (code.trim().length < 4) {
      setError("Type the code your mentor gave you.");
      return;
    }
    setBusy(true);
    setError(null);
    const problem = await join.redeem(code);
    setBusy(false);
    if (problem) setError(problem);
    else setCode("");
  };

  return (
    <form
        noValidate
      className="stack"
      style={{ gap: 14 }}
      onSubmit={(event) => {
        event.preventDefault();
        void use();
      }}>
      <Field
        label="Invite code"
        autoCapitalize="characters"
        autoComplete="off"
        maxLength={20}
        value={code}
        error={error}
        onChange={(event) => {
          setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
          setError(null);
        }}
      />
      <Button type="submit" kind="ghost" busy={busy}>
        Use code
      </Button>
    </form>
  );
}
