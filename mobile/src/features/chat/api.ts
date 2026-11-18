// What chat asks of the database. Every rule about who may read or write lives in the
// database. These functions only shape the requests and the answers.

import type { SupabaseClient } from "@supabase/supabase-js";

import { kickJobs } from "@/lib/server";

import { chatMessage } from "./logic";
import type { Audience, Group, GroupForm, Message, Posting } from "./types";

function rows<T>(result: { data: unknown; error: { message: string } | null }): T[] {
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as T[];
}

/** Turns the answer to an action into a sentence to show, or null when it worked. */
function done(result: { error: { message: string; code?: string } | null }): string | null {
  return result.error ? chatMessage(result.error) : null;
}

interface GroupRow {
  id: string;
  name: string;
  about: string | null;
  audience: Audience;
  posting: Posting;
  can_open: boolean;
  can_post: boolean;
  last_at: string | null;
  last_name: string | null;
  last_body: string | null;
  last_has_image: boolean | null;
  unread: number;
}

export async function loadGroups(client: SupabaseClient, spaceId: string): Promise<Group[]> {
  return rows<GroupRow>(await client.rpc("my_groups", { p_space: spaceId })).map((row) => ({
    id: row.id,
    name: row.name,
    about: row.about,
    audience: row.audience,
    posting: row.posting,
    canOpen: row.can_open,
    canPost: row.can_post,
    lastAt: row.last_at,
    lastName: row.last_name,
    lastBody: row.last_body,
    lastHasImage: row.last_has_image === true,
    unread: row.unread,
  }));
}

interface MessageRow {
  id: string;
  user_id: string;
  name: string;
  role: Message["role"];
  body: string | null;
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  reply_to: string | null;
  reply_name: string | null;
  reply_body: string | null;
  created_at: string;
  changed_at: string;
  deleted: boolean;
  mine: boolean;
}

const toMessage = (row: MessageRow): Message => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  role: row.role,
  body: row.body,
  imagePath: row.image_path,
  imageWidth: row.image_width,
  imageHeight: row.image_height,
  replyTo: row.reply_to,
  replyName: row.reply_name,
  replyBody: row.reply_body,
  createdAt: row.created_at,
  changedAt: row.changed_at,
  deleted: row.deleted,
  mine: row.mine,
});

/** How many messages a page holds. */
export const PAGE = 40;

/** The newest messages in a group, or those before a moment. Whatever order they arrive in, the caller sorts. */
export async function loadPage(client: SupabaseClient, groupId: string, before: string | null = null): Promise<Message[]> {
  return rows<MessageRow>(await client.rpc("chat_page", { p_group: groupId, p_before: before, p_limit: PAGE })).map(toMessage);
}

/** Everything new or changed in a group since a moment. */
export async function loadChanges(client: SupabaseClient, groupId: string, since: string): Promise<Message[]> {
  return rows<MessageRow>(await client.rpc("chat_changes", { p_group: groupId, p_since: since })).map(toMessage);
}

export interface Picture {
  path: string;
  width: number;
  height: number;
}

/** Sends a message. Resolves with a sentence to show if it was refused, or null. */
export async function sendMessage(client: SupabaseClient, groupId: string, body: string, replyTo: string | null, picture: Picture | null = null): Promise<string | null> {
  return done(
    await client.rpc("send_message", {
      p_group: groupId,
      p_body: body.trim() || null,
      p_reply_to: replyTo,
      p_image_path: picture?.path ?? null,
      p_image_width: picture?.width ?? null,
      p_image_height: picture?.height ?? null,
    }),
  );
}

/** Deletes a message. If it had a picture, the server is told to throw the file away now. */
export async function deleteMessage(client: SupabaseClient, id: string, hadPicture: boolean): Promise<string | null> {
  const refused = done(await client.rpc("delete_message", { p_message: id }));
  if (!refused && hadPicture) kickJobs();
  return refused;
}
/** Reports a message to the space's staff, and has the server tell them now. */
export async function reportMessage(client: SupabaseClient, id: string): Promise<string | null> {
  const refused = done(await client.rpc("report_message", { p_message: id }));
  if (!refused) kickJobs();
  return refused;
}
export const blockMember = async (client: SupabaseClient, userId: string) => done(await client.rpc("block_member", { p_user: userId }));
export const unblockMember = async (client: SupabaseClient, userId: string) => done(await client.rpc("unblock_member", { p_user: userId }));

/** Nothing depends on this getting through: the next visit marks the group read again. */
export function markRead(client: SupabaseClient, groupId: string): void {
  Promise.resolve(client.rpc("mark_read", { p_group: groupId })).then(undefined, () => {});
}

export interface Blocked {
  userId: string;
  name: string;
}

