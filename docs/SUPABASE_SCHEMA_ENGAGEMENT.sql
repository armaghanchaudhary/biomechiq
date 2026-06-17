-- BiomechIQ — Engagement Layer PostgreSQL Schema
-- Run this AFTER docs/SUPABASE_SCHEMA.sql, in:
--   Supabase Dashboard → SQL Editor → New Query
--
-- This file adds the engagement persistence layer:
--   * goals             — user-defined targets (richer than the base goals table)
--   * streaks           — materialised streak state per user + sport + cadence
--   * achievements       — awarded badges (one row per user per achievement)
--   * leaderboard_entries — segmented competitive rankings
--
-- NOTE: the base schema already declares a minimal `goals` table. To avoid a
-- collision we name the engagement-layer goals table `engagement_goals`. If you
-- intend to consolidate, migrate the base `goals` rows into `engagement_goals`
-- and drop the old table — they are intentionally kept separate here so this
-- file is additive and safe to run on an existing database.

-- ── ENGAGEMENT GOALS ────────────────────────────────────────────────────────
-- One row per active/completed goal. Mirrors src/domain/services/goals.ts.

CREATE TABLE IF NOT EXISTS engagement_goals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sport           TEXT NOT NULL DEFAULT 'generic',
  metric          TEXT NOT NULL,            -- 'peakSpeedKmh' | 'formScore' | ...
  target_value    NUMERIC(10,2) NOT NULL,
  -- direction the metric must move to satisfy the goal.
  comparator      TEXT NOT NULL DEFAULT 'gte'
                    CHECK (comparator IN ('gte', 'lte')),
  baseline_value  NUMERIC(10,2),            -- value at goal creation (for progress %)
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'achieved', 'archived')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  achieved_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_engagement_goals_user
  ON engagement_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_engagement_goals_user_status
  ON engagement_goals(user_id, status);

-- ── STREAKS ─────────────────────────────────────────────────────────────────
-- Materialised streak state. The streak is *computed* from session timestamps by
-- src/domain/services/streaks.ts; this table caches the latest result so the UI
-- and notifications can read it without replaying every session.
-- One row per (user, sport, cadence).

CREATE TABLE IF NOT EXISTS streaks (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sport              TEXT NOT NULL DEFAULT 'generic',
  cadence            TEXT NOT NULL DEFAULT 'daily'
                       CHECK (cadence IN ('daily', 'weekly', 'custom')),
  window_days        INTEGER NOT NULL DEFAULT 1 CHECK (window_days > 0),
  grace_days         INTEGER NOT NULL DEFAULT 0 CHECK (grace_days >= 0),
  current_count      INTEGER NOT NULL DEFAULT 0 CHECK (current_count >= 0),
  longest_count      INTEGER NOT NULL DEFAULT 0 CHECK (longest_count >= 0),
  last_active_day    INTEGER,               -- UTC day-index of most recent session
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, sport, cadence)
);

CREATE INDEX IF NOT EXISTS idx_streaks_user ON streaks(user_id);

-- ── ACHIEVEMENTS (awarded) ──────────────────────────────────────────────────
-- One row per user per awarded achievement. The catalog of achievement
-- definitions lives in code (DEFAULT_ACHIEVEMENTS); this table records only
-- which have been *unlocked*. The unique constraint makes awarding idempotent.

CREATE TABLE IF NOT EXISTS achievements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  achievement_id  TEXT NOT NULL,            -- matches DEFAULT_ACHIEVEMENTS[].id
  sport           TEXT,                     -- nullable: some achievements are cross-sport
  awarded_value   NUMERIC(10,2),            -- the value that triggered the award
  session_id      UUID REFERENCES sessions(id) ON DELETE SET NULL,
  awarded_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(user_id);

-- ── LEADERBOARD ENTRIES ─────────────────────────────────────────────────────
-- A denormalised, append/upsert table that powers *segmented* leaderboards.
-- Each row is one athlete's best value for a (sport × metric × period) within a
-- segment defined by skill_level + region_bucket + age_bucket.
--
-- Segmentation philosophy: we deliberately avoid a single global table. A 14yo
-- beginner in one region competes in their own arena, not against pro adults
-- globally — this keeps leaderboards *achievable* and motivating. The domain
-- service src/domain/services/leaderboard.ts performs the in-memory ranking /
-- segmentation; this table is just the persistence + the query surface.

CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  display_name    TEXT,                     -- denormalised for fast read; refreshed on write
  sport           TEXT NOT NULL DEFAULT 'generic',
  metric          TEXT NOT NULL,            -- 'peakSpeedKmh' | 'formScore' | ...
  value           NUMERIC(10,2) NOT NULL,
  -- Segment dimensions. Bucketed (not raw age / lat-long) so arenas are coarse
  -- enough to be populated but fine enough to be fair.
  skill_level     TEXT NOT NULL DEFAULT 'beginner'
                    CHECK (skill_level IN ('beginner', 'intermediate', 'advanced', 'pro')),
  region_bucket   TEXT NOT NULL DEFAULT 'global',  -- e.g. 'na', 'eu', 'apac' or country code
  age_bucket      TEXT NOT NULL DEFAULT 'all',      -- e.g. 'u13', 'u16', 'u18', '18-29', '30+'
  -- Time partition the value belongs to. Lets us keep weekly / monthly / all-time
  -- boards side by side without a separate table per period.
  period          TEXT NOT NULL DEFAULT 'all_time'
                    CHECK (period IN ('daily', 'weekly', 'monthly', 'all_time')),
  period_key      TEXT NOT NULL DEFAULT 'all_time', -- e.g. '2026-W24', '2026-06', 'all_time'
  achieved_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  -- One best-value row per athlete per fully-qualified segment + period bucket.
  UNIQUE(user_id, sport, metric, skill_level, region_bucket, age_bucket, period, period_key)
);

-- Composite index aligned to the canonical segmented query (see design note).
CREATE INDEX IF NOT EXISTS idx_leaderboard_segment
  ON leaderboard_entries (
    sport, metric, skill_level, region_bucket, age_bucket, period, period_key, value DESC
  );
CREATE INDEX IF NOT EXISTS idx_leaderboard_user
  ON leaderboard_entries(user_id);

-- ── DESIGN NOTE: SEGMENTED-LEADERBOARD QUERIES ──────────────────────────────
--
-- The canonical read is "give me the top N of MY arena, plus where I rank".
-- An arena is the full tuple (sport × metric × skill_level × region × age ×
-- period). The idx_leaderboard_segment index is column-ordered to match this
-- exact predicate so the top-N read is an index range scan, value DESC.
--
--   -- Top 50 of a specific arena:
--   SELECT user_id, display_name, value,
--          RANK() OVER (ORDER BY value DESC) AS rank
--     FROM leaderboard_entries
--    WHERE sport = $1 AND metric = $2
--      AND skill_level = $3 AND region_bucket = $4 AND age_bucket = $5
--      AND period = $6 AND period_key = $7
--    ORDER BY value DESC
--    LIMIT 50;
--
--   -- The current user's dense rank within that same arena (1-based):
--   SELECT 1 + COUNT(*) AS rank
--     FROM leaderboard_entries
--    WHERE sport = $1 AND metric = $2
--      AND skill_level = $3 AND region_bucket = $4 AND age_bucket = $5
--      AND period = $6 AND period_key = $7
--      AND value > (SELECT value FROM leaderboard_entries
--                    WHERE user_id = $8 AND sport = $1 AND metric = $2
--                      AND skill_level = $3 AND region_bucket = $4
--                      AND age_bucket = $5 AND period = $6 AND period_key = $7);
--
-- Coarser arenas (e.g. "all regions", "all ages") are served by writing the
-- aggregate rows with region_bucket='global' / age_bucket='all' at ingest time,
-- OR by relaxing those predicates in the query. We prefer materialising the
-- 'global'/'all' buckets so every arena is a clean equality scan on the index.
--
-- The ranking arithmetic (ties, the user's rank, "achievable arena" selection)
-- is mirrored exactly by src/domain/services/leaderboard.ts so the same rules
-- apply whether ranking happens in SQL or in-memory (offline / preview).

-- ── ROW LEVEL SECURITY ──────────────────────────────────────────────────────

ALTER TABLE engagement_goals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_entries ENABLE ROW LEVEL SECURITY;

-- Goals: private to the owner.
CREATE POLICY "Own engagement goals"
  ON engagement_goals FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Streaks: private to the owner.
CREATE POLICY "Own streaks"
  ON streaks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Achievements: private to the owner.
CREATE POLICY "Own achievements"
  ON achievements FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Leaderboard entries are competitive: every authenticated user may READ all
-- entries (that is the point of a leaderboard), but may only INSERT / UPDATE /
-- DELETE their own row. Splitting the policies enforces "read public, write own"
-- so a user can never forge another athlete's score.
CREATE POLICY "Leaderboard public read"
  ON leaderboard_entries FOR SELECT
  USING (true);

CREATE POLICY "Leaderboard own insert"
  ON leaderboard_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Leaderboard own update"
  ON leaderboard_entries FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Leaderboard own delete"
  ON leaderboard_entries FOR DELETE
  USING (auth.uid() = user_id);
