// Alerts' plain logic: which screen a tapped alert opens, and how the phone's answer about
// notifications is worded. No phone code. Tested in tests/.

/** Whether this phone will show Floor's alerts. */
export type AlertState =
  /** Alerts cannot work here: a browser, a simulator, or a build that is not set up for them. */
  | "unsupported"
  /** The person has not been asked yet. */
  | "not_asked"
  /** The person said no. Only the phone's own settings can change that now. */
  | "refused"
  /** An iPhone in Safari: alerts come once Floor is added to the home screen. */
  | "needs_home_screen"
  | "on";

/** What travels with an alert. */
export interface AlertData {
  type?: unknown;
  space?: unknown;
  id?: unknown;
}

export type AlertRoute =
  | { pathname: "/" }
  | { pathname: "/manage/reported" }
  | { pathname: "/lesson"; params: { id: string } }
  | { pathname: "/live"; params: { id: string } };

/** The screen a tapped alert opens. Anything unrecognised opens the Feed. */
export function routeFor(data: AlertData | null | undefined): AlertRoute {
  const id = typeof data?.id === "string" ? data.id : "";
  if (data?.type === "lesson" && id) return { pathname: "/lesson", params: { id } };
  if ((data?.type === "live" || data?.type === "class") && id) return { pathname: "/live", params: { id } };
  // And only the mentor and admins this one: a member reported a message in a group.
  if (data?.type === "report") return { pathname: "/manage/reported" };
  return { pathname: "/" };
}

/** The space an alert came from, when it says. A tap switches to that space first. */
export function spaceOf(data: AlertData | null | undefined): string | null {
  return typeof data?.space === "string" && data.space !== "" ? data.space : null;
}

/** One line saying where alerts stand on this phone. */
export function stateLine(state: AlertState): string {
  if (state === "on") return "Alerts are on for this phone.";
  if (state === "refused") return "Alerts are switched off for Floor in your phone's settings.";
  if (state === "not_asked") return "Alerts are off. Turn them on to hear about new setups the moment they are posted.";
  if (state === "needs_home_screen") return "On iPhone, alerts work once Floor is on your Home Screen. In Safari, tap Share, then Add to Home Screen, and open Floor from there.";
  return "Alerts are not available in this copy of the app.";
}
