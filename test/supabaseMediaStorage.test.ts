// test/supabaseMediaStorage.test.ts
// Unit tests for SupabaseMediaStorage.uploadVideo using an injected mock client
// and a mocked global fetch. Covers the success path (public URL returned) and
// the error paths (storage error -> null, fetch throwing -> null).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseMediaStorage } from '@/adapters/supabase/mediaStorage';

const BUCKET = 'session-videos';

function makeBlob(): Blob {
  // A minimal blob-like value; the adapter only forwards it to upload().
  return new Blob(['video-bytes'], { type: 'video/mp4' });
}

describe('SupabaseMediaStorage.uploadVideo', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uploads the blob under userId/sessionId/clip.mp4 and returns the public URL', async () => {
    const blob = makeBlob();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ blob: () => Promise.resolve(blob) } as unknown as Response);

    const upload = vi.fn().mockResolvedValue({ data: { path: 'p' }, error: null });
    const getPublicUrl = vi.fn().mockReturnValue({
      data: { publicUrl: 'https://cdn.example.com/session-videos/user-1/sess-9/clip.mp4' },
    });
    const from = vi.fn().mockReturnValue({ upload, getPublicUrl });

    const client = { storage: { from } } as unknown as SupabaseClient;
    const storage = new SupabaseMediaStorage(client);

    const url = await storage.uploadVideo('file:///tmp/clip.mp4', 'user-1', 'sess-9');

    expect(fetchMock).toHaveBeenCalledWith('file:///tmp/clip.mp4');
    expect(from).toHaveBeenCalledWith(BUCKET);
    expect(upload).toHaveBeenCalledWith('user-1/sess-9/clip.mp4', blob, {
      contentType: 'video/mp4',
      upsert: true,
    });
    expect(getPublicUrl).toHaveBeenCalledWith('user-1/sess-9/clip.mp4');
    expect(url).toBe('https://cdn.example.com/session-videos/user-1/sess-9/clip.mp4');
  });

  it('returns null when the storage upload returns an error (and does not fetch the URL)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      blob: () => Promise.resolve(makeBlob()),
    } as unknown as Response);

    const upload = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'bucket missing' } });
    const getPublicUrl = vi.fn();
    const from = vi.fn().mockReturnValue({ upload, getPublicUrl });

    const client = { storage: { from } } as unknown as SupabaseClient;
    const storage = new SupabaseMediaStorage(client);

    const url = await storage.uploadVideo('file:///tmp/clip.mp4', 'user-1', 'sess-9');

    expect(url).toBeNull();
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it('returns null when fetch throws, swallowing the error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    // Silence the adapter's console.error so the test output stays clean.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const upload = vi.fn();
    const from = vi.fn().mockReturnValue({ upload, getPublicUrl: vi.fn() });
    const client = { storage: { from } } as unknown as SupabaseClient;
    const storage = new SupabaseMediaStorage(client);

    const url = await storage.uploadVideo('file:///tmp/clip.mp4', 'user-1', 'sess-9');

    expect(url).toBeNull();
    expect(upload).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
  });
});
