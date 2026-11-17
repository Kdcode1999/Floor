import { Redirect, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { stageFor } from "@/auth/stage";
import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Checkbox } from "@/components/Checkbox";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { TextLink } from "@/components/TextLink";
import {
  cleanSlug,
  createSpaceMessage,
  MENTOR_TERMS_VERSION,
  NAME_MAX,
  nameProblem,
  slugify,
  slugProblem,
} from "@/features/create/rules";
import { ThemeOption } from "@/features/look/ThemeOption";
import { supabase } from "@/lib/supabase";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";
import { DEFAULT_THEME, themeNames, themes, type ThemeName } from "@/theme/themes";

type Problems = Partial<Record<"name" | "slug" | "form", string>>;

/**
 * A mentor starts their space: its name, the word their join link ends with, its theme, and
 * agreeing to the Mentor Terms. Price, payment details and links are set afterwards in Manage.
 */
export default function CreateSpaceScreen() {
  const theme = useTheme();
  const router = useRouter();
  const auth = useAuth();
  const { status, entries, choose, reload, previewTheme } = useSpace();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  /** Once the mentor types their own link word, stop writing one for them. */
  const [slugTouched, setSlugTouched] = useState(false);
  const [choice, setChoice] = useState<ThemeName>(DEFAULT_THEME);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<Problems>({});

  // Stop trying a theme on when the screen closes.
  useEffect(() => () => previewTheme(null), [previewTheme]);

  // Only for someone signed in who has no space of their own. Anyone else is sent on to
  // wherever they belong. This also moves a new mentor into their space once it is created.
  const ownsSpace = entries.some((entry) => entry.role === "mentor");
  const waiting = status === "loading" || status === "trouble";
  if (!supabase || auth.status !== "ready" || ownsSpace || waiting) {
    return <Redirect href={stageFor(auth.status, status) === "app" ? "/" : "/hold"} />;
  }
  const client = supabase;

  const typedName = (text: string) => {
    setName(text);
    if (!slugTouched) setSlug(slugify(text));
    // The link word is rewritten along with the name, so a complaint about it is out of date too.
    setProblems((current) => ({ slug: slugTouched ? current.slug : undefined }));
  };

  const typedSlug = (text: string) => {
    setSlugTouched(true);
    setSlug(cleanSlug(text));
    setProblems((current) => ({ ...current, slug: undefined, form: undefined }));
  };

  const pickTheme = (next: ThemeName) => {
    setChoice(next);
    previewTheme(next);
  };

  const submit = async () => {
    const found: Problems = {
      name: nameProblem(name) ?? undefined,
      slug: slugProblem(slug) ?? undefined,
      form: agreed ? undefined : "Agree to the Mentor Terms to go on.",
    };
    if (found.name || found.slug || found.form) {
      setProblems(found);
      return;
    }

    setBusy(true);
    setProblems({});
    const { data, error } = await client.rpc("create_space", {
      p_name: name.trim(),
      p_slug: slug,
      p_theme: choice,
      p_terms_version: MENTOR_TERMS_VERSION,
    });
    if (error) {
      setBusy(false);
      const { field, text } = createSpaceMessage(error);
      setProblems({ [field]: text });
      return;
    }
    // Open the new space. The app moves into it once it has loaded.
    choose(String(data));
    reload();
  };

  return (
    <Screen hasNav={false} header={<BackHeader title="Start your space" backLabel="Back" fallback="/hold" />}>
      <Card radius={28} style={styles.card}>
        <TextField
          label="Space name"
          value={name}
          onChangeText={typedName}
          error={problems.name}
          placeholder="Kings FX Academy"
          maxLength={NAME_MAX}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="next"
        />
        <TextField
          label="Link word"
          value={slug}
          onChangeText={typedSlug}
          error={problems.slug}
          hint="Your join link will end with this word."
          placeholder="kings-fx"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
        />
      </Card>

      <View style={styles.heading}>
        <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
          Theme
        </AppText>
        <AppText size={13} line={18} color={theme.text2}>
          Members see this theme everywhere in your space. You can change it later.
        </AppText>
      </View>

      <View accessibilityRole="radiogroup" style={styles.options}>
        {themeNames.map((themeName) => (
          <ThemeOption
            key={themeName}
            option={themes[themeName]}
            selected={choice === themeName}
            onSelect={() => pickTheme(themeName)}
          />
        ))}
      </View>

      <Card style={styles.terms}>
        <Checkbox label="I agree to the Mentor Terms" checked={agreed} onChange={setAgreed} />
        <View style={styles.read}>
          <TextLink label="Read the Mentor Terms" onPress={() => router.push("/mentor-terms")} />
        </View>
      </Card>

      <View style={styles.finish}>
        <Button label="Create space" busy={busy} onPress={submit} />
        {problems.form ? (
          <AppText accessibilityLiveRegion="polite" size={13} line={18} color={theme.error} style={styles.error}>
            {problems.form}
          </AppText>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16, padding: 22 },
  heading: { gap: 2, paddingTop: 4, paddingHorizontal: 6 },
  options: { gap: 14 },
  terms: { paddingTop: 12, paddingHorizontal: 18, paddingBottom: 4 },
  read: { alignItems: "flex-start", marginLeft: 24 },
  finish: { gap: 8, marginTop: 4 },
  error: { textAlign: "center" },
});
