import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import * as tus from "tus-js-client";

import type { UploadTicket } from "./api";

export interface PickedVideo {
  /** Where the video is on this phone. */
  uri: string;
  /** What the phone calls it, if it says. */
  name: string;
  /** Its kind, such as "video/mp4". */
  type: string;
  /** The browser's own handle on the file. Only in the web build. */
  file?: File;
}

/** Lets the mentor choose one video from their phone. Resolves with null when they back out. */
export async function pickVideo(): Promise<PickedVideo | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["videos"],
    quality: 1,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  return {
    uri: asset.uri,
    name: asset.fileName ?? "lesson.mp4",
    type: asset.mimeType ?? "video/mp4",
    file: asset.file,
  };
}

export interface UploadHandle {
  /** Stops the upload. What was sent stays at the host, so the same file could carry on later. */
  stop: () => void;
}

/**
 * Sends a video straight to the video host, in pieces. A piece that fails is sent again after
 * a pause, and a connection that drops only costs the piece that was on its way, which matters
 * for a large file on mobile data.
 */
export function uploadVideo(
  video: PickedVideo,
  ticket: UploadTicket,
  on: { progress: (sent: number, total: number) => void; done: () => void; failed: () => void },
): UploadHandle {
  // The upload library takes a browser's file on the web and the file's place on a phone.
  const source = Platform.OS === "web" && video.file ? video.file : ({ uri: video.uri } as unknown as Blob);
  const upload = new tus.Upload(source, {
    endpoint: ticket.endpoint,
    headers: ticket.headers,
    metadata: { filetype: video.type, title: video.name },
    // 5 MB pieces: small enough to resend cheaply, large enough not to crawl.
    chunkSize: 5 * 1024 * 1024,
    retryDelays: [0, 3000, 5000, 10000, 20000, 60000, 60000],
    // Each upload has its own address and ticket, so there is nothing to find again later.
    storeFingerprintForResuming: false,
    removeFingerprintOnSuccess: true,
    onProgress: on.progress,
    onSuccess: on.done,
    onError: on.failed,
  });
  upload.start();
  return { stop: () => void upload.abort() };
}
