import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { Loading, Trouble } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { SpaceHeader } from "@/components/SpaceHeader";
import { TextLink } from "@/components/TextLink";
import { ActionTile } from "@/features/manage/ActionTile";
import { approveRequest, declineRequest, loadRequests, type RequestItem } from "@/features/manage/api";
import { RequestCard } from "@/features/manage/RequestCard";
import { sampleRequests } from "@/features/manage/sample";
import { SettingsRow } from "@/features/manage/SettingsRow";
import { timeAgo } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useLoad } from "@/lib/useLoad";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

/** How many requests Mentor home shows before pointing to the full queue. */
const SHOWN = 3;

/** Mentor home: the three things a mentor does most, who is waiting for VIP, and the settings. */
export default function ManageScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { sample } = useAuth();
  const { space, isMentor } = useSpace();
  const client = sample ? null : supabase;

  const queue = useLoad(client ? () => loadRequests(client, space.id) : null, `requests:${space.id}`);
  const [samples, setSamples] = useState(sampleRequests);
  const [now] = useState(() => Date.now());

  // Look again whenever the mentor comes back to this screen.
  const { reload } = queue;
  useFocusEffect(
    useCallback(() => {
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const requests: RequestItem[] = client ? (queue.data ?? []) : samples;
  const settle = async (id: string, action: (() => Promise<string | null>) | null) => {
    if (!action) {
      // The sample space: just take the request off the list.
      setSamples((current) => current.filter((request) => request.id !== id));
      return null;
    }
    const problem = await action();
    if (!problem) reload();
    return problem;
  };

  return (
    <Screen header={<SpaceHeader />} gap={16}>
      <View style={styles.tiles}>
        <ActionTile icon="plus" label="New post" onPress={() => router.push("/compose")} />
        <ActionTile icon="live" label="Go live" primary />
        <ActionTile icon="lesson" label="Add lesson" />
      </View>

      <View style={styles.section}>
        <View style={styles.heading}>
          <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
            Requests
          </AppText>
          {requests.length > 0 ? (
            <View style={[styles.count, { backgroundColor: theme.chip.background, borderColor: theme.chip.border }]}>
              <AppText size={12} line={16} weight="semibold" tabular>
                {requests.length}
              </AppText>
            </View>
          ) : null}
        </View>
        {client && queue.loading ? (
          <Loading />
        ) : client && queue.error ? (
          <Trouble detail={queue.error} onRetry={reload} />
        ) : requests.length === 0 ? (
          <Card style={styles.none}>
            <AppText size={14} line={20} color={theme.text2}>
              No one is waiting.
            </AppText>
          </Card>
        ) : (
          requests.slice(0, SHOWN).map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              sent={client ? timeAgo(request.createdAt, now) : undefined}
              onApprove={() => settle(request.id, client ? () => approveRequest(client, request.id) : null)}
              onDecline={(reason) => settle(request.id, client ? () => declineRequest(client, request.id, reason) : null)}
              onProof={
                client && request.proofPath
                  ? () => router.push({ pathname: "/manage/proof", params: { path: request.proofPath ?? "", name: request.name } })
                  : undefined
              }
            />
          ))
        )}
        {requests.length > SHOWN ? (
          <View style={styles.more}>
            <TextLink label={`See all ${requests.length}`} onPress={() => router.push("/manage/requests")} />
          </View>
        ) : null}
      </View>

      <Card style={styles.rows}>
        {isMentor ? (
          <SettingsRow title="Space look" detail="Logo, name and theme" onPress={() => router.push("/manage/look")} />
        ) : null}
        {isMentor ? (
          <SettingsRow
            title="Price and payment"
            detail="What VIP costs and how members pay you"
            divided
            onPress={client ? () => router.push("/manage/setup") : undefined}
          />
        ) : null}
        <SettingsRow
          title="Invite codes"
          detail="Give VIP with a code"
          divided={isMentor}
          onPress={client ? () => router.push("/manage/codes") : undefined}
        />
        <SettingsRow title="Groups" detail="Create groups and choose who gets in" divided />
        {isMentor ? <SettingsRow title="Protection" detail="Logins, screenshots and paid video" divided /> : null}
        <SettingsRow
          title="Members"
          detail="Who is VIP and who is expiring"
          divided
          onPress={client ? () => router.push("/manage/members") : undefined}
        />
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
  more: { alignItems: "center" },
  rows: { paddingVertical: 2, paddingHorizontal: 18 },
});
