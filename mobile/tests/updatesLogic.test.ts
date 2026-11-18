import { describe, expect, it } from "vitest";

import { readRelease, updateState, type Release } from "../src/features/updates/logic";

const release: Release = { versionName: "1.2.0", versionCode: 12, minimumVersionCode: 9, url: "https://downloads.example.com/floor-12.apk", notes: "Live sessions." };

describe("updating the Android app", () => {
  it("offers a newer build, and insists below the minimum", () => {
    expect(updateState(12, release)).toBe("none");
    expect(updateState(13, release)).toBe("none");
    expect(updateState(10, release)).toBe("available");
    expect(updateState(8, release)).toBe("required");
    expect(updateState(8, { ...release, minimumVersionCode: 0 })).toBe("available");
  });

  it("never forces anything it cannot be sure of", () => {
    expect(updateState(null, release)).toBe("none");
    expect(updateState(Number.NaN, release)).toBe("none");
    expect(updateState(0, release)).toBe("none");
    expect(updateState(5, null)).toBe("none");
  });

  it("reads only a whole release from the server", () => {
    expect(readRelease(release)).toEqual(release);
    expect(readRelease({ versionCode: 0 })).toBeNull();
    expect(readRelease({ versionCode: 12, url: "http://plain.example.com/floor.apk" })).toBeNull();
    expect(readRelease({ versionCode: 12, url: "https://x.example.com/f.apk" })).toEqual({
      versionName: "12",
      versionCode: 12,
      minimumVersionCode: 0,
      url: "https://x.example.com/f.apk",
      notes: "",
    });
    expect(readRelease("nonsense")).toBeNull();
  });
});
