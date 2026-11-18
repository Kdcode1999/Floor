import { describe, expect, it } from "vitest";

import { holdFor, stageFor } from "../src/auth/stage";

describe("stageFor", () => {
  it("shows sign-in to someone signed out, and keeps it up while their code is checked", () => {
    expect(stageFor("signed_out", "idle")).toBe("sign-in");
    expect(stageFor("signing_in", "idle")).toBe("sign-in");
  });

  it("opens the app only when the login is good and a space is open", () => {
    expect(stageFor("ready", "ready")).toBe("app");
    for (const space of ["idle", "loading", "trouble", "none", "choose", "suspended"] as const) {
      expect(stageFor("ready", space)).toBe("hold");
    }
  });

  it("never opens the app for a login that is not this phone's", () => {
    for (const auth of ["loading", "elsewhere", "device_limit", "trouble"] as const) {
      expect(stageFor(auth, "ready")).toBe("hold");
    }
  });
});

describe("holdFor", () => {
  it("names the login problem first", () => {
    expect(holdFor("elsewhere", "ready")).toBe("elsewhere");
    expect(holdFor("device_limit", "idle")).toBe("device_limit");
    expect(holdFor("trouble", "idle")).toBe("trouble");
  });

  it("then says where the space stands", () => {
    expect(holdFor("ready", "none")).toBe("none");
    expect(holdFor("ready", "choose")).toBe("choose");
    expect(holdFor("ready", "trouble")).toBe("space_trouble");
  });

  it("says so when the person's one space has been suspended", () => {
    expect(holdFor("ready", "suspended")).toBe("suspended");
  });

  it("waits while things load", () => {
    expect(holdFor("loading", "idle")).toBe("loading");
    expect(holdFor("ready", "loading")).toBe("loading");
  });
});
