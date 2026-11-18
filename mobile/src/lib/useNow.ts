import { useEffect, useState } from "react";

/**
 * The time, for wording that goes stale while a screen is open: "Starts in 12 minutes",
 * "Live for 40 min". It moves on every `everyMs`, which redraws whatever reads it.
 */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
