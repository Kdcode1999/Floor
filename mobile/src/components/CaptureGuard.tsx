import * as ScreenCapture from "expo-screen-capture";
import { useEffect } from "react";
import { Platform } from "react-native";

import { useSpace } from "@/space/SpaceContext";

const KEY = "floor-space";

/**
 * Stops screenshots and screen recording while a member is inside a space whose mentor has
 * that protection switched on. On iPhone it also hides the app's contents in the app switcher.
 *
 * The mentor and admins are left alone: they made the content, and they share pieces of it to
 * bring people in. Nothing is drawn: this only tells the phone what to allow.
 */
export function CaptureGuard() {
  const { status, space, isStaff } = useSpace();
  const on = status === "ready" && space.blockCapture && !isStaff;

  useEffect(() => {
    // A browser has no such control. The web build is only for checking screens.
    if (Platform.OS === "web" || !on) return;
    ScreenCapture.preventScreenCaptureAsync(KEY).catch(() => {});
    if (Platform.OS === "ios") ScreenCapture.enableAppSwitcherProtectionAsync(0.8).catch(() => {});
    return () => {
      ScreenCapture.allowScreenCaptureAsync(KEY).catch(() => {});
      if (Platform.OS === "ios") ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => {});
    };
  }, [on]);

  return null;
}
