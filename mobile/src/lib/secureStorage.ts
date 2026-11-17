import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { chunked, type KeyValueStore } from "@/lib/chunkedStore";

// iPhone: readable after the phone's first unlock, and never copied to another phone through a
// backup. A login must not travel to a second phone that way.
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/** The phone's secure storage: the Keychain on iPhone, the Keystore on Android. */
const phone: KeyValueStore = {
  get: (key) => SecureStore.getItemAsync(key, OPTIONS),
  set: (key, value) => SecureStore.setItemAsync(key, value, OPTIONS),
  remove: (key) => SecureStore.deleteItemAsync(key, OPTIONS),
};

/** The browser's storage. Only used by the web build, which is for checking screens. */
const browser: KeyValueStore = {
  get: async (key) => (typeof localStorage === "undefined" ? null : localStorage.getItem(key)),
  set: async (key, value) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  },
  remove: async (key) => {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  },
};

/**
 * Where the app keeps what must stay on this phone: the login and the phone's own id.
 * Secure storage only takes small values, so large ones are kept in pieces.
 */
export const secureStore: KeyValueStore = Platform.OS === "web" ? browser : chunked(phone);
