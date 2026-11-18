import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { Redirect } from "expo-router";
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorLine, Loading, Trouble } from "@/components/LoadState";
import { Pill } from "@/components/Pill";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { loadWaysIn, redeemCode, sendProof, type WaysIn } from "@/features/vip/api";
import { declinedLine, latestRequests, type AccessRequest, type RequestKind } from "@/features/vip/logic";
import { database } from "@/lib/database";
import { days, formatDay, formatPrice } from "@/lib/format";
import { pickPicture, type Picture } from "@/lib/pictures";
import { useLoad } from "@/lib/useLoad";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

/**
 * Getting VIP, inside the app: the mentor's price and how to pay them, sending proof of a
 * payment or a broker account, and using an invite code. Members pay the mentor directly, by
 * bank transfer or USDT. Floor never touches the money.
 */
export default function VipScreen() {
  const theme = useTheme();
  const auth = useAuth();
  const { space, viewer, isStaff, refresh } = useSpace();
  const userId = auth.user?.id ?? null;
  const ways = useLoad(userId && !isStaff ? () => loadWaysIn(database, space.id, userId) : null, `vip:${space.id}:${userId}`);

  // The mentor and admins have VIP by their role.
  if (isStaff) return <Redirect href="/" />;

  const reload = () => {
    ways.reload();
    refresh();
  };

  return (
    <Screen
      hasNav={false}
      header={<BackHeader title={viewer.vip ? "Add more VIP time" : "Get VIP"} backLabel="Back" fallback="/" />}
      onRefresh={reload}
      refreshing={ways.refreshing}>
      <Card radius={28} style={styles.card}>
        <Pill label={viewer.vip ? "VIP" : "Free member"} style={styles.pill} />
        <AppText accessibilityRole="header" size={22} line={28} weight="bold" tracking={-0.5}>
          {viewer.vip && viewer.vipUntil ? `You're VIP until ${formatDay(viewer.vipUntil)}` : `VIP in ${space.name}`}
        </AppText>
        <AppText size={14} line={20} color={theme.text2}>
          VIP opens every setup and post, the course, the live sessions and the VIP groups.
        </AppText>
      </Card>

      {ways.loading ? (
        <Loading />
      ) : ways.error ? (
        <Trouble detail={ways.error} onRetry={ways.reload} />
      ) : ways.data && userId ? (
        <WaysInView ways={ways.data} spaceId={space.id} spaceName={space.name} userId={userId} onChanged={reload} />
      ) : null}
    </Screen>
  );
}

interface WaysInViewProps {
  ways: WaysIn;
  spaceId: string;
  spaceName: string;
  userId: string;
  onChanged: () => void;
}

function WaysInView({ ways, spaceId, spaceName, userId, onChanged }: WaysInViewProps) {
  const theme = useTheme();
  const latest = latestRequests(ways.requests);
  const canPay = Boolean(ways.paymentInstructions || ways.paymentLink);
  const price = ways.priceCents !== null && ways.currency ? `${formatPrice(ways.priceCents, ways.currency)} for ${days(ways.vipDays)}` : null;
  const [copied, setCopied] = useState(false);

  return (
    <>
      {canPay ? (
        <Card radius={28} style={styles.card}>
          <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
            Pay {spaceName}
          </AppText>
          {price ? (
            <AppText size={20} line={26} weight="bold">
              {price}
            </AppText>
          ) : null}
          {ways.paymentInstructions ? (
            <>
              <AppText size={15} line={22} selectable>
                {ways.paymentInstructions}
              </AppText>
              <Button
                label={copied ? "Copied" : "Copy payment details"}
                kind="ghost"
                size="medium"
                onPress={() => {
                  Clipboard.setStringAsync(ways.paymentInstructions ?? "").then(() => setCopied(true), () => {});
                }}
              />
            </>
          ) : null}
          {ways.paymentLink ? (
            <Button label="Open the payment page" kind="ghost" size="medium" onPress={() => Linking.openURL(ways.paymentLink ?? "").catch(() => {})} />
          ) : null}
          <ProofForm
            kind="payment"
            latest={latest.payment}
            spaceId={spaceId}
            spaceName={spaceName}
            userId={userId}
            noteLabel="Note for your mentor"
            notePlaceholder="Transfer from Ada O."
            onSent={onChanged}
          />
          <AppText size={13} line={18} color={theme.text3}>
            You pay {spaceName} directly. Floor never holds your money.
          </AppText>
        </Card>
      ) : null}

      {ways.brokerLink ? (
        <Card radius={28} style={styles.card}>
          <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
            Free VIP with a broker account
          </AppText>
          <AppText size={15} line={22} color={theme.text2}>
            Open an account with {ways.brokerName ?? "the mentor's broker"} through this link, then send proof. You get {days(ways.brokerDays)} of VIP.
          </AppText>
          <Button label="Open the broker's page" kind="ghost" size="medium" onPress={() => Linking.openURL(ways.brokerLink ?? "").catch(() => {})} />
          <ProofForm
            kind="broker"
            latest={latest.broker}
            spaceId={spaceId}
            spaceName={spaceName}
            userId={userId}
            noteLabel="Your account number"
            notePlaceholder="4830 2291"
            onSent={onChanged}
          />
          <AppText size={13} line={18} color={theme.text3}>
            {spaceName} may be paid by the broker for accounts opened through this link.
          </AppText>
        </Card>
      ) : null}

      <InviteCode spaceId={spaceId} onUsed={onChanged} />

      {!canPay && !ways.brokerLink ? (
        <AppText size={14} line={20} color={theme.text2} style={styles.center}>
          {spaceName} has not said how to pay yet. Ask them how to get VIP.
        </AppText>
      ) : null}
    </>
  );
}

