import * as Application from "expo-application";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";

import { secureStore } from "@/lib/secureStorage";

const KEY = "floor-device-id";

let cached: string | null = null;

/** A random id made once and kept in secure storage. */
async function storedId(): Promise<string> {
  const existing = await secureStore.get(KEY);
  if (existing) return existing;
  const fresh = Crypto.randomUUID();
  await secureStore.set(KEY, fresh);
  return fresh;
}

/**
 * The id the database knows this phone by, for "one phone per account".
 *
 * It has to stay the same when the app is removed and installed again, or a reinstall would
 * count as moving to a new phone.
 * - Android wipes the app's secure storage on removal, so the id is made from the phone's own
 *   Android ID. Only a one-way hash of it leaves the phone.
 * - iPhone keeps secure storage across a reinstall, so a random id made once is enough.
 */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;

  if (Platform.OS === "android") {
    try {
      const androidId = Application.getAndroidId();
      if (androidId) {
        cached = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          `floor-device:${androidId}`,
        );
        return cached;
      }
    } catch {
      // Fall through to the stored id.
    }
  }

  cached = await storedId();
  return cached;
}
