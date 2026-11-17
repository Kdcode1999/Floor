import { Linking } from "react-native";

import { AppText, type AppTextProps } from "@/components/AppText";
import { splitLinks } from "@/features/feed/logic";
import { useTheme } from "@/theme/ThemeContext";

interface RichTextProps extends Omit<AppTextProps, "children"> {
  text: string;
}

/** Text a person wrote, with any web addresses in it made tappable. */
export function RichText({ text, ...look }: RichTextProps) {
  const theme = useTheme();
  return (
    <AppText {...look}>
      {splitLinks(text).map((part, index) =>
        part.link ? (
          <AppText
            key={index}
            {...look}
            accessibilityRole="link"
            color={theme.link}
            onPress={() => Linking.openURL(part.text).catch(() => {})}>
            {part.text}
          </AppText>
        ) : (
          part.text
        ),
      )}
    </AppText>
  );
}
