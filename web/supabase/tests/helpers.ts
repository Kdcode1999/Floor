// Short ways to do the common things in the database tests, as a given person.
import { expect } from "vitest";

import { as, call, type Db, type TestUser } from "./harness";

export const DAY = 24 * 60 * 60 * 1000;
export const TERMS = "2026-11";

export function openSpace(db: Db, mentor: TestUser, slug: string, name = "Gold Desk") {
  return as(db, mentor, (tx) =>
    call<string>(tx, "select public.create_space($1, $2, $3, $4)", [name, slug, "night", TERMS]),
  );
}

export function join(db: Db, user: TestUser, slug: string) {
  return as(db, user, (tx) => call<string>(tx, "select public.join_space($1)", [slug]));
}

export function claim(db: Db, user: TestUser, device: string) {
  return as(db, user, (tx) => call<string>(tx, "select public.claim_session($1)", [device]));
}

export function hasAccess(db: Db, user: TestUser, space: string, vip = false) {
  return as(db, user, (tx) => call<boolean>(tx, "select private.has_access($1, $2)", [space, vip]));
}

export function requestAccess(db: Db, user: TestUser, space: string, kind = "payment", file = "receipt.jpg") {
  return as(db, user, (tx) =>
    call<string>(tx, "select public.request_access($1, $2, $3, $4)", [
      space,
      kind,
      `${space}/${user.id}/${file}`,
      "Paid by transfer",
    ]),
  );
}

export async function vipUntil(db: Db, space: string, user: TestUser): Promise<Date | null> {
  const result = await db.query<{ vip_until: Date | null }>(
    "select vip_until from public.memberships where space_id = $1 and user_id = $2",
    [space, user.id],
  );
  return result.rows[0]?.vip_until ?? null;
}

export function expectAbout(actual: Date | null, expectedMs: number) {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual as Date).getTime() - expectedMs)).toBeLessThan(60_000);
}