export async function loadBlocks(client: SupabaseClient): Promise<Blocked[]> {
  return rows<{ user_id: string; name: string }>(await client.rpc("my_blocks")).map((row) => ({ userId: row.user_id, name: row.name }));
}

/** When the person is muted until, in this space. Null when they are not. */
export async function loadMute(client: SupabaseClient, spaceId: string, userId: string): Promise<string | null> {
  const found = rows<{ muted_until: string | null }>(
    await client.from("memberships").select("muted_until").eq("space_id", spaceId).eq("user_id", userId).limit(1),
  );
  return found[0]?.muted_until ?? null;
}

/** A short-lived address for a picture in a group. Only people who can open the group get one. */
export async function pictureUrl(client: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await client.storage.from("chat").createSignedUrl(path, 3600);
  if (error || !data) throw new Error(error?.message ?? "The picture could not be opened.");
  return data.signedUrl;
}

/** Uploads a picture for a message. Resolves with where it was put. */
export async function uploadPicture(client: SupabaseClient, spaceId: string, groupId: string, bytes: ArrayBuffer, name: string): Promise<string> {
  const path = `${spaceId}/${groupId}/${name}.jpg`;
  const { error } = await client.storage.from("chat").upload(path, bytes, { contentType: "image/jpeg" });
  if (error) throw new Error(error.message);
  return path;
}

/** Takes back a picture whose message was never sent. Nothing depends on this getting through. */
export function removePicture(client: SupabaseClient, path: string): void {
  void client.storage.from("chat").remove([path]).then(undefined, () => {});
}

// --- For the mentor and admins ----------------------------------------------------------------

/** Creates a group, or changes one when `groupId` is given. Answers with the group's id, or why it was refused. */
export async function saveGroup(
  client: SupabaseClient,
  spaceId: string,
  form: GroupForm,
  groupId: string | null,
): Promise<{ id: string; problem: null } | { id: null; problem: string }> {
  const result = await client.rpc("save_group", {
    p_space: spaceId,
    p_name: form.name,
    p_about: form.about.trim() || null,
    p_audience: form.audience,
    p_posting: form.posting,
    p_group: groupId,
  });
  if (result.error || typeof result.data !== "string") return { id: null, problem: chatMessage(result.error ?? {}) };
  return { id: result.data, problem: null };
}

/** Deletes a group with everything said in it, and tells the server to throw its pictures away now. */
export async function deleteGroup(client: SupabaseClient, groupId: string): Promise<string | null> {
  const refused = done(await client.rpc("delete_group", { p_group: groupId }));
  if (!refused) kickJobs();
  return refused;
}

/** Puts the space's groups in this order. */
export const reorderGroups = async (client: SupabaseClient, spaceId: string, groupIds: string[]) =>
  done(await client.rpc("reorder_groups", { p_space: spaceId, p_groups: groupIds }));

export async function loadGroupMemberIds(client: SupabaseClient, groupId: string): Promise<string[]> {
  return rows<{ user_id: string }>(await client.rpc("group_member_ids", { p_group: groupId })).map((row) => row.user_id);
}

export const setGroupMembers = async (client: SupabaseClient, groupId: string, add: string[], remove: string[]) =>
  done(await client.rpc("set_group_members", { p_group: groupId, p_add: add, p_remove: remove }));

/** Stops a member writing for that many hours, in every group. Zero lifts it. */
export const muteMember = async (client: SupabaseClient, spaceId: string, userId: string, hours: number) =>
  done(await client.rpc("mute_member", { p_space: spaceId, p_user: userId, p_hours: hours }));

/** A message members have reported, waiting for staff to look at it. */
export interface Reported {
  messageId: string;
  groupId: string;
  groupName: string;
  userId: string;
  name: string;
  role: Message["role"];
  body: string | null;
  hasImage: boolean;
  createdAt: string;
  reports: number;
}

export async function loadReported(client: SupabaseClient, spaceId: string): Promise<Reported[]> {
  type Row = { message_id: string; group_id: string; group_name: string; user_id: string; name: string; role: Message["role"]; body: string | null; has_image: boolean; created_at: string; reports: number };
  return rows<Row>(await client.rpc("reported_messages", { p_space: spaceId })).map((row) => ({
    messageId: row.message_id,
    groupId: row.group_id,
    groupName: row.group_name,
    userId: row.user_id,
    name: row.name,
    role: row.role,
    body: row.body,
    hasImage: row.has_image,
    createdAt: row.created_at,
    reports: row.reports,
  }));
}

export const dismissReports = async (client: SupabaseClient, messageId: string) =>
  done(await client.rpc("dismiss_message_reports", { p_message: messageId }));
