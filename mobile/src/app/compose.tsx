import { Image } from "expo-image";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Chips } from "@/components/Chips";
import { ErrorLine } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { TextLink } from "@/components/TextLink";
import { createOffer, createPost, createSetup } from "@/features/feed/api";
import {
  offerProblems,
  postProblems,
  setupProblems,
  type OfferProblems,
  type PostProblems,
  type SetupProblems,
} from "@/features/feed/logic";
import type { Side } from "@/features/feed/types";
import { database } from "@/lib/database";
import { pickPicture, type Picture } from "@/lib/pictures";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

type Kind = "post" | "setup" | "offer";

const KINDS: { value: Kind; label: string }[] = [
  { value: "post", label: "Post" },
  { value: "setup", label: "Trade setup" },
  { value: "offer", label: "Offer" },
];

const AUDIENCES = [
  { value: "vip", label: "VIP only" },
  { value: "everyone", label: "Everyone" },
];

/** Where the mentor or an admin writes something new for the Feed: a post, a setup or an offer. */
export default function ComposeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string }>();
  const { space, isStaff } = useSpace();

  const [kind, setKind] = useState<Kind>(params.kind === "setup" || params.kind === "offer" ? params.kind : "post");
  const [audience, setAudience] = useState("vip");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A post.
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [embed, setEmbed] = useState("");
  const [picture, setPicture] = useState<Picture | null>(null);
  const [postWrong, setPostWrong] = useState<PostProblems>({});

  // A setup.
  const [pair, setPair] = useState("");
  const [side, setSide] = useState<Side | null>(null);
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [targets, setTargets] = useState(["", "", ""]);
  const [note, setNote] = useState("");
  const [setupWrong, setSetupWrong] = useState<SetupProblems>({});

  // An offer.
  const [offerTitle, setOfferTitle] = useState("");
  const [offerBody, setOfferBody] = useState("");
  const [link, setLink] = useState("");
  const [label, setLabel] = useState("");
  const [offerWrong, setOfferWrong] = useState<OfferProblems>({});

  if (!isStaff) return <Redirect href="/" />;

  const forEveryone = audience === "everyone";

  const choosePicture = async () => {
    setError(null);
    try {
      const chosen = await pickPicture();
      if (chosen) setPicture(chosen);
    } catch {
      setError("Your pictures couldn't be opened. Allow Floor to see them in your phone's settings.");
    }
  };

  const send = async () => {
    setError(null);
    let action: (() => Promise<string | null>) | null = null;

    if (kind === "post") {
      const found = postProblems({ title, body, embed, hasPicture: picture !== null, forEveryone });
      setPostWrong(found);
      if (Object.keys(found).length === 0) {
        action = () => createPost(database, space.id, { title, body, embed: forEveryone ? embed : "", picture, forEveryone });
      }
    } else if (kind === "setup") {
      const form = { pair, side, entry, stop, targets, note };
      const found = setupProblems(form);
      setSetupWrong(found);
      if (Object.keys(found).length === 0) action = () => createSetup(database, space.id, form, forEveryone);
    } else {
      const form = { title: offerTitle, body: offerBody, link, label };
      const found = offerProblems(form);
      setOfferWrong(found);
      if (Object.keys(found).length === 0) action = () => createOffer(database, space.id, form);
    }

    if (!action) return setError("Check the boxes marked above.");
    setSending(true);
    const problem = await action();
    setSending(false);
    if (problem) setError(problem);
    // Back to the Feed, where the new post is now on top.
    else router.dismissTo("/");
  };

  const setTarget = (index: number, value: string) => {
    setTargets((current) => current.map((each, at) => (at === index ? value : each)));
    setSetupWrong((current) => ({ ...current, targets: undefined }));
  };

  return (
    <Screen hasNav={false} header={<BackHeader title="New post" backLabel="Back" fallback="/manage" />}>
      <Chips label="What to post" options={KINDS} value={kind} onChange={(next) => { setKind(next); setError(null); }} />

      {kind === "offer" ? (
        <AppText size={13} line={18} color={theme.text2} style={styles.aside}>
          An offer is pinned to the top of the Feed, for everyone in your space. Use it for a broker deal, a discount
          code or anything else you want members to see first.
        </AppText>
      ) : (
        <View style={styles.audience}>
          <Chips label="Who can see it" options={AUDIENCES} value={audience} onChange={setAudience} />
          <AppText size={13} line={18} color={theme.text2} style={styles.aside}>
            {forEveryone
              ? "Free members can open this too."
              : "Free members see that it was posted, but cannot open it."}
          </AppText>
        </View>
      )}

      {kind === "post" ? (
        <Card radius={28} style={styles.card}>
          <TextField
            label="Title"
            value={title}
            onChangeText={(text) => { setTitle(text); setPostWrong((current) => ({ ...current, title: undefined, body: undefined })); }}
            error={postWrong.title}
            hint="Optional."
            maxLength={120}
          />
          <TextField
            label="What do you want to say?"
            value={body}
            onChangeText={(text) => { setBody(text); setPostWrong((current) => ({ ...current, body: undefined })); }}
            error={postWrong.body}
            multiline
            maxLength={4000}
          />
          {picture ? (
            <View style={styles.picked}>
              <Image
                source={{ uri: picture.uri }}
                accessibilityLabel="The picture you chose"
                contentFit="cover"
                style={[styles.thumb, { borderColor: theme.tile.border }]}
              />
              <View style={styles.pickedLinks}>
                <TextLink label="Choose another" onPress={choosePicture} />
                <TextLink label="Remove picture" onPress={() => setPicture(null)} />
              </View>
            </View>
          ) : (
            <Button label="Add a picture" kind="ghost" size="medium" onPress={choosePicture} />
          )}
          {forEveryone ? (
            <TextField
              label="Link to a video or post"
              value={embed}
              onChangeText={(text) => { setEmbed(text); setPostWrong((current) => ({ ...current, embed: undefined, body: undefined })); }}
              error={postWrong.embed}
              hint="Optional. From YouTube, X, Instagram or Facebook. It plays inside the post."
              placeholder="https://"
              autoCapitalize="none"
              autoCorrect={false}
              inputMode="url"
              keyboardType="url"
            />
          ) : null}
        </Card>
      ) : null}

      {kind === "setup" ? (
        <Card radius={28} style={styles.card}>
          <TextField
            label="Pair"
            value={pair}
            onChangeText={(text) => { setPair(text.toUpperCase()); setSetupWrong((current) => ({ ...current, pair: undefined })); }}
            error={setupWrong.pair}
            placeholder="EURUSD"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={15}
          />
          <View style={styles.group}>
            <Chips
              label="Direction"
              options={[{ value: "buy", label: "Buy" }, { value: "sell", label: "Sell" }]}
              value={side}
              onChange={(next: Side) => { setSide(next); setSetupWrong((current) => ({ ...current, side: undefined, stop: undefined, targets: undefined })); }}
            />
            <ErrorLine text={setupWrong.side ?? null} />
          </View>
          <Price label="Entry" value={entry} error={setupWrong.entry} onChange={(text) => { setEntry(text); setSetupWrong((current) => ({ ...current, entry: undefined, stop: undefined, targets: undefined })); }} />
          <Price label="Stop" value={stop} error={setupWrong.stop} onChange={(text) => { setStop(text); setSetupWrong((current) => ({ ...current, stop: undefined })); }} />
          <Price label="Target 1" value={targets[0]} error={setupWrong.targets} onChange={(text) => setTarget(0, text)} />
          <Price label="Target 2" value={targets[1]} hint="Optional." onChange={(text) => setTarget(1, text)} />
          <Price label="Target 3" value={targets[2]} hint="Optional." onChange={(text) => setTarget(2, text)} />
          <TextField
            label="Note"
            value={note}
            onChangeText={setNote}
            error={setupWrong.note}
            hint="Optional. Why you are taking it, or what to wait for."
            multiline
            maxLength={4000}
          />
          <AppText size={13} line={18} color={theme.text2}>
            The prices cannot be changed once this is posted. You can add an update or close it later.
          </AppText>
        </Card>
      ) : null}

      {kind === "offer" ? (
        <Card radius={28} style={styles.card}>
          <TextField
            label="Title"
            value={offerTitle}
            onChangeText={(text) => { setOfferTitle(text); setOfferWrong((current) => ({ ...current, title: undefined })); }}
            error={offerWrong.title}
            placeholder="Free VIP with my broker"
            maxLength={120}
          />
          <TextField
            label="A few words about it"
            value={offerBody}
            onChangeText={(text) => { setOfferBody(text); setOfferWrong((current) => ({ ...current, body: undefined })); }}
            error={offerWrong.body}
            hint="Optional."
            multiline
            maxLength={4000}
          />
          <TextField
            label="Link"
            value={link}
            onChangeText={(text) => { setLink(text); setOfferWrong((current) => ({ ...current, link: undefined })); }}
            error={offerWrong.link}
            placeholder="https://"
            autoCapitalize="none"
            autoCorrect={false}
            inputMode="url"
            keyboardType="url"
          />
          <TextField
            label="What the button says"
            value={label}
            onChangeText={(text) => { setLabel(text); setOfferWrong((current) => ({ ...current, label: undefined })); }}
            error={offerWrong.label}
            hint="Optional. It says Open if you leave this empty."
            placeholder="Open account"
            maxLength={30}
          />
        </Card>
      ) : null}

      <View style={styles.finish}>
        <Button label={kind === "offer" ? "Pin offer" : "Post"} busy={sending} onPress={send} />
        <ErrorLine text={error} />
      </View>
    </Screen>
  );
}

function Price({ label, value, error, hint, onChange }: { label: string; value: string; error?: string; hint?: string; onChange: (text: string) => void }) {
  return (
    <TextField
      label={label}
      value={value}
      onChangeText={onChange}
      error={error}
      hint={hint}
      inputMode="decimal"
      keyboardType="decimal-pad"
      maxLength={20}
    />
  );
}

const styles = StyleSheet.create({
  audience: { gap: 8 },
  aside: { paddingHorizontal: 6 },
  card: { gap: 16, padding: 22 },
  group: { gap: 6 },
  picked: { gap: 4 },
  thumb: { width: "100%", aspectRatio: 16 / 9, borderRadius: 16, borderWidth: 1 },
  pickedLinks: { flexDirection: "row", justifyContent: "space-between", marginHorizontal: -12 },
  finish: { gap: 8, marginTop: 4 },
});
