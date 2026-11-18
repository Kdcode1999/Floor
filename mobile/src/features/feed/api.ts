// What the Feed asks of the database. Who may read or post what is decided by the database.

import type { SupabaseClient } from "@supabase/supabase-js";
import * as Crypto from "expo-crypto";

import { fittedJpeg, pictureBytes, type Picture } from "@/lib/pictures";
import { kickJobs } from "@/lib/server";

import { cleanPair, cleanPrice, feedMessage, filledTargets, type OfferForm, type SetupForm } from "./logic";
import type { FeedPost, Side } from "./types";

/** How many posts one page of the Feed holds. */
export const PAGE = 20;

interface Row {
  id: string;
  kind: FeedPost["kind"];
  audience: FeedPost["audience"];
  locked: boolean;
  title: string | null;
  body: string | null;
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  embed_url: string | null;
  pair: string | null;
  side: Side | null;
  entry: string | null;
  stop: string | null;
  targets: string[] | null;
  update_note: string | null;
  update_at: string | null;
  closed: boolean;
  link_url: string | null;
  link_label: string | null;
  created_at: string;
  edited: boolean;
}

const fromRow = (row: Row): FeedPost => ({
  id: row.id,
  kind: row.kind,
  audience: row.audience,
  locked: row.locked,
  title: row.title,
  body: row.body,
  imagePath: row.image_path,
  imageWidth: row.image_width,
  imageHeight: row.image_height,
  embedUrl: row.embed_url,
  pair: row.pair,
  side: row.side,
  entry: row.entry,
  stop: row.stop,
  targets: row.targets,
  updateNote: row.update_note,
  updateAt: row.update_at,
  closed: row.closed,
  linkUrl: row.link_url,
  linkLabel: row.link_label,
  createdAt: row.created_at,
  edited: row.edited,
});

/**
 * One page of the Feed, newest first. The first page starts with the pinned offers.
 * `before` asks for the posts older than that moment.
 */
export async function loadFeed(client: SupabaseClient, spaceId: string, before: string | null = null): Promise<FeedPost[]> {
  const { data, error } = await client.rpc("feed", { p_space: spaceId, p_before: before, p_limit: PAGE });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(fromRow);
}

/** One post, for the screen that manages it. Null when it is gone or not theirs to see. */
export async function loadPost(client: SupabaseClient, postId: string): Promise<FeedPost | null> {
  const { data, error } = await client
    .from("posts")
    .select("id, kind, audience, title, body, image_path, image_width, image_height, embed_url, pair, side, entry, stop, targets, update_note, update_at, closed_at, link_url, link_label, created_at, edited_at")
    .eq("id", postId)
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as (Omit<Row, "locked" | "closed" | "edited"> & { closed_at: string | null; edited_at: string | null }) | undefined;
  return row ? fromRow({ ...row, locked: false, closed: row.closed_at !== null, edited: row.edited_at !== null }) : null;
}

/** A short-lived address for a picture in a post. Only those who may open the post can get one. */
export async function pictureUrl(client: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await client.storage.from("posts").createSignedUrl(path, 3600);
  if (error || !data) throw new Error(error?.message ?? "The picture could not be opened.");
  return data.signedUrl;
}

/** The longest side of a picture in a post, in pixels. Sharp on a phone, small to download. */
const PICTURE_MAX = 1600;

interface Uploaded {
  path: string;
  width: number;
  height: number;
}

async function uploadPicture(client: SupabaseClient, spaceId: string, audience: FeedPost["audience"], picture: Picture): Promise<Uploaded> {
  const ready = await fittedJpeg(picture, PICTURE_MAX);
  const path = `${spaceId}/${audience}/${Crypto.randomUUID()}.jpg`;
  const { error } = await client.storage.from("posts").upload(path, await pictureBytes(ready.uri), { contentType: "image/jpeg" });
  if (error) throw new Error(error.message);
  return { path, width: ready.width, height: ready.height };
}

export interface NewPost {
  title: string;
  body: string;
  embed: string;
  picture: Picture | null;
  forEveryone: boolean;
}

/** Each of these resolves with a sentence to show when it failed, or null when it worked. */
export async function createPost(client: SupabaseClient, spaceId: string, post: NewPost): Promise<string | null> {
  const audience = post.forEveryone ? "everyone" : "vip";
  let picture: Uploaded | null = null;
  if (post.picture) {
    try {
      picture = await uploadPicture(client, spaceId, audience, post.picture);
    } catch {
      return "The picture couldn't be uploaded. Check your connection and try again.";
    }
  }
  const { error } = await client.rpc("create_post", {
    p_space: spaceId,
    p_kind: "post",
    p_audience: audience,
    p_title: post.title.trim() || null,
    p_body: post.body.trim() || null,
    p_image_path: picture?.path ?? null,
    p_image_width: picture?.width ?? null,
    p_image_height: picture?.height ?? null,
    p_embed_url: post.embed.trim() || null,
  });
  if (error && picture) void client.storage.from("posts").remove([picture.path]).then(undefined, () => {});
  if (error) return feedMessage(error);
  // A new post may have a notice waiting for the mentor's Telegram channel. Have the server post it now.
  kickJobs();
  return null;
}

export async function createSetup(client: SupabaseClient, spaceId: string, form: SetupForm, forEveryone: boolean): Promise<string | null> {
  const { error } = await client.rpc("create_post", {
    p_space: spaceId,
    p_kind: "setup",
    p_audience: forEveryone ? "everyone" : "vip",
    p_body: form.note.trim() || null,
    p_pair: cleanPair(form.pair),
    p_side: form.side,
    p_entry: cleanPrice(form.entry),
    p_stop: cleanPrice(form.stop),
    p_targets: filledTargets(form.targets),
  });
  if (error) return feedMessage(error);
  // A new setup queues an alert for the members who can open it. Tell the server to send it now.
  kickJobs();
  return null;
}

export async function createOffer(client: SupabaseClient, spaceId: string, form: OfferForm): Promise<string | null> {
  const { error } = await client.rpc("create_post", {
    p_space: spaceId,
    p_kind: "offer",
    p_title: form.title.trim(),
    p_body: form.body.trim() || null,
    p_link_url: form.link.trim(),
    p_link_label: form.label.trim() || null,
  });
  return error ? feedMessage(error) : null;
}

export async function editPost(client: SupabaseClient, postId: string, words: { title: string; body: string; link?: string; label?: string }): Promise<string | null> {
  const { error } = await client.rpc("edit_post", {
    p_post: postId,
    p_title: words.title.trim() || null,
    p_body: words.body.trim() || null,
    p_link_url: words.link?.trim() || null,
    p_link_label: words.label?.trim() || null,
  });
  return error ? feedMessage(error) : null;
}

export async function updateSetup(client: SupabaseClient, postId: string, note: string, closed: boolean): Promise<string | null> {
  const { error } = await client.rpc("update_setup", { p_post: postId, p_note: note.trim() || null, p_closed: closed });
  return error ? feedMessage(error) : null;
}

export async function deletePost(client: SupabaseClient, post: Pick<FeedPost, "id" | "imagePath">): Promise<string | null> {
  const { error } = await client.rpc("delete_post", { p_post: post.id });
  if (error) return feedMessage(error);
  // The picture is no longer shown anywhere. Throw it away, and carry on if that fails.
  if (post.imagePath) void client.storage.from("posts").remove([post.imagePath]).then(undefined, () => {});
  return null;
}
