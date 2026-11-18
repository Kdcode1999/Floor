"use client";

import { useEffect, useState } from "react";

import { Button, Card, Field } from "@/components/ui";
import { days, formatDay, formatPrice } from "@/features/join/logic";
import { CARD_PROCESSORS, cardGap, connectMessage, isCardProvider, problemLine, type CardProvider, type CardSettings } from "@/features/pay/logic";
import { SITE_URL } from "@/lib/env";
import { callServer, ServerError } from "@/lib/server";
import { supabase } from "@/lib/supabase";

import type { StaffSpace } from "./MentorApp";

/** What the mentor may know about their connection. Never the key itself. */
interface Account {
  provider: string;
  key_hint: string;
  has_hook_secret: boolean;
  connected_at: string;
  /** Why the last member who tried could not start a payment, if one could not. */
  last_error: string | null;
  last_error_at: string | null;
}

interface Payment {
  id: string;
  name: string;
  amount_cents: number;
  currency: string;
  days: number;
  paid_at: string;
  vip_until: string | null;
}

interface Loaded {
  account: Account | null;
  settings: CardSettings & { vip_days: number };
  payments: Payment[];
}

async function load(spaceId: string): Promise<Loaded> {
  if (!supabase) throw new Error("not_set_up");
  const [account, settings, payments] = await Promise.all([
    supabase.rpc("payment_account", { p_space: spaceId }),
    supabase.from("spaces").select("card_provider,card_test,vip_price_cents,vip_currency,vip_days").eq("id", spaceId).maybeSingle(),
    supabase.rpc("list_payments", { p_space: spaceId, p_limit: 20 }),
  ]);
  const failed = account.error ?? settings.error ?? payments.error;
  if (failed || !settings.data) throw new Error(failed?.message ?? "space_not_found");
  return {
    account: ((account.data ?? []) as Account[])[0] ?? null,
    settings: settings.data as Loaded["settings"],
    payments: (payments.data ?? []) as Payment[],
  };
}

