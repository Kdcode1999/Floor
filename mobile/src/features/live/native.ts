// The phone's live video module, or nothing where it cannot run.
//
// It needs the installed app: Expo Go does not carry it, and the web build uses the browser's
// own video instead. So it is loaded only on a phone running the installed app, and the live
// room says what is missing everywhere else.

import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";

type LiveKitModule = typeof import("@livekit/react-native");

export const LiveKitNative: LiveKitModule | null =
  Platform.OS === "web" || isRunningInExpoGo()
    ? null
    : // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only where it works, which an import at the top cannot do
      (require("@livekit/react-native") as LiveKitModule);

let ready = false;

/** Makes the phone's video parts known to the live video library, once. */
export async function prepareNative(): Promise<void> {
  if (!LiveKitNative) return;
  if (!ready) {
    LiveKitNative.registerGlobals();
    ready = true;
  }
  await LiveKitNative.AudioSession.startAudioSession();
}

export async function releaseNative(): Promise<void> {
  if (LiveKitNative) await LiveKitNative.AudioSession.stopAudioSession().catch(() => {});
}
