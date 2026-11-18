import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/Icon";
import { Loading, Trouble } from "@/components/LoadState";
import { pictureUrl as chatPictureUrl } from "@/features/chat/api";
import { pictureUrl } from "@/features/feed/api";
import { database } from "@/lib/database";
import { useGoBack } from "@/lib/useGoBack";
import { useLoad } from "@/lib/useLoad";

const MAX_ZOOM = 5;

/**
 * A picture from a post or a group, full screen. Pinch to zoom, drag to move around, double tap to zoom
 * in and out. Traders post charts, and a chart has to be read up close.
 */
export default function PictureScreen() {
  const { path, shape, store } = useLocalSearchParams<{ path?: string; shape?: string; store?: string }>();
  const goBack = useGoBack("/");
  const insets = useSafeAreaInsets();
  const display = useWindowDimensions();
  // A picture is in the store for posts or the one for groups. Each has its own rule for who may see it.
  const url = useLoad(
    path ? () => (store === "chat" ? chatPictureUrl(database, path) : pictureUrl(database, path)) : null,
    `picture:${store}:${path}`,
  );

  // The picture's size on screen at rest: as large as fits.
  const ratio = Number(shape) > 0 ? Number(shape) : 1;
  const width = Math.min(display.width, display.height * ratio);
  const height = width / ratio;

  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // How far the picture may be dragged at a given zoom before its edge would leave the screen.
  const limit = (zoom: number, size: number, room: number) => {
    "worklet";
    return Math.max(0, (size * zoom - room) / 2);
  };
  const settle = () => {
    "worklet";
    const zoom = Math.min(Math.max(scale.value, 1), MAX_ZOOM);
    const maxX = limit(zoom, width, display.width);
    const maxY = limit(zoom, height, display.height);
    scale.value = withTiming(zoom);
    x.value = withTiming(Math.min(Math.max(x.value, -maxX), maxX));
    y.value = withTiming(Math.min(Math.max(y.value, -maxY), maxY));
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scale.value;
    })
    .onUpdate((event) => {
      scale.value = Math.min(Math.max(startScale.value * event.scale, 0.8), MAX_ZOOM * 1.2);
    })
    .onEnd(settle);
  const pan = Gesture.Pan()
    .maxPointers(2)
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((event) => {
      if (scale.value <= 1) return;
      x.value = startX.value + event.translationX;
      y.value = startY.value + event.translationY;
    })
    .onEnd(settle);
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const zoomIn = scale.value < 1.5;
      scale.value = withTiming(zoomIn ? 2.5 : 1);
      if (!zoomIn) {
        x.value = withTiming(0);
        y.value = withTiming(0);
      }
    });

  const moved = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <View style={styles.screen}>
      {url.loading ? (
        <Loading />
      ) : url.error || !url.data ? (
        <View style={styles.trouble}>
          <Trouble detail={url.error} onRetry={url.reload} />
        </View>
      ) : (
        <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
          <Animated.View style={[{ width, height }, moved]}>
            <Image
              source={{ uri: url.data, cacheKey: path }}
              accessibilityLabel="The picture, full screen"
              contentFit="contain"
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </GestureDetector>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        hitSlop={8}
        onPress={goBack}
        style={({ pressed }) => [styles.close, { top: insets.top + 12 }, pressed && styles.pressed]}>
        <Icon name="close" size={20} strokeWidth={2.2} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Black in every theme: nothing should compete with the picture.
  screen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000000", overflow: "hidden" },
  trouble: { width: "100%", maxWidth: 420, padding: 16 },
  close: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  pressed: { opacity: 0.6 },
});
