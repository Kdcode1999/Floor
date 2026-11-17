import { useState } from "react";

/**
 * Runs the things a screen's buttons do, one at a time, and keeps track of which one is under
 * way and what went wrong. An action resolves with a message to show, or null when it worked.
 */
export function useAction() {
  /** The name of the action under way, so the right button can show it is busy. */
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (name: string, action: () => Promise<string | null>, then?: () => void) => {
    if (busy) return;
    setBusy(name);
    setError(null);
    const problem = await action();
    setBusy(null);
    if (problem) setError(problem);
    else then?.();
  };

  return { busy, error, run, clearError: () => setError(null) };
}
