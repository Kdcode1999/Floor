import { beforeAll, describe, expect, it } from "vitest";

import { as, createDb, newUser, type Db, type TestUser, type Tx } from "./harness";
import { join, openSpace } from "./helpers";

function asServer<T>(db: Db, run: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return run(tx);
  }) as Promise<T>;
}

describe("alerts", () => {
  let db: Db;
  let kay: TestUser;
  let vee: TestUser;
  let free: TestUser;
  let gone: TestUser;
  let space: string;

  const saveToken = (who: TestUser, token: string, platform = "android") =>
    as(db, who, (tx) => tx.query("select public.save_push_token($1, $2)", [token, platform]));
  const recipients = (type: string, vipOnly = true, except: string | null = null) =>
    asServer(db, async (tx) =>
      (await tx.query<{ token: string }>("select * from public.alert_recipients($1, $2, $3, $4)", [space, type, vipOnly, except])).rows.map((row) => row.token),
    );
  const tokens = async () => (await db.query<{ token: string }>("select token from public.push_tokens order by token")).rows.map((row) => row.token);

  beforeAll(async () => {
    db = await createDb();
    kay = await newUser(db, "kay@example.com", "Kay");
    vee = await newUser(db, "vee@example.com", "Vee");
    free = await newUser(db, "free@example.com", "Free");
    gone = await newUser(db, "gone@example.com", "Gone");
    space = await openSpace(db, kay, "gold-desk");
    for (const person of [vee, free, gone]) await join(db, person, "gold-desk");
    await as(db, kay, (tx) => tx.query("select public.grant_vip($1, $2, 30)", [space, vee.id]));
    await as(db, kay, (tx) => tx.query("select public.grant_vip($1, $2, 30)", [space, gone.id]));
    await saveToken(kay, "ExponentPushToken[kay-phone]", "ios");
    await saveToken(vee, "ExponentPushToken[vee-phone]");
    await saveToken(free, "ExponentPushToken[free-phone]");
    await saveToken(gone, "ExponentPushToken[gone-phone]");
  });

  it("keep one address per account: a new phone replaces the old one", async () => {
    await saveToken(vee, "ExponentPushToken[vee-new-phone]");
    expect(await tokens()).not.toContain("ExponentPushToken[vee-phone]");
    expect(await tokens()).toContain("ExponentPushToken[vee-new-phone]");
  });

  it("move a phone's address to whoever signs in on it next", async () => {
    await saveToken(free, "ExponentPushToken[shared-phone]");
    await saveToken(gone, "ExponentPushToken[shared-phone]");
    const owner = await db.query<{ user_id: string }>("select user_id from public.push_tokens where token = 'ExponentPushToken[shared-phone]'");
    expect(owner.rows).toEqual([{ user_id: gone.id }]);
    await saveToken(free, "ExponentPushToken[free-phone]");
    await saveToken(gone, "ExponentPushToken[gone-phone]");
  });

  it("take a web app's address, which is longer, and give it out like any other", async () => {
    const subscription = JSON.stringify({
      endpoint: `https://web.push.apple.com/${"Q".repeat(160)}`,
      keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
    });
    expect(subscription.length).toBeGreaterThan(300);
    await saveToken(free, subscription, "web");
    expect(await recipients("setup", false)).toContain(subscription);
    await expect(saveToken(free, "x".repeat(2001), "web")).rejects.toThrow(/push_tokens_token/);
    await expect(saveToken(free, "ExponentPushToken[free-phone]", "windows")).rejects.toThrow(/push_tokens_platform/);
    await saveToken(free, "ExponentPushToken[free-phone]");
  });

  it("cannot be read or written except through the functions", async () => {
    await expect(as(db, vee, (tx) => tx.query("select * from public.push_tokens"))).rejects.toThrow(/permission denied/);
    await expect(as(db, vee, (tx) => tx.query("select * from public.alert_recipients($1, 'setup')", [space]))).rejects.toThrow(/permission denied/);
    await expect(as(db, null, (tx) => tx.query("select public.save_push_token('ExponentPushToken[x]', 'ios')"))).rejects.toThrow(/permission denied/);
  });

  it("go to those who could open what the alert is about", async () => {
    expect(await recipients("setup")).toEqual(["ExponentPushToken[gone-phone]", "ExponentPushToken[kay-phone]", "ExponentPushToken[vee-new-phone]"]);
    expect(await recipients("setup", false)).toHaveLength(4);
  });

  it("leave out the person who caused the alert", async () => {
    expect(await recipients("setup", true, kay.id)).toEqual(["ExponentPushToken[gone-phone]", "ExponentPushToken[vee-new-phone]"]);
    expect(await recipients("setup", true, vee.id)).toEqual(["ExponentPushToken[gone-phone]", "ExponentPushToken[kay-phone]"]);
  });

  it("know who caused each job, and nobody when the server queued it", async () => {
    await as(db, kay, (tx) =>
      tx.query("select public.create_post(p_space => $1, p_kind => 'setup', p_pair => 'eurusd', p_side => 'buy', p_entry => '1.08', p_stop => '1.07', p_targets => $2)", [space, ["1.10"]]),
    );
    await asServer(db, (tx) => tx.query("select public.queue_job('push_receipts', $1, '{\"tickets\": {}}'::jsonb)", [space]));
    const jobs = await db.query<{ kind: string; actor: string | null }>("select kind, payload ->> 'actor' as actor from private.outbox order by id desc limit 2");
    expect(jobs.rows).toEqual([
      { kind: "push_receipts", actor: null },
      { kind: "alert", actor: kay.id },
    ]);
  });

  it("respect each member's own switches, one kind at a time", async () => {
    await as(db, vee, (tx) => tx.query("select public.set_alerts($1, false, null, null)", [space]));
    expect(await recipients("setup")).not.toContain("ExponentPushToken[vee-new-phone]");
    expect(await recipients("lesson")).toContain("ExponentPushToken[vee-new-phone]");
    expect(await recipients("live")).toContain("ExponentPushToken[vee-new-phone]");
    const mine = await as(db, vee, async (tx) => (await tx.query("select alert_setups, alert_live, alert_lessons from public.memberships where user_id = $1", [vee.id])).rows[0]);
    expect(mine).toEqual({ alert_setups: false, alert_live: true, alert_lessons: true });
    await as(db, vee, (tx) => tx.query("select public.set_alerts($1, true, true, true)", [space]));
  });

  it("let nobody switch alerts for a space they are not in", async () => {
    const stranger = await newUser(db, "stranger@example.com", "Stranger");
    await expect(as(db, stranger, (tx) => tx.query("select public.set_alerts($1, false, false, false)", [space]))).rejects.toThrow(/not_allowed/);
  });

  it("stop for someone removed from the space, whose VIP ended, or who signed out", async () => {
    await as(db, kay, (tx) => tx.query("select public.ban_member($1, $2)", [space, gone.id]));
    expect(await recipients("setup", false)).not.toContain("ExponentPushToken[gone-phone]");

    await as(db, kay, (tx) => tx.query("select public.end_vip($1, $2)", [space, vee.id]));
    expect(await recipients("setup")).toEqual(["ExponentPushToken[kay-phone]"]);
    await as(db, kay, (tx) => tx.query("select public.grant_vip($1, $2, 30)", [space, vee.id]));

    await as(db, vee, (tx) => tx.query("select public.remove_push_token()"));
    expect(await recipients("setup")).toEqual(["ExponentPushToken[kay-phone]"]);
    await saveToken(vee, "ExponentPushToken[vee-new-phone]");
  });

  it("stop for everyone when Floor suspends the space", async () => {
    await db.query("update public.spaces set status = 'suspended' where id = $1", [space]);
    expect(await recipients("setup", false)).toEqual([]);
    await db.query("update public.spaces set status = 'active' where id = $1", [space]);
  });

  it("forget an address the notification service says is dead", async () => {
    await asServer(db, (tx) => tx.query("select public.forget_push_tokens($1)", [["ExponentPushToken[free-phone]", "ExponentPushToken[never-existed]"]]));
    expect(await tokens()).not.toContain("ExponentPushToken[free-phone]");
    await expect(as(db, kay, (tx) => tx.query("select public.forget_push_tokens($1)", [["ExponentPushToken[kay-phone]"]]))).rejects.toThrow(/permission denied/);
  });
});
