// src/services/supabase.ts
// Supabase client + typed database operations

import { createClient } from '@supabase/supabase-js';
import { SessionSummary, SessionState, Sport } from '../models/types';

// ── Environment ─────────────────────────────────────────
// In production: set via EAS Secrets / .env
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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

// ── Auth ─────────────────────────────────────────────────

export const auth = {
  signInWithEmail: (email: string, password: string) =>
    supabase.auth.signInWithPassword({ email, password }),

  signUpWithEmail: (email: string, password: string, displayName: string) =>
    supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    }),

  signInWithGoogle: () =>
    supabase.auth.signInWithOAuth({ provider: 'google' }),

  signOut: () => supabase.auth.signOut(),

  getUser: () => supabase.auth.getUser(),

  onAuthStateChange: (cb: Parameters<typeof supabase.auth.onAuthStateChange>[0]) =>
    supabase.auth.onAuthStateChange(cb),
};

// ── Sessions ──────────────────────────────────────────────

export const sessions = {
  /**
   * Save a completed session to Supabase
   */
  saveSession: async (
    session: SessionState,
    videoUrl?: string,
    thumbnailUrl?: string
  ): Promise<{ id: string } | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('sessions')
      .insert({
        user_id: user.id,
        sport: session.sport,
        duration_secs: session.duration,
        peak_speed_kmh: session.peakSpeed,
        avg_speed_kmh: session.avgSpeed,
        form_score: session.formScore,
        throw_count: session.throwCount,
        video_url: videoUrl ?? null,
        thumbnail_url: thumbnailUrl ?? null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error saving session:', error);
      return null;
    }

    // Save speed events asynchronously (fire and forget)
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

      supabase.from('speed_events').insert(events).then(({ error: e }) => {
        if (e) console.error('Error saving speed events:', e);
      });
    }

    return data;
  },

  /**
   * Get recent sessions for current user
   */
  getRecentSessions: async (sport?: Sport, limit = 20): Promise<SessionSummary[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    let query = supabase
      .from('sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (sport) query = query.eq('sport', sport);

    const { data, error } = await query;
    if (error) return [];
    return (data ?? []) as SessionSummary[];
  },

  /**
   * Get personal bests for a user
   */
  getPersonalBests: async (sport?: Sport) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    let query = supabase
      .from('personal_bests')
      .select('*, sessions(created_at)')
      .eq('user_id', user.id);

    if (sport) query = query.eq('sport', sport);

    const { data } = await query;
    return data ?? [];
  },

  /**
   * Update personal best if new value beats old
   */
  maybeUpdatePersonalBest: async (
    sport: Sport,
    metric: string,
    value: number,
    sessionId: string
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: existing } = await supabase
      .from('personal_bests')
      .select('id, value')
      .eq('user_id', user.id)
      .eq('sport', sport)
      .eq('metric', metric)
      .single();

    if (!existing || value > (existing.value ?? 0)) {
      await supabase.from('personal_bests').upsert({
        user_id: user.id,
        sport,
        metric,
        value,
        session_id: sessionId,
        achieved_at: new Date().toISOString(),
      });
    }
  },
};

// ── Video Storage ─────────────────────────────────────────

export const storage = {
  uploadVideoClip: async (
    localUri: string,
    userId: string,
    sessionId: string
  ): Promise<string | null> => {
    try {
      const filename = `${userId}/${sessionId}/clip.mp4`;
      const response = await fetch(localUri);
      const blob = await response.blob();

      const { error } = await supabase.storage
        .from('session-videos')
        .upload(filename, blob, {
          contentType: 'video/mp4',
          upsert: true,
        });

      if (error) return null;

      const { data } = supabase.storage
        .from('session-videos')
        .getPublicUrl(filename);

      return data.publicUrl;
    } catch (e) {
      console.error('Video upload error:', e);
      return null;
    }
  },
};

// ── SQL Schema (run in Supabase Dashboard > SQL Editor) ───
//
// CREATE TABLE sessions (
//   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   user_id UUID REFERENCES auth.users NOT NULL,
//   sport TEXT NOT NULL DEFAULT 'generic',
//   duration_secs INTEGER DEFAULT 0,
//   peak_speed_kmh NUMERIC(6,2) DEFAULT 0,
//   avg_speed_kmh NUMERIC(6,2) DEFAULT 0,
//   form_score INTEGER DEFAULT 0,
//   throw_count INTEGER DEFAULT 0,
//   video_url TEXT,
//   thumbnail_url TEXT,
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );
//
// CREATE TABLE speed_events (
//   id BIGSERIAL PRIMARY KEY,
//   session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
//   timestamp_ms BIGINT,
//   speed_kmh NUMERIC(6,2),
//   object_x NUMERIC(6,4),
//   object_y NUMERIC(6,4)
// );
//
// CREATE TABLE personal_bests (
//   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   user_id UUID REFERENCES auth.users NOT NULL,
//   sport TEXT NOT NULL,
//   metric TEXT NOT NULL,
//   value NUMERIC(10,2),
//   session_id UUID REFERENCES sessions(id),
//   achieved_at TIMESTAMPTZ DEFAULT NOW(),
//   UNIQUE(user_id, sport, metric)
// );
//
// -- Row Level Security
// ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "Users can only see own sessions"
//   ON sessions FOR ALL USING (auth.uid() = user_id);
