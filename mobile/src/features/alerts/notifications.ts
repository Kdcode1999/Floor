// The phone's notifications module, or nothing inside Expo Go.
//
// Expo Go is only for a quick look at the screens. It carries too little of this module to be
// worth loading: on Android it gets no alerts at all, and loading the module there fills the
// screen with warnings about that. So inside Expo Go the module is left alone and the app says
// alerts need the installed app.

import { isRunningInExpoGo } from "expo";

type NotificationsModule = typeof import("expo-notifications");

// eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only where it works, which an import at the top cannot do
export const Notifications: NotificationsModule | null = isRunningInExpoGo() ? null : (require("expo-notifications") as NotificationsModule);
