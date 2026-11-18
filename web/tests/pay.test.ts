import { createHmac } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// The server reads its settings when it starts, so they are set before it is loaded.
vi.stubEnv("PAYMENT_KEYS_SECRET", "a-long-random-secret-for-tests-0123456789");
vi.stubEnv("PAYSTACK_API_URL", "https://paystack.test");
vi.stubEnv("FLUTTERWAVE_API_URL", "https://flutterwave.test");

let vault: typeof import("@/server/pay/vault");
let paystack: typeof import("@/server/pay/paystack").paystack;
let flutterwave: typeof import("@/server/pay/flutterwave").flutterwave;
let processor: typeof import("@/server/pay/processor");

beforeAll(async () => {
  vault = await import("@/server/pay/vault");
  paystack = (await import("@/server/pay/paystack")).paystack;
  flutterwave = (await import("@/server/pay/flutterwave")).flutterwave;
  processor = await import("@/server/pay/processor");
});

afterEach(() => vi.unstubAllGlobals());

const SPACE = "0b1c2d3e-0000-4000-8000-000000000001";
const OTHER = "0b1c2d3e-0000-4000-8000-000000000002";
const REFERENCE = "fl-0123456789abcdef0123456789abcdef";
// Made-up keys with the right shape. They are put together from parts so that no line of
// this file reads as a real key to a tool that scans the repo for leaked secrets.
const TAIL = "0123456789abcdef0123456789abcdef";
const paystackKey = (kind: "sk_live" | "sk_test" | "pk_live", tail = TAIL) => [kind, tail].join("_");
const flutterwaveKey = (kind: "FLWSECK" | "FLWSECK_TEST" | "FLWPUBK", tail = TAIL) => [kind, tail, "X"].join("-");
const PAYSTACK_KEY = paystackKey("sk_live");
const FLW_KEY = flutterwaveKey("FLWSECK");

/** Answers the next calls to a processor, and remembers what was asked. */
function answer(...answers: { status?: number; json: unknown }[]) {
  const calls: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    calls.push({
      url,
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string>,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const next = answers.shift() ?? { status: 500, json: {} };
    return new Response(JSON.stringify(next.json), { status: next.status ?? 200 });
  });
  return calls;
}

describe("a mentor's processor key, at rest", () => {
  it("is stored encrypted, differently every time, and opens again", () => {
    const sealed = vault.seal(PAYSTACK_KEY, SPACE);
    expect(sealed).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(sealed).not.toContain(PAYSTACK_KEY);
    expect(sealed).not.toContain("0123456789abcdef");
    expect(vault.seal(PAYSTACK_KEY, SPACE)).not.toBe(sealed);
    expect(vault.unseal(sealed, SPACE)).toBe(PAYSTACK_KEY);
  });

  it("does not open on another space's row, or after being changed", () => {
    const sealed = vault.seal(PAYSTACK_KEY, SPACE);
    expect(() => vault.unseal(sealed, OTHER)).toThrow();
    const [version, nonce, body, tag] = sealed.split(".");
    // The first character of each part, because every bit of it counts.
    const flip = (text: string) => (text.startsWith("A") ? "B" : "A") + text.slice(1);
    expect(() => vault.unseal([version, nonce, flip(body), tag].join("."), SPACE)).toThrow();
    expect(() => vault.unseal([version, nonce, body, flip(tag)].join("."), SPACE)).toThrow();
    expect(() => vault.unseal([version, flip(nonce), body, tag].join("."), SPACE)).toThrow();
    expect(() => vault.unseal("not sealed", SPACE)).toThrow();
  });
});

