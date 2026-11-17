import { Image } from "expo-image";
import { View } from "react-native";

import { AppText } from "@/components/AppText";
import { initials } from "@/lib/initials";
import { useTheme } from "@/theme/ThemeContext";

interface AvatarProps {
  /** The space or member name. Its initials are shown when there is no picture. */
  name: string;
  /** The address of a picture to show instead of the initials. */
  image?: string | null;
  /** Width and height in points. */
  size?: number;
}

export function Avatar({ name, image, size = 40 }: AvatarProps) {
  const theme = useTheme();
  const fontSize = Math.round(size * 0.34);
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        backgroundColor: theme.avatar.background,
        borderWidth: 1,
        borderColor: theme.avatar.border,
      }}>
      {image ? (
        <Image source={{ uri: image }} contentFit="cover" transition={120} style={{ width: size, height: size }} />
      ) : (
        <AppText size={fontSize} line={fontSize + 4} weight="semibold" color={theme.avatar.foreground}>
          {initials(name)}
        </AppText>
      )}
    </View>
  );
}
