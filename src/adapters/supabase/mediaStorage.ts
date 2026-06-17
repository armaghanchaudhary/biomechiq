// src/adapters/supabase/mediaStorage.ts
// MediaStorage adapter backed by the Supabase Storage `session-videos` bucket.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaStorage } from '@/ports';
import { supabaseClient } from './client';

const BUCKET = 'session-videos';

export class SupabaseMediaStorage implements MediaStorage {
  constructor(private readonly client: SupabaseClient = supabaseClient) {}

  async uploadVideo(
    localUri: string,
    userId: string,
    sessionId: string
  ): Promise<string | null> {
    try {
      const filename = `${userId}/${sessionId}/clip.mp4`;
      const response = await fetch(localUri);
      const blob = await response.blob();

      const { error } = await this.client.storage
        .from(BUCKET)
        .upload(filename, blob, {
          contentType: 'video/mp4',
          upsert: true,
        });

      if (error) return null;

      const { data } = this.client.storage.from(BUCKET).getPublicUrl(filename);
      return data.publicUrl;
    } catch (e) {
      console.error('Video upload error:', e);
      return null;
    }
  }
}
