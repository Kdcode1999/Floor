import "react-native-url-polyfill/auto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

import { backendConfigured, SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";
import { secureStore } from "@/lib/secureStorage";

/**
 * The connection to Supabase: accounts, database and files. It is null until mobile/.env is
 * filled in, and the app then runs on sample content.
 *
 * The login is kept in the phone's secure storage, so it survives closing the app and cannot
 * be copied to another phone.
 */
export const supabase: SupabaseClient | null = backendConfigured
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        storage: {
          getItem: (key) => secureStore.get(key),
          setItem: (key, value) => secureStore.set(key, value),
          removeItem: (key) => secureStore.remove(key),
        },
        storageKey: "floor-auth",
        autoRefreshToken: true,
        persistSession: true,
        // Sign-in is a typed code. There is never a login waiting in a web address.
        detectSessionInUrl: false,
      },
    })
  : null;

// A phone app has no browser tab to tell it when it is in view, so say so by hand: keep the
// login fresh while the app is open and stop when it goes to the background.
if (supabase && Platform.OS !== "web") {
  const client = supabase;
  AppState.addEventListener("change", (state) => {
    if (state === "active") client.auth.startAutoRefresh();
    else client.auth.stopAutoRefresh();
  });
}
