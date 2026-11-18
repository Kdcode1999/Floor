import * as Application from "expo-application";
import { isRunningInExpoGo } from "expo";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

import { SITE_URL } from "@/lib/env";

import { readRelease, updateState, type Release, type UpdateState } from "./logic";

/**
 * Only the Android app downloaded from Floor's site updates this way. iPhone's web app always
 * loads the newest build, and Expo Go and development builds have nothing to download.
 */
const checks = Platform.OS === "android" && !__DEV__ && !isRunningInExpoGo() && SITE_URL !== "";

/** The answer, shared by everything that asks during one opening of the app. */
let asked: Promise<Release | null> | null = null;

function currentRelease(): Promise<Release | null> {
  asked ??= fetch(`${SITE_URL}/api/android`, { headers: { Accept: "application/json" } })
    .then((response) => (response.ok ? response.json() : null))
    .then(readRelease, () => null);
  return asked;
}

/** Whether a newer Android app is out, and where to get it. Never holds the app up: no answer means no update. */
export function useUpdate(): { state: UpdateState; release: Release | null } {
  const [found, setFound] = useState<{ state: UpdateState; release: Release | null }>({ state: "none", release: null });

  useEffect(() => {
    if (!checks) return;
    let current = true;
    currentRelease().then((release) => {
      const build = Number(Application.nativeBuildVersion);
      if (current) setFound({ state: updateState(Number.isFinite(build) ? build : null, release), release });
    });
    return () => {
      current = false;
    };
  }, []);

  return found;
}