interface ProofFormProps {
  kind: RequestKind;
  latest: AccessRequest | undefined;
  spaceId: string;
  spaceName: string;
  userId: string;
  noteLabel: string;
  notePlaceholder: string;
  onSent: () => void;
}

/** A screenshot or photo of the receipt or the account, sent to the mentor's queue. */
function ProofForm({ kind, latest, spaceId, spaceName, userId, noteLabel, notePlaceholder, onSent }: ProofFormProps) {
  const theme = useTheme();
  const [picture, setPicture] = useState<Picture | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (latest?.status === "pending") {
    return (
      <View style={[styles.sent, { borderColor: theme.tile.border }]} accessibilityLiveRegion="polite">
        <AppText size={15} line={22} weight="semibold">
          Sent on {formatDay(latest.created_at)}
        </AppText>
        <AppText size={14} line={20} color={theme.text2}>
          Waiting for {spaceName} to check it. You get VIP here the moment they approve it.
        </AppText>
      </View>
    );
  }

  const send = async () => {
    if (!picture) return setError("Choose a screenshot or photo first.");
    setBusy(true);
    setError(null);
    const problem = await sendProof(database, spaceId, userId, kind, picture, note);
    setBusy(false);
    if (problem) return setError(problem);
    setPicture(null);
    setNote("");
    onSent();
  };

  return (
    <View style={styles.form}>
      {latest?.status === "declined" ? (
        <AppText size={14} line={20} color={theme.error}>
          {declinedLine(latest)}
        </AppText>
      ) : null}
      {picture ? (
        <View style={styles.chosen}>
          <Image source={{ uri: picture.uri }} accessibilityLabel="The proof you chose" contentFit="cover" style={styles.thumb} />
          <Button label="Choose another" kind="ghost" size="medium" style={styles.grow} onPress={() => pickPicture().then((chosen) => chosen && setPicture(chosen))} />
        </View>
      ) : (
        <Button
          label={kind === "payment" ? "Choose a screenshot of the payment" : "Choose a screenshot of the account"}
          kind="ghost"
          size="medium"
          onPress={() =>
            pickPicture().then((chosen) => {
              if (chosen) {
                setPicture(chosen);
                setError(null);
              }
            })
          }
        />
      )}
      <TextField label={noteLabel} value={note} onChangeText={setNote} placeholder={notePlaceholder} maxLength={200} />
      <ErrorLine text={error} />
      <Button label="Send for approval" busy={busy} onPress={send} />
    </View>
  );
}

/** An invite code from the mentor: VIP at once. */
function InviteCode({ spaceId, onUsed }: { spaceId: string; onUsed: () => void }) {
  const theme = useTheme();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const use = async () => {
    if (code.trim() === "") return setError("Type the code first.");
    setBusy(true);
    setError(null);
    const problem = await redeemCode(database, spaceId, code);
    setBusy(false);
    if (problem) return setError(problem);
    setDone(true);
    setCode("");
    onUsed();
  };

  return (
    <Card radius={28} style={styles.card}>
      <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
        Have an invite code?
      </AppText>
      {done ? (
        <AppText size={15} line={22} color={theme.text2} accessibilityLiveRegion="polite">
          The code worked. Your VIP is on.
        </AppText>
      ) : null}
      <TextField
        label="Invite code"
        value={code}
        onChangeText={(text) => {
          setCode(text.toUpperCase());
          setError(null);
          setDone(false);
        }}
        placeholder="WELCOME7"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={40}
        code
      />
      <ErrorLine text={error} />
      <Button label="Use code" kind="ghost" busy={busy} onPress={use} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14, padding: 22 },
  pill: { alignSelf: "flex-start" },
  center: { textAlign: "center", paddingHorizontal: 12 },
  form: { gap: 12 },
  sent: { gap: 4, padding: 14, borderRadius: 16, borderWidth: 1 },
  chosen: { flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: { width: 64, height: 64, borderRadius: 12 },
  grow: { flex: 1 },
});
