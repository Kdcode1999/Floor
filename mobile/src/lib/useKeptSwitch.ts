import { useEffect, useState } from "react";

import { secureStore } from "./secureStorage";

/** A switch this phone remembers between visits, such as a data saver. Off until it is read. */
export function useKeptSwitch(key: string): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    secureStore.get(key).then(
      (kept) => setOn(kept === "on"),
      () => {},
    );
  }, [key]);
  const change = (next: boolean) => {
    setOn(next);
    (next ? secureStore.set(key, "on") : secureStore.remove(key)).catch(() => {});
  };
  return [on, change];
}
