import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { SpaceHeader } from "@/components/SpaceHeader";
import { ActionTile } from "@/features/manage/ActionTile";
import { RequestCard } from "@/features/manage/RequestCard";
import { sampleRequests } from "@/features/manage/sample";
import { SettingsRow } from "@/features/manage/SettingsRow";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

/** Mentor home: the three things a mentor does most, who is waiting for VIP, and the settings. */
export default function ManageScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { isMentor } = useSpace();
  const [requests, setRequests] = useState(sampleRequests);

  // Approving and declining only clear the sample request for now.
  const settle = (id: string) => setRequests((current) => current.filter((request) => request.id !== id));

  return (
    <Screen header={<SpaceHeader />} gap={16}>
      <View style={styles.tiles}>
        <ActionTile icon="plus" label="New post" />
        <ActionTile icon="live" label="Go live" primary />
        <ActionTile icon="lesson" label="Add lesson" />
      </View>

      <View style={styles.section}>
        <View style={styles.heading}>
          <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
            Requests
          </AppText>
          {requests.length > 0 ? (
            <View
              style={[styles.count, { backgroundColor: theme.chip.background, borderColor: theme.chip.border }]}>
              <AppText size={12} line={16} weight="semibold" tabular>
                {requests.length}
              </AppText>
            </View>
          ) : null}
        </View>
        {requests.length === 0 ? (
          <Card style={styles.none}>
            <AppText size={14} line={20} color={theme.text2}>
              No one is waiting.
            </AppText>
          </Card>
        ) : (
          requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              onApprove={() => settle(request.id)}
              onDecline={() => settle(request.id)}
            />
          ))
        )}
      </View>

      <Card style={styles.rows}>
        {isMentor ? (
          <SettingsRow
            title="Space look"
            detail="Logo, name and theme"
            onPress={() => router.push("/manage/look")}
          />
        ) : null}
        <SettingsRow title="Groups" detail="Create groups and choose who gets in" divided={isMentor} />
        {isMentor ? (
          <SettingsRow title="Protection" detail="Logins, screenshots and paid video" divided />
        ) : null}
        <SettingsRow title="Members" detail="Who is VIP and who is expiring" divided />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: "row", gap: 10 },
  section: { gap: 10 },
  heading: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 6 },
  count: {
    minWidth: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    borderRadius: 11,
    borderWidth: 1,
  },
  none: { paddingVertical: 18, paddingHorizontal: 20 },
  rows: { paddingVertical: 2, paddingHorizontal: 18 },
});
