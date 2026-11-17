import { Redirect, Stack } from "expo-router";

import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

/**
 * Mentor home and the screens that open from it. They stay inside the Manage tab, so the
 * navigation remains in view.
 *
 * Members have no Manage tab. If one reaches this address anyway, send them to the Feed. The
 * database is what really keeps mentor actions to the mentor; this only keeps the screen tidy.
 */
export default function ManageLayout() {
  const theme = useTheme();
  const { isStaff } = useSpace();

  if (!isStaff) return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}
    />
  );
}
