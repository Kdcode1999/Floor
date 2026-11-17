import { describe, expect, it } from "vitest";

import { ApiError, checkLogin, claimLogin, type AccessApi } from "../src/auth/access";

function api(answers: { claim?: string | Error; status?: string | Error }): AccessApi & { claimedWith: string[] } {
  const claimedWith: string[] = [];
  const answer = async (value: string | Error | undefined) => {
    if (value instanceof Error) throw value;
    return value ?? "ok";
  };
  return {
    claimedWith,
    claimSession: (deviceId) => {
      claimedWith.push(deviceId);
      return answer(answers.claim);
    },
    sessionStatus: () => answer(answers.status),
  };
}

describe("claimLogin, straight after signing in", () => {
  it("lets the phone in when the database accepts it", async () => {
    const backend = api({ claim: "ok" });
    expect(await claimLogin(backend, "phone-1-0123456789")).toEqual({ access: "ok" });
    expect(backend.claimedWith).toEqual(["phone-1-0123456789"]);
  });

  it("reports the phone limit", async () => {
    expect(await claimLogin(api({ claim: "device_limit" }), "phone-2")).toEqual({ access: "device_limit" });
  });

  it("signs out when the server rejects the login itself", async () => {
    const rejected = new ApiError("not_signed_in", true);
    expect(await claimLogin(api({ claim: rejected }), "phone-1")).toEqual({ access: "signed_out" });
  });

  it("reports trouble, with the server's words, when the call fails", async () => {
    const result = await claimLogin(api({ claim: new ApiError("Could not find the function") }), "phone-1");
    expect(result).toEqual({ access: "trouble", detail: "Could not find the function" });
  });

  it("reports trouble for an answer it does not know", async () => {
    expect((await claimLogin(api({ claim: "maybe" }), "phone-1")).access).toBe("trouble");
  });
});

describe("checkLogin, for a login kept from last time", () => {
  it("passes a login that is still the current one", async () => {
    expect(await checkLogin(api({ status: "ok" }))).toEqual({ access: "ok" });
  });

  it("notices another phone has taken over", async () => {
    expect(await checkLogin(api({ status: "not_current" }))).toEqual({ access: "elsewhere" });
  });

  it("never takes the login back by itself", async () => {
    const backend = api({ status: "not_current" });
    await checkLogin(backend);
    expect(backend.claimedWith).toEqual([]);
  });

  it("signs out when the server says the login is gone", async () => {
    expect(await checkLogin(api({ status: "signed_out" }))).toEqual({ access: "signed_out" });
    expect(await checkLogin(api({ status: new ApiError("JWT expired", true) }))).toEqual({ access: "signed_out" });
  });

  it("answers unknown, and locks nobody out, when the server cannot be reached", async () => {
    expect(await checkLogin(api({ status: new Error("Network request failed") }))).toBe("unknown");
  });
});
