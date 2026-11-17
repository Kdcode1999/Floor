import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";
import { SpaceHeader } from "@/components/SpaceHeader";
import { useSpace } from "@/space/SpaceContext";

/** Chat: the space's groups. Shows the empty state until groups are built. */
export default function ChatScreen() {
  const { isStaff } = useSpace();

  return (
    <Screen header={<SpaceHeader />}>
      <EmptyState
        icon="chat"
        title="No groups yet"
        detail={
          isStaff ? "Groups you create will show up here." : "Groups from your mentor will show up here."
        }
      />
    </Screen>
  );
}
