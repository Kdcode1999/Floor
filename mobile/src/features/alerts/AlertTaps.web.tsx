import { useGlobalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";

import { useSpace } from "@/space/SpaceContext";

/**
 * The web app's version of AlertTaps. The service worker (public/sw.js) already opens the right
 * screen for a tapped alert. What it cannot do is switch space: the screen's address carries
 * `space=` for that, and this switches to it if the person belongs to that space.
 */
export function AlertTaps() {
  const { space: wanted } = useGlobalSearchParams<{ space?: string }>();
  const { status, space, entries, choose } = useSpace();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!wanted || status !== "ready" || handled.current === wanted) return;
    handled.current = wanted;
    if (wanted !== space.id && entries.some((entry) => entry.id === wanted)) choose(wanted);
  }, [wanted, status, space.id, entries, choose]);

  return null;
}
