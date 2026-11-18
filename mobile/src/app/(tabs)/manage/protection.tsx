import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Card } from "@/components/Card";
import { Checkbox } from "@/components/Checkbox";
import { Icon } from "@/components/Icon";
import { ErrorLine } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

/**
 * Protection: what keeps paid content with the people who paid. Two protections are always on.
 * Two are the mentor's to switch off.
 */
export default function ProtectionScreen() {
  const theme = useTheme();
  const { space, setProtection } = useSpace();
  const [error, setError] = useState<string | null>(null);

  const change = async (changes: { blockCapture?: boolean; watermark?: boolean }) => {
    setError(await setProtection(changes));
  };

  return (
    <Screen header={<BackHeader title="Protection" backLabel="Back to Manage" fallback="/manage" />}>
      <Card radius={28} style={styles.card}>
        <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
          Always on
        </AppText>
        <Always
          title="One login at a time"
          detail="When an account signs in on a second phone, the first one is signed out. A shared login is no use to two people at once."
        />
        <Always
          title="One phone per account"
          detail="An account is tied to its phone. It can move to a new phone twice in 30 days, each time with a code sent to its email."
        />
      </Card>

      <Card radius={28} style={styles.card}>
        <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
          Yours to choose
        </AppText>
        <View style={styles.choice}>
          <Checkbox
            label="Block screenshots and screen recording"
            checked={space.blockCapture}
            onChange={(next) => change({ blockCapture: next })}
          />
          <AppText size={13} line={18} color={theme.text2} style={styles.detail}>
            Members cannot capture anything in your space. You and your admins still can.
          </AppText>
        </View>
        <View style={styles.choice}>
          <Checkbox label="Show the viewer's name on paid video" checked={space.watermark} onChange={(next) => change({ watermark: next })} />
          <AppText size={13} line={18} color={theme.text2} style={styles.detail}>
            Each member&apos;s name and email sit faintly over lessons and live sessions as they watch, so a leaked recording
            says whose it was.
          </AppText>
        </View>
        <ErrorLine text={error} />
      </Card>

      <AppText size={13} line={18} color={theme.text3} style={styles.aside}>
        Nothing stops someone filming their screen with a second phone. These make sharing harder and traceable, which is
        what keeps most people honest.
      </AppText>
    </Screen>
  );
}

function Always({ title, detail }: { title: string; detail: string }) {
  const theme = useTheme();
  return (
    <View style={styles.always}>
      <View style={[styles.tick, { backgroundColor: theme.iconTile.background }]}>
        <Icon name="check" size={14} strokeWidth={2.6} color={theme.iconTile.foreground} />
      </View>
      <View style={styles.words}>
        <AppText size={15} line={20} weight="semibold">
          {title}
        </AppText>
        <AppText size={13} line={18} color={theme.text2}>
          {detail}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16, padding: 22 },
  always: { flexDirection: "row", gap: 12 },
  tick: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 14, marginTop: 2 },
  words: { flex: 1, gap: 2 },
  choice: { gap: 4 },
  detail: { paddingLeft: 36 },
  aside: { paddingHorizontal: 6 },
});
