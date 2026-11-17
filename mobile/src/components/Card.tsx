import { View, type ViewProps } from "react-native";

import { useTheme } from "@/theme/ThemeContext";

export interface CardProps extends ViewProps {
  /** Corner radius in points. */
  radius?: number;
}

/**
 * The glass card: a see-through fill, a hairline border, a soft highlight along the top edge
 * and a shadow underneath.
 *
 * It does not blur what is behind it. The lights behind a card are already smooth, so a blur
 * would change nothing on screen and cost battery on every card. Only the floating navigation
 * blurs, because content scrolls underneath it.
 */
export function Card({ radius = 24, style, ...rest }: CardProps) {
  const theme = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          borderRadius: radius,
          borderWidth: 1,
          borderColor: theme.card.border,
          backgroundColor: theme.card.background,
          boxShadow: theme.card.shadow,
        },
        style,
      ]}
    />
  );
}
