// src/adapters/supabase/client.ts
// Shared Supabase client factory for the data adapters. The only module here that
// reaches for env vars; adapters receive an injected SupabaseClient so they stay
// testable with a mocked client.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export type { SupabaseClient };

/** Build a Supabase client with the app's standard auth + realtime config. */
export function createSupabaseClient(
  url: string = SUPABASE_URL,
  anonKey: string = SUPABASE_ANON_KEY
): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });
}

// Lazily-constructed singleton shared by the Supabase adapters at runtime.
// Deferred so merely importing an adapter never constructs a client (and never
// throws on missing env vars under test); the client is built on first access.
let _client: SupabaseClient | null = null;

/** The runtime singleton Supabase client, built on first access. */
export const supabaseClient: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    if (_client === null) _client = createSupabaseClient();
    return Reflect.get(_client as object, prop, receiver);
  },
});
