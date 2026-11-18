// Card payments' plain logic: which processors there are, what each can charge, how the
// return from a processor's page is read, and how refusals are worded. No browser code and no
// secrets. Tested in tests/.

export type CardProvider = "paystack" | "flutterwave";

export interface CardProcessor {
  /** The name people know it by. */
  label: string;
  /** The currencies Floor will charge through it. All have hundredths. */
  currencies: readonly string[];
  /** How its live secret key begins, to help a mentor find the right one. */
  keyStart: string;
  /** Where in its dashboard the secret key is. */
  keyPlace: string;
  /** Where in its dashboard the webhook address goes. */
  hookPlace: string;
}

export const CARD_PROCESSORS: Record<CardProvider, CardProcessor> = {
  paystack: {
    label: "Paystack",
    currencies: ["NGN", "GHS", "KES", "ZAR", "USD"],
    keyStart: "sk_live_",
    keyPlace: "Paystack dashboard, Settings, API Keys & Webhooks: the live secret key.",
    hookPlace: "Paystack dashboard, Settings, API Keys & Webhooks: Live Webhook URL.",
  },
  flutterwave: {
    label: "Flutterwave",
    currencies: ["NGN", "GHS", "KES", "ZAR", "USD", "GBP", "EUR"],
    keyStart: "FLWSECK-",
    keyPlace: "Flutterwave dashboard, Settings, API Keys: the live secret key.",
    hookPlace: "Flutterwave dashboard, Settings, Webhooks: the URL, and a secret hash of your own.",
  },
};

export const isCardProvider = (value: unknown): value is CardProvider =>
  typeof value === "string" && Object.hasOwn(CARD_PROCESSORS, value);

/** What a space's card settings look like in the database. */
export interface CardSettings {
  card_provider: string | null;
  card_test: boolean;
  vip_price_cents: number | null;
  vip_currency: string | null;
}

/**
 * Why members cannot pay this space by card, in the mentor's words, or null when they can.
 * A processor only charges ordinary currencies, so a price in USDT cannot go on a card.
 */
export function cardGap(settings: CardSettings): string | null {
  if (!isCardProvider(settings.card_provider)) return "No card processor is connected.";
  const processor = CARD_PROCESSORS[settings.card_provider];
  if (!settings.vip_price_cents || settings.vip_price_cents <= 0 || !settings.vip_currency) {
    return "Your space has no VIP price yet. Set one in the app, under Price and payment.";
  }
  if (!processor.currencies.includes(settings.vip_currency)) {
    return `Your price is in ${settings.vip_currency}, which ${processor.label} cannot charge. Use one of: ${processor.currencies.join(", ")}.`;
  }
  return null;
}

/** The processor a member can pay this space through right now, or null. */
export function cardOffer(settings: CardSettings | null): (CardProcessor & { provider: CardProvider; test: boolean }) | null {
  if (!settings || !isCardProvider(settings.card_provider) || cardGap(settings) !== null) return null;
  return { ...CARD_PROCESSORS[settings.card_provider], provider: settings.card_provider, test: settings.card_test };
}

/**
 * What the mentor reads when a member could not start a payment. `problem` is what Floor's
 * server kept: "key_refused", or the processor's own words. Null when there is nothing to say.
 */
export function problemLine(problem: string | null | undefined, provider: CardProvider): string | null {
  if (!problem) return null;
  const label = CARD_PROCESSORS[provider].label;
  if (problem === "key_refused") {
    return `${label} no longer accepts your key, so members cannot pay by card. Disconnect, then connect again with your current live secret key.`;
  }
  return `A member could not start a payment. ${label} said: “${problem}”`;
}

/** Floor's name for a payment: "fl-" and 32 characters nobody can guess. */
const REFERENCE = /^fl-[0-9a-f]{32}$/;

/** A member arriving back from a processor's page. */
export interface Returned {
  reference: string;
  /** The processor's own id for the payment, when it put one in the address. */
  providerId?: string;
  /** True when the processor says the member backed out. */
  cancelled: boolean;
}

/**
 * Reads the address a processor sent the member back to. Floor puts its own name for the
 * payment in `paid`. Paystack adds `reference` and `trxref`, Flutterwave adds `tx_ref`,
 * `transaction_id` and `status`. Null when the address is not a return at all.
 */
export function readReturn(search: string): Returned | null {
  const params = new URLSearchParams(search);
  const reference = ["paid", "reference", "trxref", "tx_ref"].map((name) => params.get(name)).find((value) => value !== null && REFERENCE.test(value));
  if (!reference) return null;
  const id = params.get("transaction_id");
  return {
    reference,
    providerId: id !== null && /^[0-9]{1,20}$/.test(id) ? id : undefined,
    cancelled: params.get("status") === "cancelled",
  };
}

/** What the server says became of a payment. */
export type PaymentState = "paid" | "pending" | "not_paid" | "mismatch" | "unknown";

/** What to tell a member when starting a card payment failed. */
export function payMessage(code: string | null | undefined, spaceName: string): string {
  if (code === "too_many_tries") return "You have started a lot of payments. Wait an hour, then try again.";
  if (code === "signed_out") return "Sign in again to pay.";
  if (code === "not_allowed") return "You can't pay for this space.";
  if (code === "offline") return "Check your connection and try again.";
  if (code === "processor_unavailable") return "The payment page could not be opened. Try again in a minute.";
  // The rest are the mentor's to fix: no processor, a key that stopped working, a price a card cannot be charged.
  return `Card payments are not working for ${spaceName} right now. Use another way to pay, or tell them.`;
}

/** What to tell a mentor when connecting their processor failed. */
export function connectMessage(code: string | null | undefined, provider: CardProvider): string {
  const processor = CARD_PROCESSORS[provider];
  if (code === "bad_key") return `That does not look like a ${processor.label} secret key. It starts with ${processor.keyStart}`;
  if (code === "test_key") return "That is a test key. Use your live secret key: with a test key anyone could get VIP with a pretend card.";
  if (code === "key_refused") return `${processor.label} did not accept that key. Copy it again from your dashboard.`;
  if (code === "processor_unavailable") return `${processor.label} could not be reached. Try again in a minute.`;
  if (code === "payments_not_set_up") return "Card payments are not switched on for this copy of Floor yet.";
  if (code === "not_allowed") return "Only the mentor can connect card payments.";
  if (code === "signed_out") return "Sign in again, then connect.";
  if (code === "offline") return "Check your connection and try again.";
  return "That couldn't be saved. Try again.";
}
