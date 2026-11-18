import { describe, expect, it } from "vitest";

import { cardGap, cardOffer, connectMessage, isCardProvider, payMessage, problemLine, readReturn } from "@/features/pay/logic";

const REFERENCE = "fl-0123456789abcdef0123456789abcdef";
const space = { card_provider: "paystack", card_test: false, vip_price_cents: 2_500_000, vip_currency: "NGN" };

describe("whether a space can take a card", () => {
  it("needs a processor, a price, and a currency that processor charges", () => {
    expect(cardGap(space)).toBeNull();
    expect(cardGap({ ...space, card_provider: null })).toBe("No card processor is connected.");
    expect(cardGap({ ...space, card_provider: "stripe" })).toBe("No card processor is connected.");
    expect(cardGap({ ...space, vip_price_cents: null })).toMatch(/no VIP price yet/);
    expect(cardGap({ ...space, vip_price_cents: 0 })).toMatch(/no VIP price yet/);
    expect(cardGap({ ...space, vip_currency: "USDT" })).toBe(
      "Your price is in USDT, which Paystack cannot charge. Use one of: NGN, GHS, KES, ZAR, USD.",
    );
    expect(cardGap({ ...space, vip_currency: "GBP" })).toMatch(/Paystack cannot charge/);
    expect(cardGap({ ...space, card_provider: "flutterwave", vip_currency: "GBP" })).toBeNull();
  });

  it("offers a member the processor only when all of that holds", () => {
    expect(cardOffer(space)).toMatchObject({ provider: "paystack", label: "Paystack", test: false });
    expect(cardOffer({ ...space, card_test: true })?.test).toBe(true);
    expect(cardOffer({ ...space, vip_currency: "USDT" })).toBeNull();
    expect(cardOffer({ ...space, card_provider: null })).toBeNull();
    expect(cardOffer(null)).toBeNull();
    expect(isCardProvider("flutterwave")).toBe(true);
    expect(isCardProvider("toString")).toBe(false);
  });
});

describe("a member coming back from the processor's page", () => {
  it("is recognised from the words each processor adds to the address", () => {
    expect(readReturn(`?paid=${REFERENCE}&trxref=${REFERENCE}&reference=${REFERENCE}`)).toEqual({
      reference: REFERENCE,
      providerId: undefined,
      cancelled: false,
    });
    expect(readReturn(`?paid=${REFERENCE}&status=successful&tx_ref=${REFERENCE}&transaction_id=495000`)).toEqual({
      reference: REFERENCE,
      providerId: "495000",
      cancelled: false,
    });
    // Even if Floor's own word was dropped on the way, the processor's still names the payment.
    expect(readReturn(`?reference=${REFERENCE}`)?.reference).toBe(REFERENCE);
    expect(readReturn(`?tx_ref=${REFERENCE}&status=cancelled`)).toMatchObject({ reference: REFERENCE, cancelled: true });
  });

  it("is not seen in an ordinary address, or one somebody made up", () => {
    expect(readReturn("")).toBeNull();
    expect(readReturn("?utm_source=telegram")).toBeNull();
    expect(readReturn("?paid=yes")).toBeNull();
    expect(readReturn("?paid=fl-0123")).toBeNull();
    expect(readReturn(`?paid=${REFERENCE.toUpperCase()}`)).toBeNull();
    // An id that is not a number is left out, never passed on.
    expect(readReturn(`?paid=${REFERENCE}&transaction_id=1%2F..%2Fpayouts`)?.providerId).toBeUndefined();
  });
});

describe("what people are told when it does not work", () => {
  it("tells a member what they can do, and does not blame them for the mentor's setup", () => {
    expect(payMessage("too_many_tries", "Gold Desk")).toMatch(/Wait an hour/);
    expect(payMessage("offline", "Gold Desk")).toBe("Check your connection and try again.");
    for (const code of ["cards_not_connected", "cards_not_working", "no_card_price", "currency_not_supported", "payments_not_set_up", null]) {
      expect(payMessage(code, "Gold Desk")).toBe("Card payments are not working for Gold Desk right now. Use another way to pay, or tell them.");
    }
  });

  it("tells a mentor why a member could not pay, in the processor's own words", () => {
    expect(problemLine(null, "paystack")).toBeNull();
    expect(problemLine("key_refused", "paystack")).toMatch(/^Paystack no longer accepts your key/);
    expect(problemLine("Currency not supported by merchant", "flutterwave")).toBe(
      "A member could not start a payment. Flutterwave said: “Currency not supported by merchant”",
    );
  });

  it("tells a mentor what is wrong with the key", () => {
    expect(connectMessage("bad_key", "paystack")).toBe("That does not look like a Paystack secret key. It starts with sk_live_");
    expect(connectMessage("bad_key", "flutterwave")).toMatch(/Flutterwave secret key. It starts with FLWSECK-/);
    expect(connectMessage("test_key", "paystack")).toMatch(/test key/);
    expect(connectMessage("key_refused", "flutterwave")).toBe("Flutterwave did not accept that key. Copy it again from your dashboard.");
    expect(connectMessage("not_allowed", "paystack")).toBe("Only the mentor can connect card payments.");
    expect(connectMessage(undefined, "paystack")).toBe("That couldn't be saved. Try again.");
  });
});
