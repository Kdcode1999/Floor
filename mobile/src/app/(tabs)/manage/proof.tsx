import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { Linking, StyleSheet } from "react-native";

import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Loading, Trouble } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { proofUrl } from "@/features/manage/api";
import { supabase } from "@/lib/supabase";
import { useLoad } from "@/lib/useLoad";
import { useTheme } from "@/theme/ThemeContext";

/** The proof a member sent with a request: a photo shown in place, or a PDF to open. */
export default function ProofScreen() {
  const theme = useTheme();
  const { path, name } = useLocalSearchParams<{ path?: string; name?: string }>();
  const client = supabase;
  // The address only works for a few minutes and only for the member and the space's staff.
  const file = useLoad(client && path ? () => proofUrl(client, path) : null, `proof:${path}`);
  const pdf = (path ?? "").toLowerCase().endsWith(".pdf");

  return (
    <Screen header={<BackHeader title={name ? `From ${name}` : "Proof"} backLabel="Back" fallback="/manage" />}>
      {file.loading ? (
        <Loading />
      ) : file.error || !file.data ? (
        <Trouble detail={file.error} onRetry={file.reload} />
      ) : pdf ? (
        <Card style={styles.card}>
          <AppText size={15} line={22} color={theme.text2}>
            This proof is a PDF.
          </AppText>
          <Button label="Open the PDF" onPress={() => Linking.openURL(file.data ?? "")} />
        </Card>
      ) : (
        <Card style={styles.photo}>
          <Image
            source={{ uri: file.data }}
            accessibilityLabel={`The proof ${name ?? "the member"} sent`}
            contentFit="contain"
            style={styles.image}
          />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14, padding: 20 },
  photo: { padding: 8, overflow: "hidden" },
  image: { width: "100%", aspectRatio: 3 / 4, borderRadius: 16 },
});
