import { useRouter, type Href } from "expo-router";
import { useEffect, useRef } from "react";

import { useSpace } from "@/space/SpaceContext";

import { routeFor, spaceOf, type AlertData } from "./logic";
import { Notifications } from "./notifications";

/**
 * Opens the right screen when the person taps an alert: the lesson, the live session, or the
 * Feed. If the alert came from another of their spaces, the app switches to that space first.
 * Nothing is drawn. It is mounted only inside the app's own screens, so a tap never opens
 * anything for someone who is signed out. The web build has its own empty version, and inside
 * Expo Go there are no alerts to tap.
 */
export function AlertTaps() {
  return Notifications ? <Taps notifications={Notifications} /> : null;
}

function Taps({ notifications }: { notifications: NonNullable<typeof Notifications> }) {
  const router = useRouter();
  const { status, space, entries, choose } = useSpace();
  const response = notifications.useLastNotificationResponse();
  /** The tap already acted on, so going back to this screen does not act on it again. */
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!response || status !== "ready") return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    const data = response.notification.request.content.data as AlertData | null;

    const from = spaceOf(data);
    if (from && from !== space.id) {
      // Switch first. This effect runs again once the other space is the one on screen.
      if (entries.some((entry) => entry.id === from)) choose(from);
      else handled.current = id;
      return;
    }
    handled.current = id;
    router.push(routeFor(data) as Href);
  }, [response, status, space.id, entries, choose, router]);

  return null;
}
