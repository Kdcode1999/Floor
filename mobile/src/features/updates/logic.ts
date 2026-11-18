// Updating the Android app, which comes from Floor's own site rather than a store. When the app
// opens it asks Floor's server which release is current, and compares its own build number.

export interface Release {
  versionName: string;
  versionCode: number;
  minimumVersionCode: number;
  url: string;
  notes: string;
}

/** "none": up to date. "available": a newer one can be had. "required": this one may no longer be used. */
export type UpdateState = "none" | "available" | "required";

/** Where this build stands against the current release. A build number that cannot be read never forces anything. */
export function updateState(current: number | null, release: Release | null): UpdateState {
  if (!release || current === null || !Number.isInteger(current) || current <= 0) return "none";
  if (release.minimumVersionCode > 0 && current < release.minimumVersionCode) return "required";
  return current < release.versionCode ? "available" : "none";
}

/** Reads what the server answered, or null when it is not a release. */
export function readRelease(answer: unknown): Release | null {
  if (!answer || typeof answer !== "object") return null;
  const value = answer as Record<string, unknown>;
  const code = value.versionCode;
  const url = value.url;
  if (typeof code !== "number" || !Number.isInteger(code) || code <= 0 || typeof url !== "string" || !url.startsWith("https://")) return null;
  const minimum = typeof value.minimumVersionCode === "number" && Number.isInteger(value.minimumVersionCode) ? value.minimumVersionCode : 0;
  return {
    versionName: typeof value.versionName === "string" && value.versionName ? value.versionName : String(code),
    versionCode: code,
    minimumVersionCode: Math.max(0, minimum),
    url,
    notes: typeof value.notes === "string" ? value.notes : "",
  };
}
