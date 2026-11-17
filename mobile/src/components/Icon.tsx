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
  | "lock"
  | "more"
  | "pin"
  | "image"
  | "link"
  | "close"
  | "external"
  | "bell"
  | "people"
  | "send"
  | "mic"
  | "screen"
  | "calendar"
  | "shield"
  | "trash"
  | "pencil";

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
      {name === "more" && (
        <>
          <Circle cx={6} cy={12} r={1.6} fill={color} />
          <Circle cx={12} cy={12} r={1.6} fill={color} />
          <Circle cx={18} cy={12} r={1.6} fill={color} />
        </>
      )}
      {name === "pin" && <Path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7" {...line} />}
      {name === "image" && (
        <>
          <Rect x={3} y={5} width={18} height={14} rx={3} {...line} />
          <Circle cx={9} cy={10} r={1.5} {...line} />
          <Path d="M4 17l5-4 4 3 3-2.5 4 3.5" {...line} />
        </>
      )}
      {name === "link" && (
        <Path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" {...line} />
      )}
      {name === "close" && <Path d="M6 6l12 12M18 6L6 18" {...line} />}
      {name === "external" && <Path d="M9 6h9v9M18 6L7 17" {...line} />}
      {name === "bell" && (
        <>
          <Path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" {...line} />
          <Path d="M10 20.5a2.2 2.2 0 0 0 4 0" {...line} />
        </>
      )}
      {name === "people" && (
        <>
          <Circle cx={9} cy={9} r={3} {...line} />
          <Path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5.5M17.5 14.5a5 5 0 0 1 3 4.5" {...line} />
        </>
      )}
      {name === "send" && <Path d="M4 12l16-7-6 15-2.5-6.5z" {...line} />}
      {name === "mic" && (
        <>
          <Rect x={9} y={3} width={6} height={11} rx={3} {...line} />
          <Path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" {...line} />
        </>
      )}
      {name === "screen" && (
        <>
          <Rect x={3} y={4} width={18} height={12} rx={2.5} {...line} />
          <Path d="M8 20h8M12 16v4" {...line} />
        </>
      )}
      {name === "calendar" && (
        <>
          <Rect x={4} y={5} width={16} height={15} rx={3} {...line} />
          <Path d="M4 10h16M8 3v4M16 3v4" {...line} />
        </>
      )}
      {name === "shield" && <Path d="M12 3l7 3v5.5c0 4.3-2.9 7.6-7 9.5-4.1-1.9-7-5.2-7-9.5V6z" {...line} />}
      {name === "trash" && <Path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v5M14 11v5" {...line} />}
      {name === "pencil" && <Path d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3" {...line} />}
    </Svg>
  );
}