describe("telling a key from something else", () => {
  it("knows each processor's secret keys, and which are test keys", () => {
    expect(paystack.looksRight(PAYSTACK_KEY)).toBe(true);
    expect(paystack.looksRight(paystackKey("pk_live"))).toBe(false);
    expect(paystack.looksRight("hello")).toBe(false);
    expect(paystack.isTest(paystackKey("sk_test"))).toBe(true);
    expect(paystack.isTest(PAYSTACK_KEY)).toBe(false);

    expect(flutterwave.looksRight(FLW_KEY)).toBe(true);
    expect(flutterwave.looksRight(flutterwaveKey("FLWPUBK"))).toBe(false);
    expect(flutterwave.isTest(flutterwaveKey("FLWSECK_TEST", "0123456789abcdef"))).toBe(true);
    expect(flutterwave.isTest(FLW_KEY)).toBe(false);
  });

  it("tries a key by asking about a payment that does not exist", async () => {
    const calls = answer({ status: 400, json: { status: false, message: "Transaction reference not found" } });
    await expect(paystack.probe(PAYSTACK_KEY)).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({ url: "https://paystack.test/transaction/verify/floor-key-check", method: "GET" });
    expect(calls[0].headers.Authorization).toBe(`Bearer ${PAYSTACK_KEY}`);

    answer({ status: 401, json: { status: false, message: "Invalid key" } });
    await expect(paystack.probe(PAYSTACK_KEY)).rejects.toBeInstanceOf(processor.KeyRefused);
    answer({ status: 401, json: { status: "error", message: "Invalid authorization key" } });
    await expect(flutterwave.probe(FLW_KEY)).rejects.toBeInstanceOf(processor.KeyRefused);
    answer({ status: 503, json: {} });
    await expect(flutterwave.probe(FLW_KEY)).rejects.toBeInstanceOf(processor.ProcessorDown);
  });
});

const ORDER = {
  reference: REFERENCE,
  amountCents: 2_500_000,
  currency: "NGN",
  email: "ada@example.com",
  title: "Gold Desk",
  returnUrl: `https://floor.example/gold-desk?paid=${REFERENCE}`,
  cancelUrl: "https://floor.example/gold-desk",
};

describe("Paystack", () => {
  it("starts a payment in the smallest unit, under Floor's own name for it", async () => {
    const calls = answer({ json: { status: true, data: { authorization_url: "https://checkout.paystack.com/abc", reference: REFERENCE } } });
    expect(await paystack.begin(PAYSTACK_KEY, ORDER)).toBe("https://checkout.paystack.com/abc");
    expect(calls[0].url).toBe("https://paystack.test/transaction/initialize");
    expect(calls[0].body).toEqual({
      email: "ada@example.com",
      amount: "2500000",
      currency: "NGN",
      reference: REFERENCE,
      callback_url: ORDER.returnUrl,
      metadata: { cancel_action: ORDER.cancelUrl, floor_reference: REFERENCE },
    });
  });

  it("will not send a member to a page that is not a web address", async () => {
    answer({ json: { status: true, data: { authorization_url: "javascript:alert(1)" } } });
    await expect(paystack.begin(PAYSTACK_KEY, ORDER)).rejects.toBeInstanceOf(processor.ProcessorDown);
    answer({ status: 400, json: { status: false, message: "Currency not supported by merchant" } });
    await expect(paystack.begin(PAYSTACK_KEY, ORDER)).rejects.toThrow("Currency not supported by merchant");
  });

  it("reads what became of a payment", async () => {
    answer({ json: { status: true, data: { id: 4099260516, reference: REFERENCE, status: "success", amount: 2500000, currency: "NGN" } } });
    expect(await paystack.check(PAYSTACK_KEY, REFERENCE)).toEqual({ state: "paid", amountCents: 2500000, currency: "NGN", providerId: "4099260516" });

    for (const [status, state] of [["abandoned", "not_paid"], ["failed", "not_paid"], ["reversed", "not_paid"], ["ongoing", "pending"], ["pending", "pending"]] as const) {
      answer({ json: { status: true, data: { id: 1, reference: REFERENCE, status, amount: 2500000, currency: "NGN" } } });
      expect(await paystack.check(PAYSTACK_KEY, REFERENCE)).toMatchObject({ state, amountCents: 0 });
    }
    answer({ status: 400, json: { status: false, message: "Transaction reference not found" } });
    expect((await paystack.check(PAYSTACK_KEY, REFERENCE)).state).toBe("not_paid");
  });

  it("does not take an answer about some other payment", async () => {
    answer({ json: { status: true, data: { id: 7, reference: "someone-elses", status: "success", amount: 2500000, currency: "NGN" } } });
    expect((await paystack.check(PAYSTACK_KEY, REFERENCE)).state).toBe("not_paid");
  });

  it("believes a webhook only when it is signed with the mentor's key", () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: REFERENCE, status: "success", amount: 2500000 } });
    const sign = (text: string, key = PAYSTACK_KEY) => new Headers({ "x-paystack-signature": createHmac("sha512", key).update(text).digest("hex") });
    const secrets = { secret: PAYSTACK_KEY, hookSecret: null };

    expect(paystack.hook(body, sign(body), secrets)).toEqual({ genuine: true, payment: { reference: REFERENCE } });
    expect(paystack.hook(body, sign(body, paystackKey("sk_live", "someoneelseskey00000000000000")), secrets)).toEqual({ genuine: false });
    expect(paystack.hook(body, new Headers(), secrets)).toEqual({ genuine: false });
    // A changed body no longer matches its signature.
    expect(paystack.hook(body.replace("2500000", "1"), sign(body), secrets)).toEqual({ genuine: false });

    const other = JSON.stringify({ event: "transfer.success", data: { reference: "x" } });
    expect(paystack.hook(other, sign(other), secrets)).toEqual({ genuine: true, payment: null });
  });
});

