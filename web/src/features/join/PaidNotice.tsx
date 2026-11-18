"use client";

import { useEffect, useRef, useState } from "react";

import { Button, Card } from "@/components/ui";
import { readReturn, type PaymentState, type Returned } from "@/features/pay/logic";

import { formatDay } from "./logic";

type Notice =
  | { state: "checking" | "cancelled" | "trouble" }
  | { state: PaymentState; vipUntil: string | null };

/** How often, and how many times, the page asks again while a payment is still on its way. */
const ASK_AGAIN_MS = 5000;
const ASK_AGAIN_TIMES = 24;

async function confirm(back: Returned): Promise<Notice> {
  try {
    const response = await fetch("/api/pay/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference: back.reference, providerId: back.providerId }),
    });
    const answer = (await response.json().catch(() => null)) as { state?: PaymentState; vipUntil?: string | null } | null;
    if (!response.ok || !answer?.state) return { state: "trouble" };
    return { state: answer.state, vipUntil: answer.vipUntil ?? null };
  } catch {
    return { state: "trouble" };
  }
}

interface PaidNoticeProps {
  spaceName: string;
  /** Called once the payment is confirmed, so the page can show the member's new VIP date. */
  onPaid: () => void;
}

/**
 * Shown when a member arrives back from the card processor's page. It asks Floor's server what
 * became of the payment, and says so. Nothing here decides anything: the server asks the
 * processor, and the database adds the VIP days.
 */
export function PaidNotice({ spaceName, onPaid }: PaidNoticeProps) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [round, setRound] = useState(0);
  /** What the address said when the page opened. Undefined until it has been read. */
  const back = useRef<Returned | null | undefined>(undefined);
  const asked = useRef(0);
  const told = useRef(false);

  useEffect(() => {
    if (back.current === undefined) {
      back.current = readReturn(window.location.search);
      // The payment's name does not stay in the address bar, to be copied or reloaded.
      if (back.current) window.history.replaceState(null, "", window.location.pathname);
    }
    const returned = back.current;
    if (!returned) return;

    let current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const answer = returned.cancelled ? Promise.resolve<Notice>({ state: "cancelled" }) : confirm(returned);
    Promise.resolve().then(() => current && setNotice((shown) => shown ?? { state: "checking" }));
    answer.then((next) => {
      if (!current) return;
      setNotice(next);
      if (next.state === "paid" && !told.current) {
        told.current = true;
        onPaid();
      }
      if (next.state === "pending" && asked.current < ASK_AGAIN_TIMES) {
        asked.current += 1;
        timer = setTimeout(() => setRound((count) => count + 1), ASK_AGAIN_MS);
      }
    });
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [round, onPaid]);

  if (!notice) return null;
  const again = (
    <Button
      kind="ghost"
      onClick={() => {
        setNotice({ state: "checking" });
        setRound((count) => count + 1);
      }}>
      Check again
    </Button>
  );

  if (notice.state === "checking") {
    return (
      <Card>
        <p className="body" role="status">
          Checking your payment…
        </p>
      </Card>
    );
  }
  if (notice.state === "paid") {
    return (
      <Card role="status">
        <span className="pill">Paid</span>
        {notice.vipUntil ? (
          <>
            <h2 className="h2">Payment received</h2>
            <p className="body">
              You&apos;re VIP in {spaceName} until {formatDay(notice.vipUntil)}. Open the Floor app to see everything.
            </p>
          </>
        ) : (
          <>
            <h2 className="h2">Payment received, but you are no longer in this space</h2>
            <p className="body">No VIP was added. Ask {spaceName} for a refund.</p>
          </>
        )}
      </Card>
    );
  }
  if (notice.state === "pending") {
    return (
      <Card role="status">
        <h2 className="h2">Waiting for your payment</h2>
        <p className="body">
          It has not come through yet. A bank transfer can take a few minutes. This page keeps checking, and your VIP
          starts by itself when it arrives, even if you close this page.
        </p>
        {again}
      </Card>
    );
  }
  if (notice.state === "cancelled" || notice.state === "not_paid") {
    return (
      <Card role="status">
        <h2 className="h2">{notice.state === "cancelled" ? "Payment cancelled" : "That payment did not go through"}</h2>
        <p className="body">Nothing was added to your VIP. You can try again below.</p>
      </Card>
    );
  }
  if (notice.state === "mismatch") {
    return (
      <Card role="status">
        <h2 className="h2">The amount paid does not match the price</h2>
        <p className="body">No VIP was added. Ask {spaceName} to check the payment and sort it out with you.</p>
      </Card>
    );
  }
  if (notice.state === "unknown") {
    return (
      <Card role="status">
        <h2 className="h2">That payment can&apos;t be found</h2>
        <p className="body">If money left your account, send {spaceName} your receipt and they can add your VIP by hand.</p>
      </Card>
    );
  }
  return (
    <Card role="status">
      <h2 className="h2">Your payment couldn&apos;t be checked</h2>
      <p className="body">Check your connection. If you paid, nothing is lost: your VIP starts as soon as it is confirmed.</p>
      {again}
    </Card>
  );
}
