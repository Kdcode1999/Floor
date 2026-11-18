// The web app's alerts: the Web Push standard, through the browser's own push service. On an
// iPhone this works only once Floor has been added to the home screen (iOS 16.4 and later):
// Safari itself offers no alerts to a web page. The service worker that shows them is
// public/sw.js.

import type { SupabaseClient } from "@supabase/supabase-js";

import { VAPID_PUBLIC_KEY } from "@/lib/env";

import type { AlertState } from "./logic";

/** True on an iPhone or iPad, in Safari or in a home-screen web app. */
export function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS reports itself as a Mac, with a touch screen.
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** True when Floor runs as an app of its own from the home screen, not inside a browser tab. */
export function isHomeScreenApp(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

const pushWorks = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && VAPID_PUBLIC_KEY !== "";

let registering: Promise<ServiceWorkerRegistration> | null = null;

function worker(): Promise<ServiceWorkerRegistration> {
  registering ??= navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return registering;
}

/** Called once when the app starts. Registers the service worker where alerts can work. */
export function setUpAlerts(): void {
  if (pushWorks()) worker().catch(() => {});
}

export async function alertState(): Promise<AlertState> {
  // Safari on an iPhone offers alerts only to Floor added to the home screen.
  if (isAppleMobile() && !isHomeScreenApp()) return "needs_home_screen";
  if (!pushWorks()) return "unsupported";
  if (Notification.permission === "granted") return "on";
  return Notification.permission === "denied" ? "refused" : "not_asked";
}

/** The browser's key as the push service wants it: bytes from the base64url text. */
function keyBytes(text: string): Uint8Array<ArrayBuffer> {
  const padded = (text + "=".repeat((4 - (text.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

/** Subscribes this web app and gives the subscription to Floor. Quietly does nothing if alerts are not on. */
export async function shareAddress(client: SupabaseClient): Promise<boolean> {
  if ((await alertState()) !== "on") return false;
  try {
    const registration = await worker();
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
    const { error } = await client.rpc("save_push_token", { p_token: JSON.stringify(subscription.toJSON()), p_platform: "web" });
    return !error;
  } catch {
    return false;
  }
}

/** Asks the person to allow alerts, then hands this web app's address to Floor. */
export async function turnOnAlerts(client: SupabaseClient): Promise<AlertState> {
  const before = await alertState();
  if (before === "unsupported" || before === "needs_home_screen") return before;
  try {
    const answer = await Notification.requestPermission();
    if (answer !== "granted") return answer === "denied" ? "refused" : "not_asked";
  } catch {
    return "unsupported";
  }
  await shareAddress(client);
  return "on";
}

/** Tells Floor to stop alerting this account, when the person signs out. Never holds sign-out up. */
export async function forgetAddress(client: SupabaseClient): Promise<void> {
  const call = Promise.resolve(client.rpc("remove_push_token")).then(
    () => {},
    () => {},
  );
  await Promise.race([call, new Promise<void>((resolve) => setTimeout(resolve, 2500))]);
}
