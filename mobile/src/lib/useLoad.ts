import { useEffect, useRef, useState } from "react";

interface Loaded<T> {
  key: string;
  data?: T;
  error?: string;
}

/**
 * Loads something from the server for a screen and keeps track of where that stands.
 *
 * `key` names what is being loaded: when it changes, the old result is dropped and the load
 * runs again. Pass null as `load` to load nothing yet. `reload` runs it again, keeping what is
 * on screen until the new answer arrives.
 */
export function useLoad<T>(load: (() => Promise<T>) | null, key: string) {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const [round, setRound] = useState(0);
  const enabled = load !== null;

  // Keep hold of the newest loader without making the effect below run again for it.
  const latest = useRef(load);
  useEffect(() => {
    latest.current = load;
  });

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const run = latest.current;
    if (!run) return;
    run().then(
      (data) => current && setLoaded({ key, data }),
      (error: Error) => current && setLoaded({ key, error: error.message }),
    );
    return () => {
      current = false;
    };
  }, [enabled, key, round]);

  const mine = loaded?.key === key ? loaded : null;
  return {
    data: mine?.data,
    /** The server's own words when the load failed. */
    error: mine?.error ?? null,
    loading: enabled && !mine,
    reload: () => setRound((count) => count + 1),
  };
}
