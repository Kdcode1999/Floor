import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { EmptyState } from "@/components/EmptyState";
import { ErrorLine, Loading, Trouble } from "@/components/LoadState";
import { Screen } from "@/components/Screen";
import { SpaceHeader } from "@/components/SpaceHeader";
import { TextLink } from "@/components/TextLink";
import { AlertsCard } from "@/features/alerts/AlertsCard";
import { loadFeed, PAGE } from "@/features/feed/api";
import { LiveCard } from "@/features/feed/LiveCard";
import { LockedCard } from "@/features/feed/LockedCard";
import { OfferCard } from "@/features/feed/OfferCard";
import { LessonCard, PostCard } from "@/features/feed/PostCard";
import { SuspendedNote } from "@/features/safety/SuspendedNote";
import { sampleLesson, sampleLive, samplePosts } from "@/features/feed/sample";
import { SetupCard } from "@/features/feed/SetupCard";
import type { FeedPost } from "@/features/feed/types";
import { timeAgo } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useLoad } from "@/lib/useLoad";
import { useSpace } from "@/space/SpaceContext";

/** The Feed: pinned offers, then what the mentor has shared, newest first. */
export default function FeedScreen() {
  const { sample } = useAuth();
  const { space, isStaff } = useSpace();
  const client = sample ? null : supabase;

  const first = useLoad(client && space.id ? () => loadFeed(client, space.id) : null, `feed:${space.id}`);
  /** Pages of older posts, loaded one at a time with "Show older posts". */
  const [older, setOlder] = useState<{ space: string; posts: FeedPost[]; end: boolean }>({ space: "", posts: [], end: false });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);

  // Look again whenever the person comes back to the Feed.
  const { reload } = first;
  useFocusEffect(
    useCallback(() => {
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  if (!client) {
    return (
      <Screen header={<SpaceHeader />}>
        <LiveCard item={sampleLive} />
        <FeedCard post={samplePosts[0]} staff={false} />
        <FeedCard post={samplePosts[1]} staff={false} />
        <LessonCard item={sampleLesson} />
        <FeedCard post={samplePosts[2]} staff={false} />
      </Screen>
    );
  }

  const page = first.data ?? [];
  const extra = older.space === space.id ? older.posts.filter((post) => !page.some((each) => each.id === post.id)) : [];
  const posts = [...page, ...extra];
  const pageFull = page.filter((post) => post.kind !== "offer").length >= PAGE;
  const reachedEnd = older.space === space.id && older.end;

  const showOlder = async () => {
    const last = posts[posts.length - 1];
    if (!last || loadingOlder) return;
    setLoadingOlder(true);
    setOlderError(null);
    try {
      const next = await loadFeed(client, space.id, last.createdAt);
      setOlder({ space: space.id, posts: [...extra, ...next], end: next.length < PAGE });
    } catch {
      setOlderError("Older posts couldn't be loaded. Try again.");
    }
    setLoadingOlder(false);
  };

  return (
    <Screen header={<SpaceHeader />} onRefresh={reload} refreshing={first.refreshing}>
      <SuspendedNote />
      <AlertsCard />
      {first.loading ? (
        <Loading />
      ) : first.error ? (
        <Trouble detail={first.error} onRetry={reload} />
      ) : posts.length === 0 ? (
        <EmptyState
          icon="feed"
          title="Nothing posted yet"
          detail={isStaff ? "What you post will show up here." : "Posts from your mentor will show up here."}
        />
      ) : (
        posts.map((post) => <FeedCard key={post.id} post={post} staff={isStaff} />)
      )}
      {pageFull && !reachedEnd ? (
        <View style={styles.older}>
          <TextLink label={loadingOlder ? "Loading…" : "Show older posts"} disabled={loadingOlder} onPress={showOlder} />
          <ErrorLine text={olderError} />
        </View>
      ) : null}
    </Screen>
  );
}

function FeedCard({ post, staff }: { post: FeedPost; staff: boolean }) {
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const when = timeAgo(post.createdAt, now);
  if (post.locked) return <LockedCard post={post} when={when} />;

  const onManage = staff ? () => router.push({ pathname: "/post", params: { id: post.id } }) : undefined;
  // Only the mentor and admins need telling who a post is for. Members see what they can open.
  const audience = staff ? (post.audience === "vip" ? "VIP" : "Everyone") : undefined;

  if (post.kind === "lesson") {
    return (
      <LessonCard
        item={{ id: post.id, title: post.title ?? "Lesson", when }}
        onPress={() => router.push({ pathname: "/lesson", params: { id: post.id } })}
      />
    );
  }
  if (post.kind === "offer") return <OfferCard post={post} onManage={onManage} />;
  if (post.kind === "setup") {
    return (
      <SetupCard
        post={post}
        when={when}
        updated={post.updateAt ? timeAgo(post.updateAt, now) : undefined}
        audience={audience}
        onManage={onManage}
      />
    );
  }
  return <PostCard post={post} when={when} audience={audience} onManage={onManage} />;
}

const styles = StyleSheet.create({
  older: { alignItems: "center" },
});
