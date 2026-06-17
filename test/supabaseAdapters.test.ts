// test/supabaseAdapters.test.ts
// Unit tests for the Supabase data adapters using an injected mock client.

import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionState } from '@/domain';
import { SupabaseSessionRepository } from '@/adapters/supabase/sessionRepository';
import { SupabaseAuthProvider } from '@/adapters/supabase/authProvider';

const USER = { id: 'user-123', email: 'a@b.com', user_metadata: { display_name: 'Ari' } };

function makeSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    id: 'sess-1',
    status: 'complete',
    sport: 'tennis',
    startedAt: 0,
    duration: 42,
    peakSpeed: 130.5,
    avgSpeed: 88.2,
    throwCount: 7,
    formScore: 91,
    speedSamples: [
      { timestamp: 10, speedKmh: 120, objectX: 0.5, objectY: 0.4 },
      { timestamp: 20, speedKmh: 3, objectX: 0.5, objectY: 0.4 }, // filtered out (<5)
    ],
    landmarks: null,
    ...overrides,
  };
}

describe('SupabaseSessionRepository.save', () => {
  it('inserts the correct snake_case row shape and returns the new id', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const sessionInsert = vi.fn().mockReturnValue({ select });
    const speedInsert = vi.fn().mockReturnValue({ then: (cb: any) => cb({ error: null }) });

    const from = vi.fn((table: string) => {
      if (table === 'sessions') return { insert: sessionInsert };
      if (table === 'speed_events') return { insert: speedInsert };
      throw new Error(`unexpected table ${table}`);
    });

    const client = {
      from,
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: USER } }) },
    } as unknown as SupabaseClient;

    const repo = new SupabaseSessionRepository(client);
    const result = await repo.save(makeSession(), { videoUrl: 'http://v', thumbnailUrl: 'http://t' });

    expect(result).toEqual({ id: 'new-id' });
    expect(from).toHaveBeenCalledWith('sessions');
    expect(sessionInsert).toHaveBeenCalledWith({
      user_id: 'user-123',
      sport: 'tennis',
      duration_secs: 42,
      peak_speed_kmh: 130.5,
      avg_speed_kmh: 88.2,
      form_score: 91,
      throw_count: 7,
      video_url: 'http://v',
      thumbnail_url: 'http://t',
    });

    // speed_events: only the >5 km/h sample is persisted, mapped to snake_case.
    expect(from).toHaveBeenCalledWith('speed_events');
    expect(speedInsert).toHaveBeenCalledWith([
      { session_id: 'new-id', timestamp_ms: 10, speed_kmh: 120, object_x: 0.5, object_y: 0.4 },
    ]);
  });

  it('returns null when there is no signed-in user', async () => {
    const from = vi.fn();
    const client = {
      from,
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as unknown as SupabaseClient;

    const repo = new SupabaseSessionRepository(client);
    const result = await repo.save(makeSession());

    expect(result).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
});

describe('SupabaseSessionRepository.getRecent', () => {
  it('filters by user id and sport, and maps rows to camelCase SessionSummary', async () => {
    const rows = [
      {
        id: 's1',
        user_id: 'user-123',
        sport: 'tennis',
        created_at: '2026-01-01T00:00:00Z',
        duration_secs: 30,
        peak_speed_kmh: 100,
        avg_speed_kmh: 70,
        form_score: 80,
        throw_count: 5,
        video_url: 'http://v',
        thumbnail_url: null,
      },
    ];

    // Chainable query builder; capture eq() calls to assert filters.
    const eqCalls: Array<[string, unknown]> = [];
    const builder: any = {
      select: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      eq: vi.fn((col: string, val: unknown) => {
        eqCalls.push([col, val]);
        return builder;
      }),
      then: (resolve: any) => resolve({ data: rows, error: null }),
    };

    const from = vi.fn().mockReturnValue(builder);
    const client = {
      from,
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: USER } }) },
    } as unknown as SupabaseClient;

    const repo = new SupabaseSessionRepository(client);
    const result = await repo.getRecent('tennis', 10);

    expect(from).toHaveBeenCalledWith('sessions');
    expect(eqCalls).toContainEqual(['user_id', 'user-123']);
    expect(eqCalls).toContainEqual(['sport', 'tennis']);
    expect(builder.limit).toHaveBeenCalledWith(10);

    expect(result).toEqual([
      {
        id: 's1',
        userId: 'user-123',
        sport: 'tennis',
        createdAt: '2026-01-01T00:00:00Z',
        durationSecs: 30,
        peakSpeedKmh: 100,
        avgSpeedKmh: 70,
        formScore: 80,
        throwCount: 5,
        videoUrl: 'http://v',
        thumbnailUrl: undefined,
      },
    ]);
  });

  it('does not apply a sport filter when sport is omitted', async () => {
    const eqCalls: Array<[string, unknown]> = [];
    const builder: any = {
      select: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      eq: vi.fn((col: string, val: unknown) => {
        eqCalls.push([col, val]);
        return builder;
      }),
      then: (resolve: any) => resolve({ data: [], error: null }),
    };

    const client = {
      from: vi.fn().mockReturnValue(builder),
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: USER } }) },
    } as unknown as SupabaseClient;

    const repo = new SupabaseSessionRepository(client);
    await repo.getRecent();

    expect(eqCalls).toContainEqual(['user_id', 'user-123']);
    expect(eqCalls.some(([col]) => col === 'sport')).toBe(false);
  });
});

describe('SupabaseAuthProvider', () => {
  it('maps the Supabase user to AuthUser including displayName from metadata', async () => {
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: USER } }) },
    } as unknown as SupabaseClient;

    const provider = new SupabaseAuthProvider(client);
    const user = await provider.getUser();

    expect(user).toEqual({ id: 'user-123', email: 'a@b.com', displayName: 'Ari' });
  });

  it('returns null when no user is signed in', async () => {
    const client = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as unknown as SupabaseClient;

    const provider = new SupabaseAuthProvider(client);
    expect(await provider.getUser()).toBeNull();
  });

  it('passes display_name through metadata on signUp', async () => {
    const signUp = vi.fn().mockResolvedValue({ data: { user: USER }, error: null });
    const client = { auth: { signUp } } as unknown as SupabaseClient;

    const provider = new SupabaseAuthProvider(client);
    const user = await provider.signUp('a@b.com', 'pw', 'Ari');

    expect(signUp).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'pw',
      options: { data: { display_name: 'Ari' } },
    });
    expect(user).toEqual({ id: 'user-123', email: 'a@b.com', displayName: 'Ari' });
  });

  it('onAuthStateChange returns an unsubscribe and forwards mapped users', () => {
    const unsubscribe = vi.fn();
    let registered: (e: string, s: any) => void = () => {};
    const onAuthStateChange = vi.fn((cb: any) => {
      registered = cb;
      return { data: { subscription: { unsubscribe } } };
    });
    const client = { auth: { onAuthStateChange } } as unknown as SupabaseClient;

    const provider = new SupabaseAuthProvider(client);
    const received: unknown[] = [];
    const unsub = provider.onAuthStateChange((u) => received.push(u));

    registered('SIGNED_IN', { user: USER });
    expect(received[0]).toEqual({ id: 'user-123', email: 'a@b.com', displayName: 'Ari' });

    unsub();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
