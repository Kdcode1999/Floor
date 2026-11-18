// The file stores, in the sample space: pictures in posts and groups, payment proofs and
// logos. Each store keeps the rule its real one keeps about who may add, see or remove a file:
// see the "storage.objects" policies in web/supabase/migrations.
//
// A picture uploaded here is held in memory, as an address that carries the picture itself.
// No phone code.

import { canReadGroup, hasAccess, isMember, isMentor, isStaff, Refusal, type Ctx } from "./rules";
import type { SampleAsset } from "./world";

interface Store {
  add: (ctx: Ctx, folders: string[]) => boolean;
  see: (ctx: Ctx, folders: string[]) => boolean;
  remove: (ctx: Ctx, folders: string[]) => boolean;
}

// A file's folders say whose it is. For a post: "<space>/<audience>/<name>".
const STORES: Record<string, Store> = {
  posts: {
    add: (ctx, [space]) => isStaff(ctx, space),
    see: (ctx, [space, audience]) => hasAccess(ctx, space, audience !== "everyone"),
    remove: (ctx, [space]) => isStaff(ctx, space),
  },
  chat: {
    add: (ctx, [space]) => isStaff(ctx, space),
    see: (ctx, [, group]) => canReadGroup(ctx, group),
    remove: (ctx, [space]) => isStaff(ctx, space),
  },
  proofs: {
    add: (ctx, [space, user]) => user === ctx.uid && isMember(ctx, space),
    see: (ctx, [space, user]) => user === ctx.uid || isStaff(ctx, space),
    remove: () => false,
  },
  logos: {
    add: (ctx, [space]) => isMentor(ctx, space),
    see: () => true,
    remove: (ctx, [space]) => isMentor(ctx, space),
  },
};

/** The names of the stores the sample space has. */
export const STORE_NAMES = Object.keys(STORES);

function storeNamed(bucket: string): Store {
  const store = STORES[bucket];
  if (!store) throw new Refusal("Bucket not found");
  return store;
}

const folders = (path: string) => path.split("/").slice(0, -1);

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Bytes as base64 text, so a picture can be carried inside an address. */
export function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = index + 1 < bytes.length ? bytes[index + 1] : undefined;
    const c = index + 2 < bytes.length ? bytes[index + 2] : undefined;
    text += ALPHABET[a >> 2];
    text += ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)];
    text += b === undefined ? "=" : ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)];
    text += c === undefined ? "=" : ALPHABET[c & 63];
  }
  return text;
}

/** Keeps an uploaded picture. Refuses when the person may not add to that folder. */
export function addFile(ctx: Ctx, bucket: string, path: string, body: unknown, contentType: string): void {
  if (!storeNamed(bucket).add(ctx, folders(path))) throw new Refusal("new row violates row-level security policy", "42501");
  const bytes = body instanceof ArrayBuffer ? new Uint8Array(body) : ArrayBuffer.isView(body) ? new Uint8Array(body.buffer, body.byteOffset, body.byteLength) : null;
  if (!bytes) throw new Refusal("The sample space can only keep a picture.");
  if (ctx.world.files.some((each) => each.bucket === bucket && each.path === path)) throw new Refusal("The resource already exists");
  ctx.world.files.push({ bucket, path, asset: null, data: `data:${contentType};base64,${toBase64(bytes)}` });
}

/** An address for a file, for someone who may see it. */
export function fileAddress(ctx: Ctx, bucket: string, path: string, assetUri: (asset: SampleAsset) => string): string {
  const file = ctx.world.files.find((each) => each.bucket === bucket && each.path === path);
  if (!file || !storeNamed(bucket).see(ctx, folders(path))) throw new Refusal("Object not found");
  return file.asset ? assetUri(file.asset) : (file.data ?? "");
}

/** Throws files away. One the person may not remove is quietly left, as the real store leaves it. */
export function removeFiles(ctx: Ctx, bucket: string, paths: string[]): void {
  const store = storeNamed(bucket);
  ctx.world.files = ctx.world.files.filter((each) => !(each.bucket === bucket && paths.includes(each.path) && store.remove(ctx, folders(each.path))));
}
