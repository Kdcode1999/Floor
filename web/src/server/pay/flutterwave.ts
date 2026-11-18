import "server-only";

import { timingSafeEqual } from "node:crypto";

import { FLUTTERWAVE_API } from "../env";
import { CARD_PROCESSORS } from "@/features/pay/logic";

import { ask, NOTHING, pageAddress, part, ProcessorDown, type Hook, type Order, type Outcome, type Processor } from "./processor";

// Flutterwave's v3 API, with the mentor's own secret key.
// https://developer.flutterwave.com/v3.0/docs/flutterwave-standard-1

function outcome(data: Record<string, unknown>, reference: string): Outcome {
  // The id in a return address comes from the member's browser. Only an answer that names
  // this very payment counts.
  if (data.tx_ref !== reference) return NOTHING;
  const status = typeof data.status === "string" ? data.status : "";
  const providerId = data.id === undefined || data.id === null ? "" : String(data.id);
  if (status === "successful") {
    return {
      state: "paid",
      // Flutterwave counts in whole units with decimals.
      amountCents: typeof data.amount === "number" ? Math.round(data.amount * 100) : 0,
      currency: typeof data.currency === "string" ? data.currency.toUpperCase() : "",
      providerId,
    };
  }
  return { ...NOTHING, state: status === "pending" ? "pending" : "not_paid", providerId };
}

export const flutterwave: Processor = {
  name: "flutterwave",
  label: CARD_PROCESSORS.flutterwave.label,
  currencies: CARD_PROCESSORS.flutterwave.currencies,

  looksRight: (secret) => /^FLWSECK(_TEST)?-[A-Za-z0-9_-]{10,120}$/.test(secret),
  isTest: (secret) => secret.startsWith("FLWSECK_TEST-"),

  // As with Paystack: a question about a payment that does not exist. Only a wrong key is refused.
  async probe(secret) {
    await ask(`${FLUTTERWAVE_API}/v3/transactions/verify_by_reference?tx_ref=floor-key-check`, secret);
  },

  async begin(secret, order: Order) {
    const asked = await ask(`${FLUTTERWAVE_API}/v3/payments`, secret, {
      tx_ref: order.reference,
      amount: (order.amountCents / 100).toFixed(2),
      currency: order.currency,
      redirect_url: order.returnUrl,
      customer: { email: order.email },
      customizations: { title: order.title },
      meta: { floor_reference: order.reference },
    });
    if (asked.status >= 400 || asked.json?.status !== "success") {
      throw new ProcessorDown(typeof asked.json?.message === "string" ? asked.json.message : `Flutterwave answered ${asked.status}`);
    }
    return pageAddress(part(asked.json.data).link);
  },

  async check(secret, reference, providerId) {
    const url = providerId && /^[0-9]{1,20}$/.test(providerId)
      ? `${FLUTTERWAVE_API}/v3/transactions/${providerId}/verify`
      : `${FLUTTERWAVE_API}/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`;
    const asked = await ask(url, secret);
    if (asked.status >= 400 || asked.json?.status !== "success") return NOTHING;
    return outcome(part(asked.json.data), reference);
  },

  // Flutterwave sends back a word the mentor chose in their dashboard, in the verif-hash
  // header. Without that word on file a webhook cannot be told from a forgery.
  hook(rawBody, headers, { hookSecret }): Hook {
    const sent = headers.get("verif-hash") ?? "";
    if (!hookSecret) return { genuine: false };
    const a = Buffer.from(sent, "utf8");
    const b = Buffer.from(hookSecret, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { genuine: false };
    let event: Record<string, unknown>;
    try {
      event = part(JSON.parse(rawBody));
    } catch {
      return { genuine: true, payment: null };
    }
    const data = part(event.data);
    if (event.event !== "charge.completed" || typeof data.tx_ref !== "string") return { genuine: true, payment: null };
    return { genuine: true, payment: { reference: data.tx_ref, providerId: data.id === undefined ? undefined : String(data.id) } };
  },
};
