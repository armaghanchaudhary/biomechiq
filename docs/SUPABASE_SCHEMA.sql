-- BiomechIQ — Supabase PostgreSQL Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query

-- ── SESSIONS ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sport           TEXT NOT NULL DEFAULT 'generic',
  duration_secs   INTEGER DEFAULT 0,
  peak_speed_kmh  NUMERIC(6,2) DEFAULT 0,
  avg_speed_kmh   NUMERIC(6,2) DEFAULT 0,
  form_score      INTEGER DEFAULT 0 CHECK (form_score BETWEEN 0 AND 100),
  throw_count     INTEGER DEFAULT 0,
  video_url       TEXT,
  thumbnail_url   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_sport ON sessions(sport);
CREATE INDEX idx_sessions_created_at ON sessions(created_at DESC);

-- ── SPEED EVENTS (timeseries) ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS speed_events (
  id              BIGSERIAL PRIMARY KEY,
  session_id      UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  timestamp_ms    BIGINT NOT NULL,
  speed_kmh       NUMERIC(6,2) NOT NULL,
  object_x        NUMERIC(6,4),
  object_y        NUMERIC(6,4)
);

CREATE INDEX idx_speed_events_session ON speed_events(session_id);

-- ── SESSION LANDMARKS (per-frame pose data) ────────────────────────────────

CREATE TABLE IF NOT EXISTS session_landmarks (
  id              BIGSERIAL PRIMARY KEY,
  session_id      UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  frame_ts        BIGINT NOT NULL,          -- ms since session start
  landmarks_json  JSONB NOT NULL            -- array of 33 {x,y,z,visibility}
);

CREATE INDEX idx_landmarks_session ON session_landmarks(session_id);
CREATE INDEX idx_landmarks_frame ON session_landmarks(session_id, frame_ts);

-- ── PERSONAL BESTS ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS personal_bests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sport           TEXT NOT NULL,
  metric          TEXT NOT NULL,            -- 'peak_speed', 'form_score', 'throw_count'
  value           NUMERIC(10,2) NOT NULL,
  session_id      UUID REFERENCES sessions(id) ON DELETE SET NULL,
  achieved_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, sport, metric)
);

CREATE INDEX idx_pb_user_sport ON personal_bests(user_id, sport);

-- ── GOALS ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS goals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sport           TEXT NOT NULL,
  metric          TEXT NOT NULL,
  target_value    NUMERIC(10,2) NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  achieved_at     TIMESTAMPTZ
);

-- ── USER PROFILES ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    TEXT,
  sport_focus     TEXT DEFAULT 'generic',
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── ROW LEVEL SECURITY ──────────────────────────────────────────────────────

ALTER TABLE sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE speed_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_landmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_bests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;

-- Sessions: users see only their own
CREATE POLICY "Own sessions only"
  ON sessions FOR ALL
  USING (auth.uid() = user_id);

-- Speed events: readable if you own the session
CREATE POLICY "Own speed events"
  ON speed_events FOR ALL
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE user_id = auth.uid()
    )
  );

-- Landmarks: same pattern
CREATE POLICY "Own landmarks"
  ON session_landmarks FOR ALL
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE user_id = auth.uid()
    )
  );

-- Personal bests
CREATE POLICY "Own personal bests"
  ON personal_bests FOR ALL
  USING (auth.uid() = user_id);

-- Goals
CREATE POLICY "Own goals"
  ON goals FOR ALL
  USING (auth.uid() = user_id);

-- Profiles: own profile full access, others read-only display_name + avatar
CREATE POLICY "Own profile full access"
  ON profiles FOR ALL
  USING (auth.uid() = id);

CREATE POLICY "Public profile read"
  ON profiles FOR SELECT
  USING (true);

-- ── STORAGE BUCKETS ─────────────────────────────────────────────────────────

-- Run in Supabase Dashboard → Storage → New Bucket
-- Name: session-videos
-- Public: false
-- File size limit: 500MB
-- Allowed MIME types: video/mp4, video/quicktime

-- Storage policy (add via Dashboard → Storage → Policies):
-- Allow authenticated users to upload to their own folder:
-- (storage.foldername(name))[1] = auth.uid()::text
