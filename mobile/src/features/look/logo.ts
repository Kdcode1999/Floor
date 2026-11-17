import type { SupabaseClient } from "@supabase/supabase-js";
import * as Crypto from "expo-crypto";

import { pictureBytes, squareJpeg, type Picture } from "@/lib/pictures";

/** A logo is kept as a square this many pixels across: sharp at every size the app shows it. */
export const LOGO_SIDE = 512;

/**
 * Puts a new logo in the space's folder of the "logos" store and resolves with where it is.
 * Every upload gets a new name, so no phone keeps showing the old picture.
 */
export async function uploadLogo(client: SupabaseClient, spaceId: string, picture: Picture): Promise<string> {
  const ready = await squareJpeg(picture, LOGO_SIDE);
  const path = `${spaceId}/${Crypto.randomUUID()}.jpg`;
  const { error } = await client.storage.from("logos").upload(path, await pictureBytes(ready.uri), { contentType: "image/jpeg" });
  if (error) throw new Error(error.message);
  return path;
}

/** Throws away a logo that is no longer used. Nothing breaks if this fails, so it never throws. */
export async function removeLogo(client: SupabaseClient, path: string): Promise<void> {
  await client.storage.from("logos").remove([path]).catch(() => {});
}
