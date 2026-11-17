import { useAuth } from "@/auth/AuthContext";
import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";
import { SpaceHeader } from "@/components/SpaceHeader";
import { LiveCard } from "@/features/feed/LiveCard";
import { LessonCard, PostCard } from "@/features/feed/PostCard";
import { sampleFeed } from "@/features/feed/sample";
import { SetupCard } from "@/features/feed/SetupCard";
import type { FeedItem } from "@/features/feed/types";
import { useSpace } from "@/space/SpaceContext";

/** The Feed: what the mentor has shared, newest first, with a live session on top. */
export default function FeedScreen() {
  const { sample } = useAuth();
  const { isStaff } = useSpace();

  // A real space starts empty. Sample posts only appear on the sample space.
  if (!sample) {
    return (
      <Screen header={<SpaceHeader />}>
        <EmptyState
          icon="feed"
          title="Nothing posted yet"
          detail={isStaff ? "What you post will show up here." : "Posts from your mentor will show up here."}
        />
      </Screen>
    );
  }

  return (
    <Screen header={<SpaceHeader />}>
      {sampleFeed.map((item) => (
        <FeedCard key={item.id} item={item} />
      ))}
    </Screen>
  );
}

function FeedCard({ item }: { item: FeedItem }) {
  switch (item.kind) {
    case "live":
      return <LiveCard item={item} />;
    case "setup":
      return <SetupCard item={item} />;
    case "post":
      return <PostCard item={item} />;
    case "lesson":
      return <LessonCard item={item} />;
  }
}
