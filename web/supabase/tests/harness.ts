// Runs the real migrations against a real Postgres engine (PGlite, Postgres compiled to
// WebAssembly) so the access rules can be tested without a Supabase project.
//
// Supabase provides a few things that plain Postgres does not: the anon, authenticated and
// service_role roles, the auth schema with auth.uid() and auth.jwt(), and the storage schema.
// SUPABASE_STUB recreates just enough of them for the migrations to apply and behave the same.

import { PGlite, type Transaction } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, "..", "migrations");

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;

  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    owner uuid
  );
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
  $$;
  grant usage on schema storage to anon, authenticated, service_role;
  grant select, insert on storage.objects to authenticated;
`;

export type Db = PGlite;
export type Tx = Transaction;

export interface TestUser {
  id: string;
  /** The login this test user is using. Change it to act as an older or newer login. */
  session: string;
}

export async function createDb(): Promise<Db> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of files) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
  return db;
}

/** Creates an account the way sign-up does: a row in auth.users, which fires the new-user trigger. */
export async function newUser(db: Db, email: string, displayName?: string): Promise<TestUser> {
  const meta = displayName ? { display_name: displayName } : {};
  const result = await db.query<{ id: string }>(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id",
    [email, JSON.stringify(meta)],
  );
  return { id: result.rows[0].id, session: randomUUID() };
}

/**
 * Runs queries as a signed-in user (or as the public when user is null), exactly as the API
 * would: the database role is switched and the login's claims are set for one transaction.
 */
export async function as<T>(db: Db, user: TestUser | null, run: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const claims = user ? { sub: user.id, role: "authenticated", session_id: user.session } : {};
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await tx.exec(`set local role ${user ? "authenticated" : "anon"}`);
    return run(tx);
  }) as Promise<T>;
}

/** Calls a function and returns its single value. */
export async function call<T>(tx: Tx, sql: string, params: unknown[] = []): Promise<T> {
  const result = await tx.query<Record<string, T>>(sql, params);
  const row = result.rows[0];
  return row ? (Object.values(row)[0] as T) : (undefined as T);
}

/** A 32 character id, like the one the phone app generates and keeps. */
export function deviceId(): string {
  return randomUUID().replace(/-/g, "");
}
