import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { PAYSTACK_API } from "../env";
import { CARD_PROCESSORS } from "@/features/pay/logic";

import { ask, NOTHING, pageAddress, part, ProcessorDown, type Hook, type Order, type Outcome, type Processor } from "./processor";

// Paystack, with the mentor's own secret key. https://paystack.com/docs/api/transaction

/** Paystack's words for a payment that can still go through. */
const WAITING = new Set(["ongoing", "pending", "processing", "queued"]);

function outcome(data: Record<string, unknown>, reference: string): Outcome {
  // An answer about some other payment says nothing about this one.
  if (data.reference !== reference) return NOTHING;
  const status = typeof data.status === "string" ? data.status : "";
  const base = {
    amountCents: typeof data.amount === "number" ? Math.round(data.amount) : 0,
    currency: typeof data.currency === "string" ? data.currency.toUpperCase() : "",
    providerId: data.id === undefined || data.id === null ? "" : String(data.id),
  };
  if (status === "success") return { state: "paid", ...base };
  return { ...NOTHING, state: WAITING.has(status) ? "pending" : "not_paid", providerId: base.providerId };
}

export const paystack: Processor = {
  name: "paystack",
  label: CARD_PROCESSORS.paystack.label,
  currencies: CARD_PROCESSORS.paystack.currencies,

  looksRight: (secret) => /^sk_(live|test)_[A-Za-z0-9]{16,100}$/.test(secret),
  isTest: (secret) => secret.startsWith("sk_test_"),

  // Asking about a payment that does not exist reads nothing from the mentor's account. A
  // wrong key is refused before Paystack even looks for the payment.
  async probe(secret) {
    await ask(`${PAYSTACK_API}/transaction/verify/floor-key-check`, secret);
  },

  async begin(secret, order: Order) {
    const asked = await ask(`${PAYSTACK_API}/transaction/initialize`, secret, {
      email: order.email,
      // Paystack counts in the smallest unit, as Floor does.
      amount: String(order.amountCents),
      currency: order.currency,
      reference: order.reference,
      callback_url: order.returnUrl,
      metadata: { cancel_action: order.cancelUrl, floor_reference: order.reference },
    });
    if (asked.status >= 400 || asked.json?.status !== true) {
      throw new ProcessorDown(typeof asked.json?.message === "string" ? asked.json.message : `Paystack answered ${asked.status}`);
    }
    return pageAddress(part(asked.json.data).authorization_url);
  },

  async check(secret, reference) {
    const asked = await ask(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, secret);
    // Paystack answers 400 or 404 for a payment nobody ever opened.
    if (asked.status >= 400 || asked.json?.status !== true) return NOTHING;
    return outcome(part(asked.json.data), reference);
  },

  // Paystack signs each webhook with the same secret key: an HMAC-SHA512 of the body, in hex.
  hook(rawBody, headers, { secret }): Hook {
    const sent = headers.get("x-paystack-signature") ?? "";
    const expected = createHmac("sha512", secret).update(rawBody, "utf8").digest("hex");
    const a = Buffer.from(sent.toLowerCase(), "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { genuine: false };
    let event: Record<string, unknown>;
    try {
      event = part(JSON.parse(rawBody));
    } catch {
      return { genuine: true, payment: null };
    }
    const reference = part(event.data).reference;
    if (event.event !== "charge.success" || typeof reference !== "string") return { genuine: true, payment: null };
    return { genuine: true, payment: { reference } };
  },
};
