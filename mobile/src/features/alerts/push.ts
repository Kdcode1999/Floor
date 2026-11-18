// The phone's side of alerts: asking the person, getting this phone's address from the
// notification service, and handing it to Floor. The web build uses push.web.ts instead.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isRunningInExpoGo } from "expo";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { Platform } from "react-native";

import type { AlertState } from "./logic";

/** The Android channel alerts arrive on. The server names the same one. */
const CHANNEL = "alerts";

/** The id of the Expo project the app was built in. Alerts are addressed through it. */
const projectId: string | undefined =
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;

/**
 * Alerts need a real phone, not a simulator, and a build made in an Expo project. Expo Go on
 * Android cannot receive them at all, so there the app says so instead of asking.
 */
const supported = Device.isDevice && projectId !== undefined && !(Platform.OS === "android" && isRunningInExpoGo());

/** Called once when the app starts: how an alert shows while the app is open, and Android's channel. */
export function setUpAlerts(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  if (Platform.OS === "android") {
    Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Alerts",
      description: "New setups, new lessons and live sessions from your mentor.",
      importance: AndroidImportance.HIGH,
    }).catch(() => {});
  }
}

export async function alertState(): Promise<AlertState> {
  if (!supported) return "unsupported";
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status === "granted") return "on";
    return status === "undetermined" || canAskAgain ? "not_asked" : "refused";
  } catch {
    return "unsupported";
  }
}

/** Gets this phone's address and gives it to Floor. Quietly does nothing if alerts are not on. */
export async function shareAddress(client: SupabaseClient): Promise<boolean> {
  if (!supported || (await alertState()) !== "on") return false;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await client.rpc("save_push_token", { p_token: token, p_platform: Platform.OS });
    return !error;
  } catch {
    return false;
  }
}

/** Asks the person to allow alerts, then hands this phone's address to Floor. Resolves with where things stand. */
export async function turnOnAlerts(client: SupabaseClient): Promise<AlertState> {
  if (!supported) return "unsupported";
  try {
    const asked = await Notifications.requestPermissionsAsync();
    if (asked.status !== "granted") return asked.canAskAgain ? "not_asked" : "refused";
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
