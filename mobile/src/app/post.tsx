import { Redirect, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { BackHeader } from "@/components/BackHeader";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Checkbox } from "@/components/Checkbox";
import { ErrorLine, Loading, Trouble } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { deletePost, editPost, loadPost, updateSetup } from "@/features/feed/api";
import { offerProblems } from "@/features/feed/logic";
import type { FeedPost } from "@/features/feed/types";
import { supabase } from "@/lib/supabase";
import { useAction } from "@/lib/useAction";
import { useGoBack } from "@/lib/useGoBack";
import { useLoad } from "@/lib/useLoad";
import { useSpace } from "@/space/SpaceContext";
import { useTheme } from "@/theme/ThemeContext";

const TITLES: Record<FeedPost["kind"], string> = { post: "Post", setup: "Trade setup", offer: "Offer", lesson: "Lesson" };

/** Where the mentor or an admin changes or removes something they posted. */
export default function PostScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { isStaff } = useSpace();
  const client = supabase;
  const loaded = useLoad(client && id ? () => loadPost(client, id) : null, `post:${id}`);

  if (!isStaff) return <Redirect href="/" />;

  const post = loaded.data;
  return (
    <Screen hasNav={false} header={<BackHeader title={post ? TITLES[post.kind] : "Post"} backLabel="Back" fallback="/" />}>
      {!client || loaded.loading ? (
        <Loading />
      ) : loaded.error ? (
        <Trouble detail={loaded.error} onRetry={loaded.reload} />
      ) : !post ? (
        <Card style={styles.card}>
          <AppText size={15} line={22} color={theme.text2}>
            This post is no longer there.
          </AppText>
        </Card>
      ) : (
        <Manage post={post} />
      )}
    </Screen>
  );
}

function Manage({ post }: { post: FeedPost }) {
  const theme = useTheme();
  const goBack = useGoBack("/");
  const act = useAction();
  const [confirming, setConfirming] = useState(false);

  // A setup: the mentor's word on how it went.
  const [note, setNote] = useState(post.updateNote ?? "");
  const [closed, setClosed] = useState(post.closed);

  // A post or an offer: its words.
  const [title, setTitle] = useState(post.title ?? "");
  const [body, setBody] = useState(post.body ?? "");
  const [link, setLink] = useState(post.linkUrl ?? "");
  const [label, setLabel] = useState(post.linkLabel ?? "");
  const [wrong, setWrong] = useState<string | null>(null);

  const client = supabase;
  if (!client) return null;

  const save = () => {
    setWrong(null);
    if (post.kind === "setup") return act.run("save", () => updateSetup(client, post.id, note, closed), goBack);
    if (post.kind === "offer") {
      const problems = offerProblems({ title, body, link, label });
      const first = problems.title ?? problems.link ?? problems.body ?? problems.label;
      if (first) return setWrong(first);
    } else if (title.trim() === "" && body.trim() === "" && !post.imagePath && !post.embedUrl) {
      return setWrong("Write something, or delete the post.");
    }
    return act.run("save", () => editPost(client, post.id, { title, body, link, label }), goBack);
  };

  return (
    <>
      {post.kind === "setup" ? (
        <Card radius={28} style={styles.card}>
          <View style={styles.words}>
            <AppText accessibilityRole="header" size={22} line={28} weight="bold" tracking={-0.44}>
              {post.pair} {post.side === "buy" ? "Buy" : "Sell"}
            </AppText>
            <AppText size={14} line={20} color={theme.text2}>
              Entry {post.entry} · Stop {post.stop} · {(post.targets ?? []).length > 1 ? "Targets" : "Target"}{" "}
              {(post.targets ?? []).join(", ")}
            </AppText>
            <AppText size={13} line={18} color={theme.text3}>
              The prices are set once and cannot be changed. Members can trust that a setup reads the way it was posted.
            </AppText>
          </View>
          <TextField
            label="Update"
            value={note}
            onChangeText={setNote}
            hint="Your word on how it is going. Members see it under the setup."
            placeholder="Target 1 hit, stop moved to entry"
            multiline
            maxLength={200}
          />
          <Checkbox
            label="This setup is closed"
            checked={closed}
            // A closed setup stays closed, so the box cannot be cleared once it has been saved.
            onChange={post.closed ? () => {} : setClosed}
          />
        </Card>
      ) : (
        <Card radius={28} style={styles.card}>
          <TextField label="Title" value={title} onChangeText={setTitle} maxLength={120} hint={post.kind === "post" ? "Optional." : undefined} />
          <TextField
            label={post.kind === "offer" ? "A few words about it" : "What do you want to say?"}
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={4000}
          />
          {post.kind === "offer" ? (
            <>
              <TextField
                label="Link"
                value={link}
                onChangeText={setLink}
                placeholder="https://"
                autoCapitalize="none"
                autoCorrect={false}
                inputMode="url"
                keyboardType="url"
              />
              <TextField label="What the button says" value={label} onChangeText={setLabel} maxLength={30} hint="Optional." />
            </>
          ) : null}
          {post.imagePath || post.embedUrl ? (
            <AppText size={13} line={18} color={theme.text3}>
              {post.imagePath ? "The picture stays as it is." : "The video or post it shows stays as it is."} To change it, delete
              this post and write a new one.
            </AppText>
          ) : null}
        </Card>
      )}

      <View style={styles.finish}>
        <Button label={post.kind === "setup" ? "Save update" : "Save"} busy={act.busy === "save"} onPress={save} />
        <ErrorLine text={wrong ?? act.error} />
      </View>

      <Card style={styles.card}>
        {confirming ? (
          <>
            <AppText size={14} line={20} color={theme.text2}>
              Delete this for everyone? It cannot be brought back.
            </AppText>
            <View style={styles.row}>
              <Button
                label="Yes, delete"
                size="medium"
                style={styles.half}
                busy={act.busy === "delete"}
                onPress={() => act.run("delete", () => deletePost(client, post), goBack)}
              />
              <Button label="Keep it" kind="ghost" size="medium" style={styles.half} onPress={() => setConfirming(false)} />
            </View>
          </>
        ) : (
          <Button label={post.kind === "offer" ? "Remove this offer" : "Delete this post"} kind="ghost" onPress={() => setConfirming(true)} />
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16, padding: 22 },
  words: { gap: 4 },
  finish: { gap: 8, marginTop: 4 },
  row: { flexDirection: "row", gap: 8 },
  half: { flex: 1 },
});
