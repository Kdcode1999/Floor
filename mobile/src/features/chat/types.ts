// What the apps know about groups and messages. Mirrors what the database's chat functions give.

export type Audience = "everyone" | "vip" | "invited";
export type Posting = "all" | "staff";
export type ChatRole = "mentor" | "admin" | "member";

/** A group as this person sees it in the list. */
export interface Group {
  id: string;
  name: string;
  about: string | null;
  audience: Audience;
  posting: Posting;
  /** False for a VIP group seen by a free member: it is listed, locked. */
  canOpen: boolean;
  canPost: boolean;
  /** When the newest message was sent. Null in an empty group, and in one the person cannot open. */
  lastAt: string | null;
  lastName: string | null;
  lastBody: string | null;
  lastHasImage: boolean;
  /** How many messages the person has not read. Stops counting at 100. */
  unread: number;
}

/** One message in a group. */
export interface Message {
  id: string;
  userId: string;
  name: string;
  /** The writer's place in the space. Null when they have left it. */
  role: ChatRole | null;
  /** Null for a picture with no words, and for a deleted message. */
  body: string | null;
  /** Where the picture is in the "chat" store. */
  imagePath: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  /** The message this one answers, with a line of it. */
  replyTo: string | null;
  replyName: string | null;
  replyBody: string | null;
  createdAt: string;
  changedAt: string;
  deleted: boolean;
  mine: boolean;
}

/** What staff fill in to create or change a group. */
export interface GroupForm {
  name: string;
  about: string;
  audience: Audience;
  posting: Posting;
}
