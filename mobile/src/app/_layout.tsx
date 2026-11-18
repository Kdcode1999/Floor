import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { holdFor, stageFor } from "@/auth/stage";
import { CaptureGuard } from "@/components/CaptureGuard";
import { AlertTaps } from "@/features/alerts/AlertTaps";
import { setUpAlerts } from "@/features/alerts/push";
import { missingSettings } from "@/lib/env";
import { SpaceProvider, useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

// How an alert shows while the app is open, and the channel alerts arrive on.
setUpAlerts();

// Keep the splash screen up until the fonts are in and the app knows what to show first, so
// nothing flashes past.
SplashScreen.preventAutoHideAsync();

/** The longest the splash screen stays up. After that the app shows its own waiting screen. */
const SPLASH_LIMIT_MS = 5000;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  // If the fonts fail to load the app still opens, in the phone's own font.
  const fontsReady = fontsLoaded || fontError != null;

  if (!fontsReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <AuthProvider>
          <SpaceProvider>
            <CaptureGuard />
            <GuardedStack />
          </SpaceProvider>
        </AuthProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

/**
 * The app has three parts and shows exactly one at a time:
 * - the sign-in screens, for someone signed out
 * - the hold screen, for someone signed in who cannot go further yet
 * - the space itself
 * The router moves between them by itself as sign-in and the space change.
 */
function GuardedStack() {
  const theme = useTheme();
  const auth = useAuth();
  const space = useSpace();

  // A release build without its settings stops at the hold screen, which says so.
  const stage = missingSettings ? "hold" : stageFor(auth.status, space.status);
  const starting = !missingSettings && stage === "hold" && holdFor(auth.status, space.status) === "loading";

  useEffect(() => {
    if (!starting) {
      SplashScreen.hideAsync();
      return;
    }
    const timer = setTimeout(() => SplashScreen.hideAsync(), SPLASH_LIMIT_MS);
    return () => clearTimeout(timer);
  }, [starting]);

  // The colour behind every screen. It shows for a moment while screens change or the keyboard
  // moves, so it has to match the theme.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.background).catch(() => {});
  }, [theme.background]);

  return (
    <>
      <StatusBar style={theme.dark ? "light" : "dark"} />
      {stage === "app" ? <AlertTaps /> : null}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
        <Stack.Protected guard={stage === "app"}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="account" />
          <Stack.Screen name="compose" />
          <Stack.Screen name="post" />
          <Stack.Screen name="picture" options={{ animation: "fade" }} />
          <Stack.Screen name="lesson" />
          <Stack.Screen name="alerts" />
          <Stack.Screen name="report" />
        </Stack.Protected>
        <Stack.Protected guard={stage === "sign-in"}>
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="code" />
        </Stack.Protected>
        <Stack.Protected guard={stage === "hold"}>
          <Stack.Screen name="hold" options={{ animation: "fade" }} />
        </Stack.Protected>
        {/* Open to anyone signed in, whether or not they are in a space yet. */}
        <Stack.Protected guard={stage !== "sign-in"}>
          <Stack.Screen name="create" />
          <Stack.Screen name="mentor-terms" />
          <Stack.Screen name="delete-account" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
