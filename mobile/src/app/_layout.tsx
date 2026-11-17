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

import { SpaceProvider } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

// Keep the splash screen up until the fonts are in, so text never jumps from one font to another.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  // If the fonts fail to load the app still opens, in the phone's own font.
  const ready = fontsLoaded || fontError != null;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <SpaceProvider>
      <ThemedStack />
    </SpaceProvider>
  );
}

function ThemedStack() {
  const theme = useTheme();

  // The colour behind every screen. It shows for a moment while screens change or the keyboard
  // moves, so it has to match the theme.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.background).catch(() => {});
  }, [theme.background]);

  return (
    <>
      <StatusBar style={theme.dark ? "light" : "dark"} />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}
      />
    </>
  );
}
