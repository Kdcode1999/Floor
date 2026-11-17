import { describe, expect, it } from "vitest";

import { cleanCode, looksLikeEmail, sendCodeMessage, verifyCodeMessage } from "../src/auth/messages";
import { initials } from "../src/lib/initials";

describe("looksLikeEmail", () => {
  it("accepts ordinary addresses, with spaces around them", () => {
    expect(looksLikeEmail("ada@example.com")).toBe(true);
    expect(looksLikeEmail("  ada.o+floor@mail.example.ng ")).toBe(true);
  });

  it("rejects text that is not an address", () => {
    for (const value of ["", "ada", "ada@", "ada@example", "ada @example.com", "@example.com"]) {
      expect(looksLikeEmail(value)).toBe(false);
    }
  });
});

describe("cleanCode", () => {
  it("keeps six digits from whatever was typed or pasted", () => {
    expect(cleanCode("123456")).toBe("123456");
    expect(cleanCode(" 123 456 ")).toBe("123456");
    expect(cleanCode("Your code is 123456789")).toBe("123456");
    expect(cleanCode("12a")).toBe("12");
  });
});

describe("messages", () => {
  it("says there is no connection when the request never got through", () => {
    const offline = { name: "AuthRetryableFetchError", status: 0 };
    expect(sendCodeMessage(offline)).toMatch(/No connection/);
    expect(verifyCodeMessage(offline)).toMatch(/No connection/);
  });

  it("asks people to wait when codes are asked for too often", () => {
    expect(sendCodeMessage({ code: "over_email_send_rate_limit", status: 429 })).toMatch(/Wait a minute/);
    expect(sendCodeMessage({ status: 429 })).toMatch(/Wait a minute/);
  });

  it("explains a wrong or old code", () => {
    expect(verifyCodeMessage({ code: "otp_expired", status: 403 })).toMatch(/wrong or has run out/);
  });

  it("falls back to a plain message for anything else", () => {
    expect(sendCodeMessage({ code: "unexpected_failure", status: 500 })).toMatch(/couldn't be sent/);
    expect(verifyCodeMessage({ status: 500 })).toMatch(/couldn't be checked/);
  });
});

describe("initials", () => {
  it("uses the first letters of the first and last words", () => {
    expect(initials("Your Academy")).toBe("YA");
    expect(initials("Kings FX Academy")).toBe("KA");
    expect(initials("  floor ")).toBe("F");
    expect(initials("")).toBe("");
  });
});
