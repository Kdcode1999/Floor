import { StyleSheet } from "react-native";

import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { SUPPORT_EMAIL } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import { useLoad } from "@/lib/useLoad";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

import { suspendedForStaff } from "./logic";

/**
 * Shown to a space's own staff while Floor has it suspended: that it is, why, and where to
 * answer. Members never see this: a suspended space does not open for them at all.
 */
export function SuspendedNote() {
  const theme = useTheme();
  const { space, isStaff } = useSpace();
  const client = supabase;
  const on = space.suspended && isStaff && client !== null;
  const note = useLoad(
    on && client
      ? async () => {
          const { data } = await client.from("suspensions").select("note").eq("space_id", space.id).limit(1);
          return ((data ?? []) as { note: string }[])[0]?.note ?? null;
        }
      : null,
    `suspension:${space.id}`,
  );

  if (!on) return null;
  const words = suspendedForStaff(note.data ?? null, SUPPORT_EMAIL);

  return (
    <Card radius={24} style={styles.card}>
      <AppText accessibilityRole="header" size={16} line={22} weight="semibold" color={theme.error}>
        {words.title}
      </AppText>
      <AppText size={14} line={20} color={theme.text2} selectable>
        {words.text}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 6, padding: 18 },
});