/** The mentor connects their own card processor, and sees the card payments that came in. */
export function CardPayments({ space }: { space: StaffSpace }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const reload = () => setRound((count) => count + 1);

  useEffect(() => {
    let current = true;
    load(space.id).then(
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
  }, [space.id, round]);

  if (trouble) {
    return (
      <Card>
        <h2 className="h2">Card payments couldn&apos;t be loaded</h2>
        <p className="small">{trouble}</p>
        <Button onClick={reload}>Try again</Button>
      </Card>
    );
  }
  if (!loaded) {
    return (
      <Card>
        <p className="body" role="status">
          One moment…
        </p>
      </Card>
    );
  }

  return (
    <>
      {loaded.account && isCardProvider(loaded.account.provider) ? (
        <Connected space={space} account={loaded.account} provider={loaded.account.provider} settings={loaded.settings} onChange={reload} />
      ) : (
        <Connect space={space} onChange={reload} />
      )}
      {loaded.payments.length > 0 ? (
        <Card>
          <h2 className="h2">Card payments</h2>
          <div className="rows">
            {loaded.payments.map((payment) => (
              <div className="row" key={payment.id}>
                <p className="body strong">
                  {payment.name} · {formatPrice(payment.amount_cents, payment.currency)}
                </p>
                <p className="small">
                  {formatDay(payment.paid_at)} · {payment.vip_until ? `${days(payment.days)} of VIP, until ${formatDay(payment.vip_until)}` : "No VIP given: they had been removed. You may owe a refund."}
                </p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </>
  );
}

function Connect({ space, onChange }: { space: StaffSpace; onChange: () => void }) {
  const [provider, setProvider] = useState<CardProvider>("paystack");
  const [secret, setSecret] = useState("");
  const [hookSecret, setHookSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const processor = CARD_PROCESSORS[provider];

  const connect = async () => {
    if (secret.trim() === "") {
      setError("Paste your secret key first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await callServer("/api/pay/connect", { space: space.id, provider, secret: secret.trim(), hookSecret: hookSecret.trim() });
      setSecret("");
      setHookSecret("");
      onChange();
    } catch (failure) {
      setError(connectMessage(failure instanceof ServerError ? failure.code : null, provider));
    }
    setBusy(false);
  };

  return (
    <Card>
      <h2 className="h2">Take card payments</h2>
      <p className="body">
        Connect your own Paystack or Flutterwave account. Members then pay you by card on your join page and get VIP at
        once, with nothing for you to approve. The money goes straight to your account. Floor never holds it.
      </p>
      <form
        noValidate
        className="stack"
        style={{ gap: 16 }}
        onSubmit={(event) => {
          event.preventDefault();
          void connect();
        }}>
        <div className="choices" role="radiogroup" aria-label="Processor">
          {(Object.keys(CARD_PROCESSORS) as CardProvider[]).map((name) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={provider === name}
              className={provider === name ? "choice chosen" : "choice"}
              onClick={() => {
                setProvider(name);
                setError(null);
              }}>
              {CARD_PROCESSORS[name].label}
            </button>
          ))}
        </div>
        <Field
          label="Secret key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={`${processor.keyStart}…`}
          hint={processor.keyPlace}
          value={secret}
          error={error}
          onChange={(event) => {
            setSecret(event.target.value);
            setError(null);
          }}
        />
        {provider === "flutterwave" ? (
          <Field
            label="Secret hash (optional)"
            type="password"
            autoComplete="off"
            spellCheck={false}
            hint="The secret hash you set under Settings, Webhooks. With it Floor can trust Flutterwave's webhooks."
            value={hookSecret}
            onChange={(event) => setHookSecret(event.target.value)}
          />
        ) : null}
        <Button type="submit" busy={busy}>
          Connect {processor.label}
        </Button>
      </form>
      <p className="small">
        Your key is encrypted before it is stored, and it is never shown again, to you or to anyone else. You can
        disconnect at any time, which deletes it.
      </p>
    </Card>
  );
}

interface ConnectedProps {
  space: StaffSpace;
  account: Account;
  provider: CardProvider;
  settings: Loaded["settings"];
  onChange: () => void;
}

function Connected({ space, account, provider, settings, onChange }: ConnectedProps) {
  const processor = CARD_PROCESSORS[provider];
  const gap = cardGap(settings);
  const problem = problemLine(account.last_error, provider);
  const hookUrl = `${SITE_URL || (typeof window === "undefined" ? "" : window.location.origin)}/api/pay/hook/${provider}/${space.id}`;
  const [copied, setCopied] = useState(false);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disconnect = async () => {
    if (!supabase) return;
    setBusy(true);
    const { error: failed } = await supabase.rpc("disconnect_payments", { p_space: space.id });
    setBusy(false);
    if (failed) return setError("That couldn't be done. Try again.");
    onChange();
  };

  return (
    <Card>
      <span className="pill">{settings.card_test ? "Connected · test mode" : "Connected"}</span>
      <h2 className="h2">
        {processor.label} · key ending {account.key_hint}
      </h2>
      {gap ? (
        <p className="error" role="status">
          Members cannot pay by card yet. {gap}
        </p>
      ) : (
        <p className="body">
          Members can pay {formatPrice(settings.vip_price_cents ?? 0, settings.vip_currency ?? "")} by card on your join page, and get{" "}
          {days(settings.vip_days)} of VIP at once.
        </p>
      )}
      {problem ? (
        <p className="error" role="status">
          {account.last_error_at ? `${formatDay(account.last_error_at)}: ` : ""}
          {problem}
        </p>
      ) : null}
      {settings.card_test ? (
        <p className="error" role="status">
          This is a test key: no real money moves, and anyone with a test card gets VIP. Connect your live key before you
          share your link.
        </p>
      ) : null}

      <div className="stack">
        <h3 className="h3">One more step: the webhook</h3>
        <p className="body">
          Paste this address into your {processor.label} dashboard. It lets {processor.label} tell Floor about a payment
          even when the member closes the page before coming back.
        </p>
        <p className="body strong pre" style={{ overflowWrap: "anywhere" }}>
          {hookUrl}
        </p>
        <p className="small">
          {processor.hookPlace}
          {provider === "flutterwave" && !account.has_hook_secret
            ? " You have not given Floor your secret hash, so its webhooks are ignored. Disconnect and connect again to add it."
            : ""}
        </p>
        <Button
          kind="ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(hookUrl);
            setCopied(true);
          }}>
          {copied ? "Copied" : "Copy address"}
        </Button>
      </div>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {sure ? (
        <div className="stack">
          <p className="body strong">Disconnect {processor.label}?</p>
          <p className="body">Members will no longer be able to pay by card. Your key is deleted from Floor.</p>
          <Button busy={busy} onClick={() => void disconnect()}>
            Disconnect
          </Button>
          <Button kind="ghost" onClick={() => setSure(false)}>
            Keep it
          </Button>
        </div>
      ) : (
        <button className="link" style={{ alignSelf: "flex-start" }} onClick={() => setSure(true)}>
          Disconnect {processor.label}
        </button>
      )}
    </Card>
  );
}
