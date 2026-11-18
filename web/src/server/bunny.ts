import "server-only";

import { createHash, createHmac } from "node:crypto";

import { BUNNY } from "./env";

// Bunny Stream: the video host for lessons. Everything Floor asks of it is in this file, so
// another host could replace it without touching the rest.
//
// What it does for Floor
// * Takes the upload straight from the mentor's phone or laptop, in pieces that survive a
//   dropped connection (the "tus" protocol). The file never passes through Floor's server.
// * Prepares each video in several sizes, so a phone on a slow connection gets a small one.
// * Serves a video only at an address this server has signed, and only until it runs out.

/** How a video is doing, in the words the database uses. */
export type VideoStatus = "uploading" | "processing" | "ready" | "failed";

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BUNNY.api}/library/${BUNNY.libraryId}${path}`, {
    ...init,
    headers: { AccessKey: BUNNY.apiKey, Accept: "application/json", "Content-Type": "application/json", ...init.headers },
  });
}

/** Makes an empty video at the host, ready to receive a file. Resolves with its id. */
export async function createVideo(title: string): Promise<string> {
  const response = await call("/videos", { method: "POST", body: JSON.stringify({ title: title.slice(0, 200) }) });
  if (!response.ok) throw new Error(`The video host refused a new video: ${response.status}`);
  const video = (await response.json()) as { guid?: string };
  if (!video.guid) throw new Error("The video host gave no id for the new video");
  return video.guid;
}

/** Makes a video from a file the host fetches itself, such as a live session's recording. */
export async function fetchVideo(url: string, title: string): Promise<string> {
  const response = await call("/videos/fetch", { method: "POST", body: JSON.stringify({ url, title: title.slice(0, 200) }) });
  if (!response.ok) throw new Error(`The video host refused to fetch a video: ${response.status}`);
  const answer = (await response.json()) as { id?: string; guid?: string };
  const made = answer.id ?? answer.guid;
  if (!made) throw new Error("The video host gave no id for the fetched video");
  return made;
}

export interface UploadTicket {
  /** Where the file is sent. */
  endpoint: string;
  /** Sent with every piece of the upload. They let this one video be uploaded, by anyone holding them, until they run out. */
  headers: Record<string, string>;
}

/** How long an upload may take. A large lesson on a slow connection needs hours. */
const UPLOAD_SECONDS = 24 * 60 * 60;

/** What a phone or laptop needs to upload one video straight to the host. */
export function uploadTicket(videoId: string, now = Date.now()): UploadTicket {
  const expires = Math.floor(now / 1000) + UPLOAD_SECONDS;
  const signature = createHash("sha256").update(`${BUNNY.libraryId}${BUNNY.apiKey}${expires}${videoId}`).digest("hex");
  return {
    endpoint: `${BUNNY.api}/tusupload`,
    headers: {
      AuthorizationSignature: signature,
      AuthorizationExpire: String(expires),
      VideoId: videoId,
      LibraryId: BUNNY.libraryId,
    },
  };
}

/** How a video is doing at the host, and how long it is once that is known. */
export async function videoState(videoId: string): Promise<{ status: VideoStatus; seconds: number | null } | null> {
  const response = await call(`/videos/${videoId}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`The video host could not be asked about a video: ${response.status}`);
  const video = (await response.json()) as { status?: number; length?: number };
  // 0 created, 1 uploaded, 2 processing, 3 transcoding, 4 finished, 5 error, 6 upload failed.
  const status: VideoStatus =
    video.status === 4 ? "ready" : video.status === 5 || video.status === 6 ? "failed" : video.status === 0 ? "uploading" : "processing";
  return { status, seconds: status === "ready" && typeof video.length === "number" ? Math.round(video.length) : null };
}

/** Removes a video from the host. A video that is already gone counts as removed. */
export async function deleteVideo(videoId: string): Promise<void> {
  const response = await call(`/videos/${videoId}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) throw new Error(`The video host refused to delete a video: ${response.status}`);
}

/**
 * Signs an address under one video's folder, so that it and everything beside it (the lists of
 * pieces and the pieces themselves) can be fetched until `expires`, and nothing else can.
 *
 * This is Bunny's token authentication with a directory token: an HMAC-SHA256 of the folder,
 * the expiry and the token's own settings, keyed with the library's token key. The token sits
 * in the address's path, which is what lets a player follow the video's relative links.
 */
export function signedAddress(videoId: string, file: string, expires: number): string {
  const folder = `/${videoId}/`;
  const settings = `token_path=${folder}`;
  const digest = createHmac("sha256", BUNNY.tokenKey).update(`${folder}${expires}${settings}`).digest("base64url");
  return `${BUNNY.cdn}/bcdn_token=HS256-${digest}&expires=${expires}&token_path=${encodeURIComponent(folder)}${folder}${file}`;
}

/** How long a playback address works. Long enough for the longest lesson with pauses. */
const PLAY_SECONDS = 6 * 60 * 60;

export interface Playback {
  /** The video, as a list of sizes the player chooses from as the connection allows. */
  url: string;
  /** A still picture to show before the video starts. */
  poster: string;
  /** When both addresses stop working, in seconds since 1970. */
  expires: number;
}

export function playback(videoId: string, now = Date.now()): Playback {
  const expires = Math.floor(now / 1000) + PLAY_SECONDS;
  return {
    url: signedAddress(videoId, "playlist.m3u8", expires),
    poster: signedAddress(videoId, "thumbnail.jpg", expires),
    expires,
  };
}
