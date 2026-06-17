// test/supabaseAuth.more.test.ts
// Additional SupabaseAuthProvider coverage for signInWithEmail and signOut,
// using an injected mock client.auth. Complements supabaseAdapters.test.ts
// (which covers getUser, signUp, onAuthStateChange).

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAuthProvider } from '@/adapters/supabase/authProvider';

const USER = { id: 'user-123', email: 'a@b.com', user_metadata: { display_name: 'Ari' } };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SupabaseAuthProvider.signInWithEmail', () => {
  it('calls signInWithPassword and maps the returned user to AuthUser', async () => {
    const signInWithPassword = vi
      .fn()
      .mockResolvedValue({ data: { user: USER }, error: null });
    const client = { auth: { signInWithPassword } } as unknown as SupabaseClient;

    const provider = new SupabaseAuthProvider(client);
    const user = await provider.signInWithEmail('a@b.com', 'pw');

    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'pw' });
    expect(user).toEqual({ id: 'user-123', email: 'a@b.com', displayName: 'Ari' });
  });

  it('returns null and logs when sign-in errors', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const signInWithPassword = vi
      .fn()
      .mockResolvedValue({ data: { user: null }, error: { message: 'bad creds' } });
    const client = { auth: { signInWithPassword } } as unknown as SupabaseClient;

    const provider = new SupabaseAuthProvider(client);
    const user = await provider.signInWithEmail('a@b.com', 'wrong');

    expect(user).toBeNull();
    expect(errSpy).toHaveBeenCalled();
  });

  it('returns a user with undefined displayName when metadata lacks display_name', async () => {
    const bareUser = { id: 'u-2', email: 'x@y.com', user_metadata: {} };
    const signInWithPassword = vi
      .fn()
      .mockResolvedValue({ data: { user: bareUser }, error: null });
    const client = { auth: { signInWithPassword } } as unknown as SupabaseClient;

    const provider = new SupabaseAuthProvider(client);
    const user = await provider.signInWithEmail('x@y.com', 'pw');

    expect(user).toEqual({ id: 'u-2', email: 'x@y.com', displayName: undefined });
  });
});

describe('SupabaseAuthProvider.signOut', () => {
  it('delegates to client.auth.signOut', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const client = { auth: { signOut } } as unknown as SupabaseClient;

    const provider = new SupabaseAuthProvider(client);
    await expect(provider.signOut()).resolves.toBeUndefined();
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
