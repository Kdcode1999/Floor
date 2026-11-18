// Which part of the app to show, given where sign-in and the space stand. Plain logic, tested
// in tests/.

import type { SpaceStatus } from "@/space/SpaceContext";

import type { AuthStatus } from "./authStore";

/** The three parts of the app. Exactly one is open at a time. */
export type Stage = "sign-in" | "hold" | "app";

/** What the hold screen is holding for. */
export type Hold =
  | "loading"
  | "elsewhere"
  | "device_limit"
  /** The server could not be asked about the login. */
  | "trouble"
  /** The person's spaces could not be loaded. */
  | "space_trouble"
  | "none"
  | "choose"
  /** The one space the person belongs to has been suspended by Floor. */
  | "suspended";

export function stageFor(auth: AuthStatus, space: SpaceStatus): Stage {
  if (auth === "signed_out" || auth === "signing_in") return "sign-in";
  if (auth === "ready" && space === "ready") return "app";
  return "hold";
}

export function holdFor(auth: AuthStatus, space: SpaceStatus): Hold {
  if (auth === "elsewhere" || auth === "device_limit" || auth === "trouble") return auth;
  if (auth !== "ready") return "loading";
  if (space === "trouble") return "space_trouble";
  if (space === "none" || space === "choose" || space === "suspended") return space;
  return "loading";
}
