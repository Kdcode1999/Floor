import * as Clipboard from "expo-clipboard";
import { Redirect, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Checkbox } from "@/components/Checkbox";
import { ErrorLine, Loading, Trouble } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { TextLink } from "@/components/TextLink";
import { SampleNote } from "@/features/sample/SampleNote";
import { disconnect, loadTeasers, saveSwitches, sendTest, startConnect, type ConnectSteps } from "@/features/telegram/api";
import { botHandle, chatName, codeLasts, connectLine, TEASER_SWITCHES, teaserProblem, type TeaserStatus, type TeaserSwitch } from "@/features/telegram/logic";
import { database } from "@/lib/database";
import { timeAgo } from "@/lib/format";
import { useAction } from "@/lib/useAction";
import { useLoad } from "@/lib/useLoad";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

/** How often the screen looks again: for the channel to be connected, and for how a notice went. */
const LOOK_AGAIN_MS = 4000;

/**
 * Telegram teasers: Floor's bot posts a short notice in the mentor's own Telegram channel
 * when something new is in their space, with the join link. Only the mentor sets it up.
 */
export default function TelegramScreen() {
  const theme = useTheme();
  const { space, isMentor } = useSpace();
  const loaded = useLoad(isMentor ? () => loadTeasers(database, space.id) : null, `teasers:${space.id}`);
  const [now, setNow] = useState(() => Date.now());

  // The channel is connected from inside Telegram, so the screen keeps looking while it is open.
  const { reload } = loaded;
  useFocusEffect(
    useCallback(() => {
      const timer = setInterval(() => {
        if (AppState.currentState !== "active") return;
        setNow(Date.now());
        reload();
      }, LOOK_AGAIN_MS);
      return () => clearInterval(timer);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const header = <BackHeader title="Telegram teasers" backLabel="Back to Manage" fallback="/manage" />;
  if (!isMentor) return <Redirect href="/manage" />;
  if (loaded.loading) return <Screen header={header}><Loading /></Screen>;
  if (loaded.error || !loaded.data) return <Screen header={header}><Trouble detail={loaded.error} onRetry={reload} /></Screen>;

  const status = loaded.data;
  return (
    <Screen header={header}>
      <AppText size={14} line={20} color={theme.text2} style={styles.aside}>
        Floor&apos;s bot posts a short notice in your Telegram channel when you post, with your join link. It never posts
        what is for VIP members, only that it is there.
      </AppText>
      {status.connected ? (
        <Connected status={status} now={now} onChanged={reload} />
      ) : (
        <ConnectCard spaceId={space.id} now={now} />
      )}
    </Screen>
  );
}

/** The steps to connect a channel: add the bot, post the code. */
function ConnectCard({ spaceId, now }: { spaceId: string; now: number }) {
  const theme = useTheme();
  /** The steps, and when this phone was given them: the screen's own clock may be a few seconds behind. */
  const [steps, setSteps] = useState<(ConnectSteps & { at: number }) | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"bot" | "line" | null>(null);

  const ask = useCallback(
    (renew: boolean) => {
      setBusy(true);
      setProblem(null);
      startConnect(spaceId, renew).then(
        (answer) => {
          setSteps({ ...answer, at: Date.now() });
          setBusy(false);
        },
        (error: Error) => {
          setProblem(error.message);
          setBusy(false);
        },
      );
    },
    [spaceId],
  );

  // The code already waiting is shown again. A new one is only made when the mentor asks.
  useEffect(() => {
    let current = true;
    startConnect(spaceId, false).then(
      (answer) => current && setSteps({ ...answer, at: Date.now() }),
      (error: Error) => current && setProblem(error.message),
    );
    return () => {
      current = false;
    };
  }, [spaceId]);

  const copy = async (what: "bot" | "line", text: string) => {
    await Clipboard.setStringAsync(text).catch(() => {});
    setCopied(what);
  };

  if (!steps) {
    return problem ? (
      <Card style={styles.card}>
        <AppText size={15} line={22} color={theme.text2}>
          {problem}
        </AppText>
        <Button label="Try again" kind="ghost" size="medium" busy={busy} onPress={() => ask(false)} />
      </Card>
    ) : (
      <Loading />
    );
  }

  const code = steps.code;
  const lasts = codeLasts(steps.expiresAt, Math.max(now, steps.at));
  const handle = botHandle(steps.bot);

  return (
    <>
      <Card radius={28} style={styles.card}>
        <Step number={1} title={`Add ${handle} to your channel`}>
          <AppText size={14} line={20} color={theme.text2}>
            In Telegram, open your channel, then Administrators, then Add Admin, and search for {handle}. It needs
            the right to post messages. A group works the same way.
          </AppText>
          <View style={styles.link}>
            <TextLink label={copied === "bot" ? "Copied" : "Copy the bot's name"} onPress={() => copy("bot", handle)} />
          </View>
        </Step>
        <View style={[styles.divider, { backgroundColor: theme.divider }]} />
        <Step number={2} title="Post this line in the channel">
          <View style={[styles.code, { backgroundColor: theme.input.background, borderColor: theme.input.border }]}>
            <AppText size={18} line={24} weight="semibold" tracking={0.5} selectable accessibilityLabel={`The line to post: ${connectLine(code)}`}>
              {lasts ? connectLine(code) : "The code has run out"}
            </AppText>
          </View>
          <AppText size={13} line={18} color={theme.text3}>
            {lasts ?? "Get a new code to carry on."}
          </AppText>
          {lasts ? (
            <>
              <Button label={copied === "line" ? "Copied" : "Copy the line"} size="medium" onPress={() => copy("line", connectLine(code))} />
              <View style={styles.link}>
                <TextLink label={busy ? "Getting a new code…" : "Get a new code"} disabled={busy} onPress={() => ask(true)} />
              </View>
            </>
          ) : (
            <Button label="Get a new code" size="medium" busy={busy} onPress={() => ask(true)} />
          )}
        </Step>
        <View style={[styles.divider, { backgroundColor: theme.divider }]} />
        <Step number={3} title="That is all">
          <AppText size={14} line={20} color={theme.text2}>
            The bot takes the line down and says the channel is connected. This screen changes by itself.
          </AppText>
        </Step>
      </Card>
      <SampleNote text="there is no Telegram here. The channel connects by itself in a few seconds, so you can see what comes next." />
      <ErrorLine text={problem} />
    </>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.step}>
      <View style={[styles.number, { backgroundColor: theme.iconTile.background }]}>
        <AppText size={13} line={18} weight="semibold" color={theme.iconTile.foreground}>
          {number}
        </AppText>
      </View>
      <View style={styles.stepWords}>
        <AppText accessibilityRole="header" size={16} line={22} weight="semibold" tracking={-0.16}>
          {title}
        </AppText>
        {children}
      </View>
    </View>
  );
}

/** A connected channel: what gets announced, a test, and the way out. */
function Connected({ status, now, onChanged }: { status: TeaserStatus; now: number; onChanged: () => void }) {
  const theme = useTheme();
  const { space } = useSpace();
  const act = useAction();
  /** What the mentor has just switched, shown at once while it is being saved. */
  const [pending, setPending] = useState<Partial<Record<TeaserSwitch, boolean>>>({});
  const [note, setNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // The line about a test says its piece and goes.
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 6000);
    return () => clearTimeout(timer);
  }, [note]);

  const problem = teaserProblem(status);

  const toggle = async (key: TeaserSwitch, next: boolean) => {
    setPending((current) => ({ ...current, [key]: next }));
    setNote(null);
    await act.run(`switch:${key}`, () => saveSwitches(database, space.id, { ...status, ...pending }, { [key]: next }), onChanged);
    setPending((current) => {
      const rest = { ...current };
      delete rest[key];
      return rest;
    });
  };

  return (
    <>
      <Card style={styles.card}>
        <View style={styles.words}>
          <AppText accessibilityRole="header" size={20} line={26} weight="bold" tracking={-0.4}>
            Connected to your {chatName(status)}
          </AppText>
          <AppText size={13} line={18} color={theme.text3}>
            {status.lastSentAt ? `Last notice ${timeAgo(status.lastSentAt, now).toLowerCase()}` : "Nothing has been posted there yet"}
          </AppText>
        </View>
        {problem ? (
          <AppText accessibilityLiveRegion="polite" size={14} line={20} color={theme.error}>
            {problem}
          </AppText>
        ) : null}
        <Button
          label="Send a test"
          kind="ghost"
          busy={act.busy === "test"}
          onPress={() => act.run("test", () => sendTest(database, space.id), () => setNote("A test line is on its way to your channel."))}
        />
        {note ? (
          <AppText accessibilityLiveRegion="polite" size={13} line={18} color={theme.text2}>
            {note}
          </AppText>
        ) : null}
      </Card>

      <Card style={styles.card}>
        <AppText accessibilityRole="header" size={17} line={22} weight="semibold" tracking={-0.17}>
          What gets announced
        </AppText>
        {TEASER_SWITCHES.map((each) => (
          <View key={each.key} style={styles.switch}>
            <Checkbox label={each.label} checked={pending[each.key] ?? status[each.key]} onChange={(next) => toggle(each.key, next)} />
            <AppText size={13} line={18} color={theme.text3} style={styles.detail}>
              {each.detail}
            </AppText>
          </View>
        ))}
      </Card>
      <ErrorLine text={act.error} />

      <Card style={styles.card}>
        {confirming ? (
          <>
            <AppText size={14} line={20} color={theme.text2}>
              Stop posting in your {chatName(status)}? You can connect it again at any time.
            </AppText>
            <View style={styles.pair}>
              <Button
                label="Yes, disconnect"
                size="medium"
                style={styles.half}
                busy={act.busy === "disconnect"}
                onPress={() =>
                  act.run("disconnect", () => disconnect(database, space.id), () => {
                    setConfirming(false);
                    onChanged();
                  })
                }
              />
              <Button label="Keep it" kind="ghost" size="medium" style={styles.half} onPress={() => setConfirming(false)} />
            </View>
          </>
        ) : (
          <Button label="Disconnect" kind="ghost" onPress={() => setConfirming(true)} />
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  aside: { paddingHorizontal: 6 },
  card: { gap: 16, padding: 22 },
  words: { gap: 4 },
  step: { flexDirection: "row", gap: 14 },
  number: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 14 },
  stepWords: { flex: 1, gap: 8 },
  link: { alignItems: "flex-start", marginLeft: -12, marginVertical: -8 },
  code: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1 },
  divider: { height: 1 },
  pair: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  switch: { gap: 0 },
  detail: { paddingLeft: 36 },
});
