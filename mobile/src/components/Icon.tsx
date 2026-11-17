import Svg, { Circle, Path, Rect } from "react-native-svg";

export type IconName =
  | "feed"
  | "learn"
  | "chat"
  | "manage"
  | "plus"
  | "live"
  | "lesson"
  | "chevronRight"
  | "chevronLeft"
  | "arrowUp"
  | "arrowDown"
  | "play"
  | "check"
  | "lock";

interface IconProps {
  name: IconName;
  /** Width and height in points. */
  size?: number;
  color: string;
  strokeWidth?: number;
}

/** The app's line icons, drawn on a 24 by 24 grid. The same shapes as the approved mockup. */
export function Icon({ name, size = 20, color, strokeWidth = 2 }: IconProps) {
  const line = {
    stroke: color,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === "feed" && <Path d="M4 6h16M4 12h16M4 18h10" {...line} />}
      {name === "learn" && (
        <>
          <Rect x={3} y={5} width={18} height={14} rx={3} {...line} />
          <Path d="M10 9.5v5l4.5-2.5z" {...line} />
        </>
      )}
      {name === "chat" && (
        <Path
          d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"
          {...line}
        />
      )}
      {name === "manage" && (
        <>
          <Rect x={4} y={4} width={7} height={7} rx={2} {...line} />
          <Rect x={13} y={4} width={7} height={7} rx={2} {...line} />
          <Rect x={4} y={13} width={7} height={7} rx={2} {...line} />
          <Rect x={13} y={13} width={7} height={7} rx={2} {...line} />
        </>
      )}
      {name === "plus" && <Path d="M12 5v14M5 12h14" {...line} />}
      {name === "live" && (
        <>
          <Circle cx={12} cy={12} r={3} {...line} />
          <Path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4" {...line} />
        </>
      )}
      {name === "lesson" && (
        <>
          <Rect x={3} y={6} width={14} height={12} rx={3} {...line} />
          <Path d="M17 10l4-2v8l-4-2" {...line} />
        </>
      )}
      {name === "chevronRight" && <Path d="M9 5l7 7-7 7" {...line} />}
      {name === "chevronLeft" && <Path d="M15 5l-7 7 7 7" {...line} />}
      {name === "arrowUp" && <Path d="M12 19V5M6 11l6-6 6 6" {...line} />}
      {name === "arrowDown" && <Path d="M12 5v14M6 13l6 6 6-6" {...line} />}
      {name === "play" && <Path d="M8 5.5v13l11-6.5z" fill={color} />}
      {name === "check" && <Path d="M5 12.5l4.5 4.5L19 7.5" {...line} />}
      {name === "lock" && (
        <>
          <Rect x={5} y={11} width={14} height={9} rx={2.5} {...line} />
          <Path d="M8 11V8a4 4 0 0 1 8 0v3" {...line} />
        </>
      )}
    </Svg>
  );
}
