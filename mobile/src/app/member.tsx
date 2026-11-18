import { Redirect, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Chips } from "@/components/Chips";
import { ErrorLine, Loading, Trouble } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { loadMute, muteMember } from "@/features/chat/api";
import { MUTE_CHOICES, muteLine } from "@/features/chat/logic";
import { banMember, endVip, grantVip, loadMember, setRole, unbanMember } from "@/features/manage/api";
import { DAY_CHOICES, standing } from "@/features/manage/logic";
import { database } from "@/lib/database";
import { days, formatDay } from "@/lib/format";
import { useAction } from "@/lib/useAction";
import { useLoad } from "@/lib/useLoad";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

/**
 * One member: where they stand, and what the mentor or an admin can do about it. A full screen
 * of its own, because it opens from the list of members, from a reported message and from a
 * conversation, and has to go back to whichever it came from.
 */
export default function MemberScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { space, isMentor, isStaff } = useSpace();
  const loaded = useLoad(id ? () => loadMember(database, space.id, id) : null, `member:${space.id}:${id}`);
  const muted = useLoad(id ? () => loadMute(database, space.id, id) : null, `mute:${space.id}:${id}`);
  const act = useAction();
  const [length, setLength] = useState(30);
  const [muteHours, setMuteHours] = useState(24);
  const [now] = useState(() => Date.now());

  const member = loaded.data;
  const header = <BackHeader title={member?.name ?? "Member"} backLabel="Back" fallback="/manage/members" />;

  // Only the mentor and admins have this page. The database keeps what it does to them.
  if (!isStaff) return <Redirect href="/" />;

  if (loaded.loading) return <Screen hasNav={false} header={header}><Loading /></Screen>;
  if (loaded.error) return <Screen hasNav={false} header={header}><Trouble detail={loaded.error} onRetry={loaded.reload} /></Screen>;
  if (!member) {
    return (
      <Screen hasNav={false} header={header}>
        <Card style={styles.card}>
          <AppText size={15} line={22} color={theme.text2}>
            This person is no longer in your space.
          </AppText>
        </Card>
      </Screen>
    );
  }

  const where = standing(member, now);
  const run = (name: string, action: () => Promise<string | null>) =>
    act.run(name, action, () => {
      loaded.reload();
      muted.reload();
    });
  const mutedNow = muteLine(muted.data ?? null, now);
  const banned = member.status === "banned";
  const isMember = member.role === "member";
  const hasVip = where.kind === "vip" || where.kind === "expiring";
  // An admin may remove members. Only the mentor may remove an admin. Nobody removes the mentor.
  const canBan = member.role === "member" || (member.role === "admin" && isMentor);

  return (
    <Screen hasNav={false} header={header}>
      <Card style={styles.card}>
        <AppText accessibilityRole="header" size={22} line={28} weight="bold" tracking={-0.44}>
          {where.label}
        </AppText>
        <AppText size={13} line={18} color={theme.text3}>
          Joined {formatDay(member.joinedAt)}
        </AppText>
      </Card>

      {isMember && !banned ? (
        <Card style={styles.card}>
          <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
            {hasVip ? "Add VIP time" : "Give VIP"}
          </AppText>
          <Chips
            label="How much VIP to give"
            options={DAY_CHOICES.map((value) => ({ value, label: days(value) }))}
            value={length}
            onChange={setLength}
          />
          <Button
            label={hasVip ? `Add ${days(length)}` : `Give ${days(length)} of VIP`}
            busy={act.busy === "grant"}
            onPress={() => run("grant", () => grantVip(database, space.id, member.userId, length))}
          />
          {hasVip ? (
            <Button
              label="End VIP now"
              kind="ghost"
              busy={act.busy === "end"}
              onPress={() => run("end", () => endVip(database, space.id, member.userId))}
            />
          ) : null}
        </Card>
      ) : null}

      {isMember && !banned ? (
        <Card style={styles.card}>
          <View style={styles.words}>
            <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
              {mutedNow ?? "Mute in groups"}
            </AppText>
            <AppText size={13} line={18} color={theme.text2}>
              A muted member can still read every group they are in, but cannot write until the mute ends.
            </AppText>
          </View>
          <Chips label="How long to mute for" options={MUTE_CHOICES.map((choice) => ({ value: choice.hours, label: choice.label }))} value={muteHours} onChange={setMuteHours} />
          <Button
            label={mutedNow ? "Change the mute" : "Mute"}
            kind="ghost"
            busy={act.busy === "mute"}
            onPress={() => run("mute", () => muteMember(database, space.id, member.userId, muteHours))}
          />
          {mutedNow ? (
            <Button
              label="Unmute now"
              kind="ghost"
              busy={act.busy === "unmute"}
              onPress={() => run("unmute", () => muteMember(database, space.id, member.userId, 0))}
            />
          ) : null}
        </Card>
      ) : null}

      {isMentor && member.role !== "mentor" && !banned ? (
        <Card style={styles.card}>
          <View style={styles.words}>
            <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
              Admin
            </AppText>
            <AppText size={13} line={18} color={theme.text2}>
              An admin can approve requests, make invite codes, post and keep the groups in order. They cannot change your price, your payment details or your space&apos;s look.
            </AppText>
          </View>
          <Button
            label={member.role === "admin" ? "Remove as admin" : "Make admin"}
            kind="ghost"
            busy={act.busy === "role"}
            onPress={() => run("role", () => setRole(database, space.id, member.userId, member.role === "admin" ? "member" : "admin"))}
          />
        </Card>
      ) : null}

      {canBan || banned ? (
        <Card style={styles.card}>
          <AppText size={13} line={18} color={theme.text2}>
            {banned
              ? "This person was removed. They cannot open your space or rejoin it."
              : "Removing someone ends their VIP and shuts them out of your space. They cannot rejoin unless you let them back in."}
          </AppText>
          <Button
            label={banned ? "Let them back in" : "Remove from the space"}
            kind="ghost"
            busy={act.busy === "ban"}
            onPress={() => run("ban", () => (banned ? unbanMember(database, space.id, member.userId) : banMember(database, space.id, member.userId)))}
          />
        </Card>
      ) : null}

      <ErrorLine text={act.error} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14, padding: 20 },
  words: { gap: 4 },
});
