// The sample space's own little database: the same tables the real one has, held in memory.
//
// It exists so the app can be looked at with no setup. Nothing in it is real and nothing is
// kept: it is made afresh each time the app starts. Rows are named and shaped the way the
// database's are, so the app reads them with the code it uses for the real thing.
//
// No phone code in here, so it can be tested on a computer. See tests/sampleBackend.test.ts.

export type Role = "mentor" | "admin" | "member";
export type VideoStatus = "none" | "uploading" | "processing" | "ready" | "failed";

/** The pictures and the film that come with the app for the sample space. */
export type SampleAsset = "chart" | "chart2" | "proof" | "lesson" | "poster";

export interface UserRow {
  id: string;
  email: string;
}

export interface ProfileRow {
  id: string;
  display_name: string;
}

export interface SpaceRow {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logo_path: string | null;
  theme: string;
  owner_id: string;
  status: "active" | "suspended";
  vip_price_cents: number | null;
  vip_currency: string | null;
  vip_days: number;
  broker_name: string | null;
  created_at: string;
}

export interface SettingsRow {
  space_id: string;
  payment_link: string | null;
  payment_instructions: string | null;
  broker_link: string | null;
  broker_vip_days: number;
  block_capture: boolean;
  watermark: boolean;
}

export interface MembershipRow {
  space_id: string;
  user_id: string;
  role: Role;
  status: "active" | "banned";
  vip_until: string | null;
  joined_at: string;
  muted_until: string | null;
  alert_setups: boolean;
  alert_live: boolean;
  alert_lessons: boolean;
}

export interface RequestRow {
  id: string;
  space_id: string;
  user_id: string;
  kind: "payment" | "broker";
  proof_path: string;
  note: string | null;
  days: number;
  status: "pending" | "approved" | "declined";
  decline_reason: string | null;
  created_at: string;
}

export interface CodeRow {
  id: string;
  space_id: string;
  code: string;
  days: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  revoked: boolean;
  created_at: string;
}

export interface ReportRow {
  id: string;
  space_id: string;
  reporter_id: string;
  reason: string;
  details: string | null;
  status: "open" | "closed";
  created_at: string;
}

