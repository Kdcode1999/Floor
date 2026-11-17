import { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { AppText, FONT_FAMILY } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { ThemeOption } from "@/features/look/ThemeOption";
import { useGoBack } from "@/lib/useGoBack";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";
import { themeNames, themes, type ThemeName } from "@/theme/themes";

/** The longest name a space may have. The database enforces the same limit. */
const NAME_MAX = 40;

/**
 * Space look: the mentor sets the space's name and picks the theme every member will see.
 *
 * Tapping a theme tries it on across the whole app straight away. Nothing is kept until
 * "Save look" is pressed, and leaving without saving puts the old theme back.
 */
export default function LookScreen() {
  const theme = useTheme();
  const goBack = useGoBack("/manage");
  const { space, updateSpace, previewTheme } = useSpace();

  const [name, setName] = useState(space.name);
  const [choice, setChoice] = useState<ThemeName>(space.theme);

  // Stop trying a theme on when the screen closes.
  useEffect(() => () => previewTheme(null), [previewTheme]);

  const choose = (next: ThemeName) => {
    setChoice(next);
    previewTheme(next);
  };

  const cleanName = name.trim();
  const changed = cleanName !== space.name || choice !== space.theme;
  const canSave = changed && cleanName.length > 0;

  const save = () => {
    updateSpace({ name: cleanName, theme: choice });
    goBack();
  };

  return (
    <Screen header={<BackHeader title="Space look" backLabel="Back to Manage" fallback="/manage" />}>
      <Card radius={26} style={styles.identity}>
        <View style={styles.logo}>
          <Avatar name={cleanName || space.name} size={52} />
          <Pressable accessibilityRole="button" hitSlop={8} style={styles.changeLogo}>
            <AppText size={12} line={16} weight="semibold" color={theme.accent}>
              Change logo
            </AppText>
          </Pressable>
        </View>
        <View style={styles.field}>
          <AppText size={12} line={16} weight="medium" color={theme.text2} style={styles.label}>
            Space name
          </AppText>
          <TextInput
            accessibilityLabel="Space name"
            value={name}
            onChangeText={setName}
            maxLength={NAME_MAX}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            keyboardAppearance={theme.dark ? "dark" : "light"}
            selectionColor={theme.accent}
            placeholder="Your space's name"
            placeholderTextColor={theme.placeholder}
            style={[
              styles.input,
              {
                color: theme.text,
                backgroundColor: theme.input.background,
                borderColor: theme.input.border,
              },
            ]}
          />
        </View>
      </Card>

      <View style={styles.heading}>
        <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
          Theme
        </AppText>
        <AppText size={13} line={18} color={theme.text2}>
          Members see this theme everywhere in your space.
        </AppText>
      </View>

      <View accessibilityRole="radiogroup" style={styles.options}>
        {themeNames.map((themeName) => (
          <ThemeOption
            key={themeName}
            option={themes[themeName]}
            selected={choice === themeName}
            onSelect={() => choose(themeName)}
          />
        ))}
      </View>

      <Button label="Save look" disabled={!canSave} onPress={save} style={styles.save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  logo: { alignItems: "center", gap: 6 },
  changeLogo: { minHeight: 24, justifyContent: "center" },
  field: { flex: 1, gap: 6 },
  label: { paddingLeft: 4 },
  input: {
    height: 46,
    paddingVertical: 0,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    fontFamily: FONT_FAMILY.semibold,
    fontSize: 16,
  },
  heading: { gap: 2, paddingTop: 4, paddingHorizontal: 6 },
  options: { gap: 14 },
  save: { marginTop: 4 },
});
