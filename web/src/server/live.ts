import "server-only";

import {
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  RoomServiceClient,
  S3Upload,
  WebhookReceiver,
  type WebhookEvent,
} from "livekit-server-sdk";

import {
  LIVEKIT,
  livekitApi,
  liveConfigured,
  RECORDINGS,
  recordingConfigured,
} from "./env";

/** How long a pass into a room lasts. A session longer than this asks for a new one on reconnect. */
const PASS_TTL = "6h";

export interface Pass {
  url: string;
  token: string;
}

/**
 * A pass into one session's room for one person. The person broadcasting may send camera,
 * microphone and screen. Everyone else only watches and listens: nobody else can be heard or
 * seen, whatever their app tries. Chat goes through Floor's own groups, never the room.
 * Null while live video is not set up.
 */
export async function passFor(
  session: string,
  person: { id: string; name: string; broadcaster: boolean },
): Promise<Pass | null> {
  if (!liveConfigured) return null;
  const token = new AccessToken(LIVEKIT.apiKey, LIVEKIT.apiSecret, {
    identity: person.id,
    name: person.name,
    ttl: PASS_TTL,
  });
  token.addGrant({
    room: session,
    roomJoin: true,
    canSubscribe: true,
    canPublish: person.broadcaster,
    canPublishData: false,
  });
  return { url: LIVEKIT.url, token: await token.toJwt() };
}

/** Where in the `recordings` store a session's recording is written. */
export const recordingPath = (space: string, session: string) =>
  `${space}/${session}.mp4`;

/**
 * Starts recording a session's room: what members see and hear, as one file, written straight
 * to the `recordings` store. Resolves with the recording's id at the live video server, or null
 * when recordings are not set up.
 */
export async function startRecording(
  space: string,
  session: string,
): Promise<string | null> {
  if (!liveConfigured || !recordingConfigured) return null;
  const rooms = new RoomServiceClient(
    livekitApi(),
    LIVEKIT.apiKey,
    LIVEKIT.apiSecret,
  );
  // The broadcaster may not be in the room yet. Making it first lets the recording start now.
  await rooms.createRoom({ name: session, emptyTimeout: 300 });
  const file = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: recordingPath(space, session),
    output: {
      case: "s3",
      value: new S3Upload({
        endpoint: RECORDINGS.endpoint,
        region: RECORDINGS.region,
        accessKey: RECORDINGS.accessKey,
        secret: RECORDINGS.secret,
        bucket: RECORDINGS.bucket,
        forcePathStyle: true,
      }),
    },
  });
  const started = await new EgressClient(
    livekitApi(),
    LIVEKIT.apiKey,
    LIVEKIT.apiSecret,
  ).startRoomCompositeEgress(session, { file }, { layout: "speaker" });
  return started.egressId;
}

/** Closes a session's room, sending everyone in it out. Quietly does nothing if it is already gone. */
export async function closeRoom(session: string): Promise<void> {
  if (!liveConfigured) return;
  try {
    await new RoomServiceClient(
      livekitApi(),
      LIVEKIT.apiKey,
      LIVEKIT.apiSecret,
    ).deleteRoom(session);
  } catch {
    // The room closes by itself once it is empty. Nothing is lost if this call fails.
  }
}

/** Reads a message from the live video server, after checking it was signed with Floor's secret. */
export async function readWebhook(
  body: string,
  authorization: string | null,
): Promise<WebhookEvent | null> {
  if (!liveConfigured || !authorization) return null;
  try {
    return await new WebhookReceiver(LIVEKIT.apiKey, LIVEKIT.apiSecret).receive(
      body,
      authorization,
    );
  } catch {
    return null;
  }
}

/**
 * Who sent a request, from the sign-in token they sent. Only read after the database has
 * accepted the same token, which is what proves it is genuine.
 */
export function personIn(token: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
