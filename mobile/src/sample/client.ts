// The one sample space the app runs on when it is not connected to anything: made when the
// app starts, gone when it closes. Only src/lib/database.ts reaches for this file, and only in
// a copy of the app that has no settings, so a real build leaves the sample out altogether.

import type { SupabaseClient } from "@supabase/supabase-js";

import { sampleAssetUri } from "./assets";
import { createBackend } from "./backend";
import { createWorld } from "./seed";
import { sampleSession } from "./session";

/** Answers take about as long as they do on a good connection, so screens wait the way they really do. */
const LATENCY_MS = 120;

const backend = createBackend({
  world: createWorld(Date.now()),
  who: () => sampleSession.person().id,
  assetUri: sampleAssetUri,
  latencyMs: LATENCY_MS,
});

/**
 * The sample backend, standing in for Supabase. It has the parts of the Supabase client the
 * app uses and no others: tests/sampleBackend.test.ts fails when the app starts using one it lacks.
 */
export const sampleClient = backend as unknown as SupabaseClient;

/** Floor's own server, in the sample space. */
export const sampleServer = backend.server;

/** The address of a logo kept in the sample space. */
export const sampleLogo = backend.logoAddress;
