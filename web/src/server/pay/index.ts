import "server-only";

import { asServer } from "../supabase";
import { flutterwave } from "./flutterwave";
import { paystack } from "./paystack";
import type { Processor, Provider } from "./processor";
import { unseal } from "./vault";

export { KeyRefused, ProcessorDown, type Processor, type Provider } from "./processor";
export { seal, unseal, vaultReady } from "./vault";

const processors: Record<Provider, Processor> = { paystack, flutterwave };

/** The processor of that name, or null. */
export function processorNamed(name: unknown): Processor | null {
  return typeof name === "string" && Object.hasOwn(processors, name) ? processors[name as Provider] : null;
}

/** Floor's name for a payment: "fl-" and 32 characters nobody can guess. */
export const REFERENCE = /^fl-[0-9a-f]{32}$/;

export interface Confirmed {
  /**
   * paid       the processor confirmed it, and the VIP days are added
   * pending    not known yet
   * not_paid   it failed, or the member left the processor's page
   * mismatch   something was paid, but less than the price or in another currency
   * unknown    Floor has no such payment, or can no longer ask about it
   */
  state: "paid" | "pending" | "not_paid" | "mismatch" | "unknown";
  /** When the member's VIP now ends. Only with "paid". */
  vipUntil?: string | null;
  /** True when this call is the one that added the VIP days. */
  fresh?: boolean;
  spaceId?: string;
  createdAt?: string;
}

interface PaymentRow {
  reference: string;
  space_id: string;
  provider: string;
  status: string;
  vip_until: string | null;
  created_at: string;
  secret_cipher: string;
}

/**
 * Finds out from the processor what became of a payment and, if it went through, adds the VIP
 * days. The member's return, the processor's webhook and the later check all end up here, in
 * any order and any number of times: the database adds the days once.
 *
 * `limited` is for the one caller that needs no login, the page a member returns to. The
 * database then lets it through to the processor only so often for one payment, and in
 * between the answer is "pending".
 */
export async function confirmPayment(reference: string, providerId?: string, options: { limited?: boolean } = {}): Promise<Confirmed> {
  const database = asServer();
  const found = await database.rpc("payment_for_server", { p_reference: reference });
  if (found.error) throw new Error(found.error.message);
  const payment = ((found.data ?? []) as PaymentRow[])[0];
  const processor = payment ? processorNamed(payment.provider) : null;
  if (!payment || !processor) return { state: "unknown" };
  const about = { spaceId: payment.space_id, createdAt: payment.created_at };
  if (payment.status === "paid") return { state: "paid", vipUntil: payment.vip_until, fresh: false, ...about };

  if (options.limited) {
    const allowed = await database.rpc("payment_may_ask", { p_reference: reference });
    if (allowed.error) throw new Error(allowed.error.message);
    if (allowed.data !== true) return { state: "pending", ...about };
  }

  const outcome = await processor.check(unseal(payment.secret_cipher, payment.space_id), reference, providerId);
  if (outcome.state !== "paid") return { state: outcome.state, ...about };

  const settled = await database.rpc("settle_payment", {
    p_reference: reference,
    p_provider_id: outcome.providerId,
    p_amount_cents: outcome.amountCents,
    p_currency: outcome.currency,
  });
  if (settled.error) {
    if (settled.error.message === "payment_mismatch") return { state: "mismatch", ...about };
    throw new Error(settled.error.message);
  }
  const row = ((settled.data ?? []) as { vip_until: string | null; already: boolean }[])[0];
  return { state: "paid", vipUntil: row?.vip_until ?? null, fresh: row ? !row.already : false, ...about };
}
