import { BlurView } from "expo-blur";
import type { TabListProps, TabTriggerSlotProps } from "expo-router/ui";
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { Icon, type IconName } from "@/components/Icon";
import { CONTENT_MAX_WIDTH, NAV_HEIGHT, navBottomOffset, SCREEN_PADDING } from "@/theme/layout";
import { useTheme } from "@/theme/ThemeContext";

/**
 * The floating pill that holds the tabs.
 *
 * This is the one surface that blurs what is behind it, because the feed scrolls underneath.
 * iPhone uses the system blur and the web build uses a CSS backdrop filter. Android gets a
 * nearly solid fill instead: live blur is slow on the low-cost phones many members use.
 */
export function NavPill({ children, style: _listStyle, ...rest }: TabListProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const blurs = Platform.OS === "ios" || Platform.OS === "web";
  const fill: ViewStyle = { backgroundColor: blurs ? theme.nav.background : theme.nav.solid };
  // React Native has no backdrop filter of its own. react-native-web passes this one through.
  const webBlur =
    Platform.OS === "web"
      ? ({
          backdropFilter: `blur(${theme.blur}px) saturate(${theme.saturation})`,
        } as unknown as ViewStyle)
      : null;

  return (
    // The holder spans the screen and lets touches through. Only the pill itself takes them.
    <View
      style={[
        styles.holder,
        {
          paddingLeft: SCREEN_PADDING + insets.left,
          paddingRight: SCREEN_PADDING + insets.right,
          bottom: navBottomOffset(insets.bottom),
        },
      ]}>
      <View {...rest} accessibilityRole="tablist" style={[styles.pill, { boxShadow: theme.nav.shadow }]}>
        <View style={[StyleSheet.absoluteFill, styles.round, styles.clip]}>
          {Platform.OS === "ios" ? (
            <BlurView
              tint={theme.dark ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight"}
              intensity={70}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          <View style={[StyleSheet.absoluteFill, fill, webBlur]} />
        </View>
        <View
          style={[StyleSheet.absoluteFill, styles.round, styles.rim, { borderColor: theme.nav.border }]}
        />
        <View style={styles.items}>{children}</View>
      </View>
    </View>
  );
}

interface NavItemProps extends TabTriggerSlotProps {
  icon: IconName;
  label: string;
  /** Four tabs need a little less room each than three. */
  compact?: boolean;
}

/** One tab in the pill. `isFocused`, `onPress` and `href` arrive from the tab trigger around it. */
export function NavItem({
  icon,
  label,
  compact = false,
  isFocused = false,
  // The trigger's own ref and style are not used: the pill decides how a tab looks.
  ref: _ref,
  style: _style,
  ...rest
}: NavItemProps) {
  const theme = useTheme();
  const color = isFocused ? theme.nav.activeForeground : theme.nav.foreground;

  return (
    <Pressable
      {...rest}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFocused }}
      style={({ pressed }) => [
        styles.item,
        { gap: compact ? 5 : 8 },
        isFocused && { backgroundColor: theme.nav.activeBackground },
        pressed && !isFocused && styles.pressed,
      ]}>
      <Icon name={icon} size={18} color={color} />
      <AppText
        size={compact ? 12 : 14}
        line={compact ? 16 : 18}
        weight={isFocused ? "semibold" : "medium"}
        color={color}
        numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  holder: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    pointerEvents: "box-none",
  },
  pill: {
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH - SCREEN_PADDING * 2,
    height: NAV_HEIGHT,
    borderRadius: 99,
  },
  round: { borderRadius: 99 },
  clip: { overflow: "hidden" },
  rim: { borderWidth: 1, pointerEvents: "none" },
  items: {
    flex: 1,
    flexDirection: "row",
    gap: 4,
    padding: 7,
  },
  item: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 99,
  },
  pressed: { opacity: 0.6 },
});
