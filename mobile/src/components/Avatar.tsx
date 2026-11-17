import { View } from "react-native";

import { AppText } from "@/components/AppText";
import { initials } from "@/lib/initials";
import { useTheme } from "@/theme/ThemeContext";

interface AvatarProps {
  /** The space or member name. Its initials are shown until pictures are added. */
  name: string;
  /** Width and height in points. */
  size?: number;
}

export function Avatar({ name, size = 40 }: AvatarProps) {
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
        backgroundColor: theme.avatar.background,
        borderWidth: 1,
        borderColor: theme.avatar.border,
      }}>
      <AppText size={fontSize} line={fontSize + 4} weight="semibold" color={theme.avatar.foreground}>
        {initials(name)}
      </AppText>
    </View>
  );
}
