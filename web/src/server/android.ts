import "server-only";

// The Android app, downloaded from Floor's own site instead of a store. Each release is an APK
// file kept somewhere that serves it publicly (Cloudflare R2, docs/SETUP.md step 13), and these
// settings say which one is current. The app asks for them when it opens, and offers the update.

export interface AndroidRelease {
  /** What people read: "1.2.0". */
  versionName: string;
  /** What the app compares: it goes up by one with every build. */
  versionCode: number;
  /** Builds below this one must update before they can be used. 0 when none must. */
  minimumVersionCode: number;
  /** Where the APK file is. */
  url: string;
  /** One or two lines about what is new. */
  notes: string;
}

const whole = (value: string | undefined) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
};

/** The current release, or null until one has been set. */
export function androidRelease(): AndroidRelease | null {
  const url = (process.env.ANDROID_APK_URL ?? "").trim();
  const versionCode = whole(process.env.ANDROID_VERSION_CODE);
  if (!/^https:\/\//.test(url) || versionCode === 0) return null;
  return {
    versionName: (process.env.ANDROID_VERSION_NAME ?? "").trim() || String(versionCode),
    versionCode,
    minimumVersionCode: whole(process.env.ANDROID_MIN_VERSION_CODE),
    url,
    notes: (process.env.ANDROID_NOTES ?? "").trim(),
  };
}
