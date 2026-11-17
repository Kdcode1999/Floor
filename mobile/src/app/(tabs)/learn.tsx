import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";
import { SpaceHeader } from "@/components/SpaceHeader";
import { useSpace } from "@/space/SpaceContext";

/** Learn: the mentor's lessons. Shows the empty state until lessons are built. */
export default function LearnScreen() {
  const { isStaff } = useSpace();

  return (
    <Screen header={<SpaceHeader />}>
      <EmptyState
        icon="learn"
        title="No lessons yet"
        detail={
          isStaff ? "Lessons you add will show up here." : "Lessons from your mentor will show up here."
        }
      />
    </Screen>
  );
}