describe("Flutterwave", () => {
  it("starts a payment in whole units", async () => {
    const calls = answer({ json: { status: "success", message: "Hosted Link", data: { link: "https://checkout.flutterwave.com/v3/hosted/pay/abc" } } });
    expect(await flutterwave.begin(FLW_KEY, ORDER)).toBe("https://checkout.flutterwave.com/v3/hosted/pay/abc");
    expect(calls[0].url).toBe("https://flutterwave.test/v3/payments");
    expect(calls[0].body).toEqual({
      tx_ref: REFERENCE,
      amount: "25000.00",
      currency: "NGN",
      redirect_url: ORDER.returnUrl,
      customer: { email: "ada@example.com" },
      customizations: { title: "Gold Desk" },
      meta: { floor_reference: REFERENCE },
    });
  });

  it("asks by the id from the return address when there is one, and by name when there is not", async () => {
    const paid = { status: "success", data: { id: 495000, tx_ref: REFERENCE, status: "successful", amount: 25000, currency: "NGN" } };
    let calls = answer({ json: paid });
    expect(await flutterwave.check(FLW_KEY, REFERENCE, "495000")).toEqual({ state: "paid", amountCents: 2500000, currency: "NGN", providerId: "495000" });
    expect(calls[0].url).toBe("https://flutterwave.test/v3/transactions/495000/verify");

    calls = answer({ json: paid });
    await flutterwave.check(FLW_KEY, REFERENCE);
    expect(calls[0].url).toBe(`https://flutterwave.test/v3/transactions/verify_by_reference?tx_ref=${REFERENCE}`);

    // Anything but digits is not an id, and never becomes part of the address asked.
    calls = answer({ json: paid });
    await flutterwave.check(FLW_KEY, REFERENCE, "../../payouts");
    expect(calls[0].url).toContain("verify_by_reference");
  });

  it("does not let the id of another payment stand in for this one", async () => {
    answer({ json: { status: "success", data: { id: 1, tx_ref: "a-cheaper-payment", status: "successful", amount: 25000, currency: "NGN" } } });
    expect((await flutterwave.check(FLW_KEY, REFERENCE, "1")).state).toBe("not_paid");
    answer({ json: { status: "success", data: { id: 2, tx_ref: REFERENCE, status: "pending", amount: 25000, currency: "NGN" } } });
    expect((await flutterwave.check(FLW_KEY, REFERENCE, "2")).state).toBe("pending");
    answer({ status: 404, json: { status: "error", message: "No transaction was found for this id" } });
    expect((await flutterwave.check(FLW_KEY, REFERENCE, "3")).state).toBe("not_paid");
  });

  it("believes a webhook only when it carries the word the mentor chose", () => {
    const body = JSON.stringify({ event: "charge.completed", data: { id: 495000, tx_ref: REFERENCE, status: "successful" } });
    const secrets = { secret: FLW_KEY, hookSecret: "my-own-word" };
    expect(flutterwave.hook(body, new Headers({ "verif-hash": "my-own-word" }), secrets)).toEqual({
      genuine: true,
      payment: { reference: REFERENCE, providerId: "495000" },
    });
    expect(flutterwave.hook(body, new Headers({ "verif-hash": "a-guess" }), secrets)).toEqual({ genuine: false });
    expect(flutterwave.hook(body, new Headers(), secrets)).toEqual({ genuine: false });
    // With no word on file nothing can be told from a forgery, so nothing is believed.
    expect(flutterwave.hook(body, new Headers({ "verif-hash": "" }), { secret: FLW_KEY, hookSecret: null })).toEqual({ genuine: false });
  });
});