export interface PostRow {
  id: string;
  space_id: string;
  author_id: string;
  kind: "post" | "setup" | "offer";
  audience: "everyone" | "vip";
  title: string | null;
  body: string | null;
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  embed_url: string | null;
  pair: string | null;
  side: string | null;
  entry: string | null;
  stop: string | null;
  targets: string[] | null;
  update_note: string | null;
  update_at: string | null;
  closed_at: string | null;
  link_url: string | null;
  link_label: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

export interface ModuleRow {
  id: string;
  space_id: string;
  title: string;
  position: number;
  created_at: string;
}

export interface LessonRow {
  id: string;
  space_id: string;
  module_id: string;
  title: string;
  description: string | null;
  position: number;
  published_at: string | null;
  video_id: string | null;
  video_status: VideoStatus;
  duration_seconds: number | null;
  created_at: string;
}

export interface ProgressRow {
  user_id: string;
  lesson_id: string;
  seconds: number;
  completed_at: string | null;
}

export interface GroupRow {
  id: string;
  space_id: string;
  name: string;
  about: string | null;
  audience: "everyone" | "vip" | "invited";
  posting: "all" | "staff";
  position: number;
  created_at: string;
  last_message_at: string | null;
  /** Set for the chat of a live session. Such a group never shows in the list of groups. */
  session_id: string | null;
}

export interface GroupMemberRow {
  group_id: string;
  user_id: string;
}

export interface MessageRow {
  id: string;
  group_id: string;
  space_id: string;
  user_id: string;
  body: string | null;
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  reply_to: string | null;
  created_at: string;
  changed_at: string;
  deleted_at: string | null;
}

export interface GroupReadRow {
  group_id: string;
  user_id: string;
  read_at: string;
}

export interface BlockRow {
  user_id: string;
  blocked_id: string;
  created_at: string;
}

export interface MessageReportRow {
  message_id: string;
  space_id: string;
  reporter_id: string;
  status: "open" | "closed";
  created_at: string;
}

export interface TelegramRow {
  space_id: string;
  chat_id: number | null;
  chat_title: string | null;
  chat_kind: "channel" | "supergroup" | "group" | null;
  connected_at: string | null;
  connect_code: string | null;
  code_expires_at: string | null;
  tease_setups: boolean;
  tease_posts: boolean;
  tease_lessons: boolean;
  tease_live: boolean;
  last_sent_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
}

/** A class on the schedule, or a live session that is on or over. */
export interface LiveRow {
  id: string;
  space_id: string;
  title: string;
  about: string | null;
  starts_at: string;
  status: "scheduled" | "live" | "ended" | "cancelled";
  started_at: string | null;
  ended_at: string | null;
  host_id: string | null;
  /** When the broadcaster's app last said it was still there. */
  host_seen_at: string | null;
  record: boolean;
  recording_status: "none" | "recording" | "saving" | "saved" | "failed";
  lesson_id: string | null;
  created_at: string;
}

export interface SuspensionRow {
  space_id: string;
  note: string;
}

/** A file in one of the stores: a picture that came with the app, or one uploaded since it started. */
export interface FileRow {
  bucket: string;
  path: string;
  asset: SampleAsset | null;
  /** What was uploaded, as an address that holds the picture itself. */
  data: string | null;
}

export interface World {
  users: UserRow[];
  profiles: ProfileRow[];
  spaces: SpaceRow[];
  space_settings: SettingsRow[];
  memberships: MembershipRow[];
  access_requests: RequestRow[];
  invite_codes: CodeRow[];
  /** Who has used which invite code. Each person uses a code once. */
  invite_redemptions: { code_id: string; user_id: string }[];
  reports: ReportRow[];
  posts: PostRow[];
  modules: ModuleRow[];
  lessons: LessonRow[];
  lesson_progress: ProgressRow[];
  groups: GroupRow[];
  group_members: GroupMemberRow[];
  messages: MessageRow[];
  group_reads: GroupReadRow[];
  blocks: BlockRow[];
  message_reports: MessageReportRow[];
  telegram_links: TelegramRow[];
  live_sessions: LiveRow[];
  suspensions: SuspensionRow[];
  files: FileRow[];
}

/** A world with nothing in it. */
export function emptyWorld(): World {
  return {
    users: [],
    profiles: [],
    spaces: [],
    space_settings: [],
    memberships: [],
    access_requests: [],
    invite_codes: [],
    invite_redemptions: [],
    reports: [],
    posts: [],
    modules: [],
    lessons: [],
    lesson_progress: [],
    groups: [],
    group_members: [],
    messages: [],
    group_reads: [],
    blocks: [],
    message_reports: [],
    telegram_links: [],
    live_sessions: [],
    suspensions: [],
    files: [],
  };
}

// --- Ids and times ----------------------------------------------------------------------------

/** An id for something that comes with the sample, the same on every start: "…0000002a". */
export function fixedId(number: number): string {
  return `00000000-0000-4000-8000-${number.toString(16).padStart(12, "0")}`;
}

/** An id for something made while the app runs. Shaped like the database's own. */
export function newId(): string {
  const hex = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${"89ab"[Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`;
}

/** A moment the way the app expects to be given one. */
export function iso(time: number): string {
  return new Date(time).toISOString();
}

/** A row for someone who has just joined a space. */
export function membership(space: string, user: string, joined: number, more: Partial<MembershipRow> = {}): MembershipRow {
  return {
    space_id: space,
    user_id: user,
    role: "member",
    status: "active",
    vip_until: null,
    joined_at: iso(joined),
    muted_until: null,
    alert_setups: true,
    alert_live: true,
    alert_lessons: true,
    ...more,
  };
}

/** The settings a new space starts with. */
export function settings(space: string): SettingsRow {
  return {
    space_id: space,
    payment_link: null,
    payment_instructions: null,
    broker_link: null,
    broker_vip_days: 30,
    block_capture: true,
    watermark: true,
  };
}

/** The two groups every space starts with. */
export function firstGroups(space: string, created: number): GroupRow[] {
  const blank = { space_id: space, posting: "all" as const, created_at: iso(created), last_message_at: null, session_id: null };
  return [
    { ...blank, id: newId(), name: "General", about: "Open to everyone in the space.", audience: "everyone", position: 0 },
    { ...blank, id: newId(), name: "VIP room", about: "For VIP members.", audience: "vip", position: 1 },
  ];
}
