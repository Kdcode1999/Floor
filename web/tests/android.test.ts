import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { androidRelease } = await import("@/server/android");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the Android release the app checks", () => {
  it("is nothing until a download and a build number are set", () => {
    vi.stubEnv("ANDROID_APK_URL", "");
    vi.stubEnv("ANDROID_VERSION_CODE", "");
    expect(androidRelease()).toBeNull();
    vi.stubEnv("ANDROID_APK_URL", "http://plain.example.com/floor.apk");
    vi.stubEnv("ANDROID_VERSION_CODE", "12");
    expect(androidRelease()).toBeNull();
  });

  it("reads the settings into a release", () => {
    vi.stubEnv("ANDROID_APK_URL", " https://downloads.example.com/floor-12.apk ");
    vi.stubEnv("ANDROID_VERSION_CODE", "12");
    vi.stubEnv("ANDROID_VERSION_NAME", "1.2.0");
    vi.stubEnv("ANDROID_MIN_VERSION_CODE", "9");
    vi.stubEnv("ANDROID_NOTES", "Live sessions.");
    expect(androidRelease()).toEqual({ versionName: "1.2.0", versionCode: 12, minimumVersionCode: 9, url: "https://downloads.example.com/floor-12.apk", notes: "Live sessions." });
    vi.stubEnv("ANDROID_MIN_VERSION_CODE", "soon");
    vi.stubEnv("ANDROID_VERSION_NAME", "");
    expect(androidRelease()).toMatchObject({ versionName: "12", minimumVersionCode: 0 });
  });
});
