// What Floor asks of a card processor. One file per processor implements this, and nothing
// else in the server knows which processor it is talking to.

import type { CardProvider } from "@/features/pay/logic";

export type Provider = CardProvider;

/** A payment to start. */
export interface Order {
  /** Floor's own name for the payment. The processor gives it back with every answer. */
  reference: string;
  /** The price in hundredths: 2500000 is 25,000.00. */
  amountCents: number;
  currency: string;
  /** The member's email, for the processor's receipt. */
  email: string;
  /** Shown on the processor's page: the space's name. */
  title: string;
  /** Where the processor sends the member afterwards. */
  returnUrl: string;
  /** Where it sends them if they back out. */
  cancelUrl: string;
}

/** What the processor says became of a payment. */
export interface Outcome {
  /** "pending" is not yet known: a bank transfer on its way, a member still on the page. */
  state: "paid" | "pending" | "not_paid";
  /** What was paid, in hundredths, and in which currency. Zero when nothing was. */
  amountCents: number;
  currency: string;
  /** The processor's own id for the payment. */
  providerId: string;
}

/** A webhook, once read. */
export type Hook =
  /** Not from the processor: the signature is wrong or missing. */
  | { genuine: false }
  /** From the processor. `payment` is set when it is about a payment that went through. */
  | { genuine: true; payment: { reference: string; providerId?: string } | null };

export interface Processor {
  name: Provider;
  /** The name people know it by. */
  label: string;
  /** The currencies Floor will charge through it. All have hundredths. */
  currencies: readonly string[];
  /** Whether the text has the shape of this processor's secret key. */
  looksRight(secret: string): boolean;
  /** A test key takes pretend cards and moves no money. */
  isTest(secret: string): boolean;
  /** Asks the processor something harmless with the key. Throws KeyRefused if the key is wrong. */
  probe(secret: string): Promise<void>;
  /** Starts a payment. Resolves with the address of the processor's page for it. */
  begin(secret: string, order: Order): Promise<string>;
  /** Asks the processor what became of a payment. Floor never takes anyone else's word. */
  check(secret: string, reference: string, providerId?: string): Promise<Outcome>;
  /** Reads a webhook: checks that the processor sent it, and what it is about. */
  hook(rawBody: string, headers: Headers, secrets: { secret: string; hookSecret: string | null }): Hook;
}

/** The processor said no to the key itself. */
export class KeyRefused extends Error {
  constructor() {
    super("key_refused");
  }
}

/** The processor could not be reached, or answered with something unexpected. */
export class ProcessorDown extends Error {
  constructor(detail: string) {
    super(detail);
  }
}

/** Nothing was paid, as far as this answer goes. */
export const NOTHING: Outcome = { state: "not_paid", amountCents: 0, currency: "", providerId: "" };

interface Asked {
  status: number;
  /** The answer's JSON, or null when it was not JSON. */
  json: Record<string, unknown> | null;
}

/** One call to a processor's API with the mentor's key. A wrong key throws KeyRefused. */
export async function ask(url: string, secret: string, body?: unknown): Promise<Asked> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new ProcessorDown("The processor could not be reached");
  }
  if (response.status === 401 || response.status === 403) throw new KeyRefused();
  if (response.status >= 500) throw new ProcessorDown(`The processor answered ${response.status}`);
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: response.status, json: json !== null && typeof json === "object" ? json : null };
}

/** A field of an answer, when it is an object. */
export function part(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** An address a member can be sent to: http or https, nothing else. */
export function pageAddress(value: unknown): string {
  if (typeof value !== "string") throw new ProcessorDown("The processor gave no page to pay on");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProcessorDown("The processor gave no page to pay on");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ProcessorDown("The processor gave no page to pay on");
  return url.toString();
}
