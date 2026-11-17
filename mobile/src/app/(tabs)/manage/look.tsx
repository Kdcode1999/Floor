import { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { AppText, FONT_FAMILY } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { uploadLogo } from "@/features/look/logo";
import { ThemeOption } from "@/features/look/ThemeOption";
import { pickPicture, type Picture } from "@/lib/pictures";
import { supabase } from "@/lib/supabase";
import { useGoBack } from "@/lib/useGoBack";
import { useAuth } from "@/auth/AuthContext";
import { useSpace, type LookChanges } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";
import { themeNames, themes, type ThemeName } from "@/theme/themes";

/** The longest name a space may have. The database enforces the same limit. */
const NAME_MAX = 40;

/**
 * Space look: the mentor sets the space's logo and name, and picks the theme every member
 * will see.
 *
 * Tapping a theme tries it on across the whole app straight away. Nothing is kept until
 * "Save look" is pressed, and leaving without saving puts the old theme back.
 */
export default function LookScreen() {
  const theme = useTheme();
  const goBack = useGoBack("/manage");
  const { sample } = useAuth();
  const { space, updateSpace, previewTheme } = useSpace();

  const [name, setName] = useState(space.name);
  const [choice, setChoice] = useState<ThemeName>(space.theme);
  /** A new logo chosen from the phone and not saved yet. */
  const [picked, setPicked] = useState<Picture | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stop trying a theme on when the screen closes.
  useEffect(() => () => previewTheme(null), [previewTheme]);

  const choose = (next: ThemeName) => {
    setChoice(next);
    previewTheme(next);
  };

  const chooseLogo = async () => {
    setError(null);
    try {
      const picture = await pickPicture(true);
      if (picture) setPicked(picture);
    } catch {
      setError("Your pictures couldn't be opened. Allow Floor to see them in your phone's settings.");
    }
  };

  const cleanName = name.trim();
  const changed = cleanName !== space.name || choice !== space.theme || picked !== null;
  const canSave = changed && cleanName.length > 0;

  const save = async () => {
    setSaving(true);
    setError(null);
    const changes: LookChanges = { name: cleanName, theme: choice };
    if (picked) {
      if (sample || !supabase) {
        // The sample space keeps nothing: the picture is shown straight from this phone.
        changes.logoPath = picked.uri;
      } else {
        try {
          changes.logoPath = await uploadLogo(supabase, space.id, picked);
        } catch {
          setSaving(false);
          setError("The logo couldn't be uploaded. Check your connection and try again.");
          return;
        }
      }
    }
    const problem = await updateSpace(changes);
    setSaving(false);
    if (problem) setError(problem);
    else goBack();
  };

  return (
    <Screen header={<BackHeader title="Space look" backLabel="Back to Manage" fallback="/manage" />}>
      <Card radius={26} style={styles.identity}>
        <View style={styles.logo}>
          <Avatar name={cleanName || space.name} image={picked?.uri ?? space.logo} size={52} />
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={chooseLogo}
            style={({ pressed }) => [styles.changeLogo, pressed && styles.pressed]}>
            <AppText size={12} line={16} weight="semibold" color={theme.accent}>
              {picked || space.logo ? "Change logo" : "Add logo"}
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

      <View style={styles.save}>
        <Button label="Save look" disabled={!canSave} busy={saving} onPress={save} />
        {error ? (
          <AppText accessibilityLiveRegion="polite" size={13} line={18} color={theme.error} style={styles.error}>
            {error}
          </AppText>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  logo: { alignItems: "center", gap: 6 },
  changeLogo: { minHeight: 24, justifyContent: "center" },
  pressed: { opacity: 0.6 },
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
  save: { gap: 8, marginTop: 4 },
  error: { textAlign: "center" },
});
