// src/adapters/supabase/sessionRepository.ts
// SessionRepository adapter backed by Supabase Postgres. Preserves the table and
// column mapping (snake_case) from the legacy src/services/supabase.ts while
// exposing the camelCase domain SessionSummary across the port boundary.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionState, SessionSummary, Sport } from '@/domain';
import type { SaveSessionMedia, SessionRepository } from '@/ports';
import { supabaseClient } from './client';

/** Raw `sessions` table row shape (snake_case as stored in Postgres). */
interface SessionRow {
  id: string;
  user_id: string;
  sport: Sport;
  created_at: string;
  duration_secs: number;
  peak_speed_kmh: number;
  avg_speed_kmh: number;
  form_score: number;
  throw_count: number;
  video_url?: string | null;
  thumbnail_url?: string | null;
}

function toSummary(row: SessionRow): SessionSummary {
  return {
    id: row.id,
    userId: row.user_id,
    sport: row.sport,
    createdAt: row.created_at,
    durationSecs: row.duration_secs ?? 0,
    peakSpeedKmh: row.peak_speed_kmh ?? 0,
    avgSpeedKmh: row.avg_speed_kmh ?? 0,
    formScore: row.form_score ?? 0,
    throwCount: row.throw_count ?? 0,
    videoUrl: row.video_url ?? undefined,
    thumbnailUrl: row.thumbnail_url ?? undefined,
  };
}

export class SupabaseSessionRepository implements SessionRepository {
  constructor(private readonly client: SupabaseClient = supabaseClient) {}

  async save(
    session: SessionState,
    media?: SaveSessionMedia
  ): Promise<{ id: string } | null> {
    const {
      data: { user },
    } = await this.client.auth.getUser();
    if (!user) return null;

    const { data, error } = await this.client
      .from('sessions')
      .insert({
        user_id: user.id,
        sport: session.sport,
        duration_secs: session.duration,
        peak_speed_kmh: session.peakSpeed,
        avg_speed_kmh: session.avgSpeed,
        form_score: session.formScore,
        throw_count: session.throwCount,
        video_url: media?.videoUrl ?? null,
        thumbnail_url: media?.thumbnailUrl ?? null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error saving session:', error);
      return null;
    }

    // Persist speed events (fire and forget). Only meaningful readings (>5 km/h).
    if (session.speedSamples.length > 0 && data?.id) {
      const events = session.speedSamples
        .filter((s) => s.speedKmh > 5)
        .map((s) => ({
          session_id: data.id,
          timestamp_ms: s.timestamp,
          speed_kmh: s.speedKmh,
          object_x: s.objectX,
          object_y: s.objectY,
        }));

      if (events.length > 0) {
        void this.client
          .from('speed_events')
          .insert(events)
          .then(({ error: e }) => {
            if (e) console.error('Error saving speed events:', e);
          });
      }
    }

    return data ? { id: data.id } : null;
  }

  async getRecent(sport?: Sport, limit = 20): Promise<SessionSummary[]> {
    const {
      data: { user },
    } = await this.client.auth.getUser();
    if (!user) return [];

    let query = this.client
      .from('sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (sport) query = query.eq('sport', sport);

    const { data, error } = await query;
    if (error) return [];
    return ((data ?? []) as SessionRow[]).map(toSummary);
  }

  async getById(id: string): Promise<SessionSummary | null> {
    const {
      data: { user },
    } = await this.client.auth.getUser();
    if (!user) return null;

    const { data, error } = await this.client
      .from('sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('id', id)
      .single();

    if (error || !data) return null;
    return toSummary(data as SessionRow);
  }
}
