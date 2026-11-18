// The sample space's backend: everything the app asks of Supabase and of Floor's server,
// answered from memory. It is shaped like the real client, so the app's own code runs against
// it unchanged: rpc("feed", …), from("posts").select(…), storage.from("posts").upload(…).
//
// It is not a second copy of the product's rules to rely on. The real rules live in the
// database, where they are tested. This follows them closely enough that the sample looks and
// behaves like the real thing, and tests/sampleBackend.test.ts fails if the app starts asking
// for something this cannot answer.
//
// No phone code in here, so it can be tested on a computer.

import { accountFunctions } from "./functions/account";
import { chatFunctions } from "./functions/chat";
import { feedFunctions } from "./functions/feed";
import { learnFunctions } from "./functions/learn";
import { liveFunctions } from "./functions/live";
import { manageFunctions } from "./functions/manage";
import { telegramFunctions } from "./functions/telegram";
import { Refusal, type Ctx } from "./rules";
import { runRoute, SERVER_PATHS, type ServerAnswer } from "./server";
import { addFile, fileAddress, removeFiles, STORE_NAMES } from "./storage";
import { runQuery, TABLE_NAMES, type Query } from "./tables";
import type { SampleAsset, World } from "./world";

type Handler = (ctx: Ctx, args: never) => unknown;

const FUNCTIONS: Record<string, Handler> = {
  ...accountFunctions,
  ...feedFunctions,
  ...learnFunctions,
  ...manageFunctions,
  ...chatFunctions,
  ...telegramFunctions,
  ...liveFunctions,
};

/** What the sample backend can answer, by name. The test that guards against drift reads these. */
export const SAMPLE_ANSWERS = {
  functions: Object.keys(FUNCTIONS),
  tables: TABLE_NAMES,
  stores: STORE_NAMES,
  routes: SERVER_PATHS,
};

/** A refusal as Supabase reports one. */
export interface Failure {
  message: string;
  code: string;
  details: null;
  hint: null;
}

export interface Answer<T> {
  data: T | null;
  error: Failure | null;
}

export interface BackendOptions {
  world: World;
  /** The person asking. */
  who: () => string;
  /** Where a file that came with the app is. */
  assetUri: (asset: SampleAsset) => string;
  /** How long each answer takes. A real backend is never instant, and screens are built for that. */
  latencyMs?: number;
  now?: () => number;
}

export type SampleBackend = ReturnType<typeof createBackend>;

/** A question to a table, built up one call at a time and asked when it is awaited. */
class TableQuery implements PromiseLike<Answer<Record<string, unknown>[]>> {
  private readonly query: Query;

  constructor(
    table: string,
    private readonly ask: (query: Query) => Promise<Answer<Record<string, unknown>[]>>,
  ) {
    this.query = { table, select: null, update: null, equals: [], order: null, limit: null };
  }

  select(columns = "*"): this {
    this.query.select = columns;
    return this;
  }
  update(values: Record<string, unknown>): this {
    this.query.update = values;
    return this;
  }
  eq(column: string, value: unknown): this {
    this.query.equals.push([column, value]);
    return this;
  }
  order(column: string, options: { ascending?: boolean } = {}): this {
    this.query.order = { column, ascending: options.ascending ?? true };
    return this;
  }
  limit(count: number): this {
    this.query.limit = count;
    return this;
  }
  then<A = Answer<Record<string, unknown>[]>, B = never>(
    resolved?: ((value: Answer<Record<string, unknown>[]>) => A | PromiseLike<A>) | null,
    rejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return this.ask(this.query).then(resolved, rejected);
  }
}

export function createBackend(options: BackendOptions) {
  const latency = options.latencyMs ?? 0;
  const context = (): Ctx => ({ world: options.world, uid: options.who(), now: (options.now ?? Date.now)() });

  /** Does the work as the person asking, and reports a refusal the way Supabase would. */
  async function answer<T>(work: (ctx: Ctx) => T): Promise<Answer<T>> {
    if (latency > 0) await new Promise((resolve) => setTimeout(resolve, latency));
    try {
      return { data: work(context()), error: null };
    } catch (failure) {
      if (!(failure instanceof Refusal)) throw failure;
      return { data: null, error: { message: failure.message, code: failure.code, details: null, hint: null } };
    }
  }

  return {
    /** Calls one of the database's functions. */
    rpc(name: string, args: Record<string, unknown> = {}): Promise<Answer<unknown>> {
      return answer((ctx) => {
        const handler = FUNCTIONS[name];
        if (!handler) throw new Refusal(`Could not find the function public.${name} in the schema cache`, "PGRST202");
        return handler(ctx, args as never);
      });
    },

    /** Reads or changes a table directly. */
    from(table: string) {
      return new TableQuery(table, (query) => answer((ctx) => runQuery(ctx, query) ?? []).then((result) => (query.select === null && !result.error ? { data: null, error: null } : result)));
    },

    storage: {
      from(bucket: string) {
        return {
          upload: (path: string, body: unknown, uploadOptions: { contentType?: string } = {}) =>
            answer((ctx) => {
              addFile(ctx, bucket, path, body, uploadOptions.contentType ?? "image/jpeg");
              return { path };
            }),
          createSignedUrl: (path: string, _seconds: number) => answer((ctx) => ({ signedUrl: fileAddress(ctx, bucket, path, options.assetUri) })),
          remove: (paths: string[]) =>
            answer((ctx) => {
              removeFiles(ctx, bucket, paths);
              return [];
            }),
        };
      },
    },

    // Phones nudge each other through a live channel when a group changes. The sample has one
    // phone and no channel: a group here asks for changes every few seconds instead.
    channel(_name: string) {
      const channel = {
        on: (_kind: string, _filter: unknown, _listener: () => void) => channel,
        subscribe: (_onStatus?: (status: string) => void) => channel,
        send: async (_message: unknown) => "ok" as const,
      };
      return channel;
    },
    removeChannel: async (_channel: unknown) => "ok" as const,

    /** Calls Floor's own server. */
    async server(path: string, body: Record<string, unknown> = {}): Promise<ServerAnswer> {
      if (latency > 0) await new Promise((resolve) => setTimeout(resolve, latency));
      return runRoute(context(), path, body, options.assetUri);
    },

    /** The address of a space's logo, which anyone may see. Null when there is no such file. */
    logoAddress(path: string): string | null {
      const file = options.world.files.find((each) => each.bucket === "logos" && each.path === path);
      return file ? (file.asset ? options.assetUri(file.asset) : file.data) : null;
    },
  };
}
