import { TabList, Tabs, TabSlot, TabTrigger } from "expo-router/ui";
import { StyleSheet } from "react-native";

import { NavItem, NavPill } from "@/components/NavPill";
import { useSpace } from "@/space/SpaceContext";

/**
 * The tabs of a space. Members get Feed, Learn and Chat. The mentor and admins also get Manage.
 *
 * The tab triggers must stay direct children of NavPill: the router reads them from there to
 * learn which tabs exist.
 */
export default function TabsLayout() {
  const { isStaff } = useSpace();

  return (
    <Tabs>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <NavPill>
          <TabTrigger name="feed" href="/" asChild>
            <NavItem icon="feed" label="Feed" compact={isStaff} />
          </TabTrigger>
          <TabTrigger name="learn" href="/learn" asChild>
            <NavItem icon="learn" label="Learn" compact={isStaff} />
          </TabTrigger>
          <TabTrigger name="chat" href="/chat" asChild>
            <NavItem icon="chat" label="Chat" compact={isStaff} />
          </TabTrigger>
          {isStaff ? (
            <TabTrigger name="manage" href="/manage" asChild>
              <NavItem icon="manage" label="Manage" compact />
            </TabTrigger>
          ) : null}
        </NavPill>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // Without a set height the open tab grows to fit its content and stops scrolling.
  slot: { height: "100%" },
});
