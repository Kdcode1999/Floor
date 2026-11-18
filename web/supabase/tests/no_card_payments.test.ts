import { beforeAll, describe, expect, it } from "vitest";

import { createDb, type Db } from "./harness";

describe("card payments are gone", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createDb();
  });

  it("leaves no table, column or function for them", async () => {
    const tables = await db.query("select table_schema, table_name from information_schema.tables where table_name in ('payments', 'payment_accounts')");
    expect(tables.rows).toEqual([]);
    const columns = await db.query("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'spaces' and column_name like 'card%'");
    expect(columns.rows).toEqual([]);
    const functions = await db.query(
      "select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (proname like '%payment%' or proname = 'settle_payment')",
    );
    expect(functions.rows).toEqual([]);
  });
});
