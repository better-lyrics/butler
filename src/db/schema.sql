CREATE TABLE IF NOT EXISTS role_holdings (
  discord_id TEXT NOT NULL,
  guild_id   TEXT NOT NULL,
  tier       TEXT NOT NULL,
  granted_at BIGINT NOT NULL,
  PRIMARY KEY (discord_id, guild_id)
);
CREATE TABLE IF NOT EXISTS guild_config (
  guild_id            TEXT PRIMARY KEY,
  connect_channel_id  TEXT,
  report_channel_id   TEXT,
  announce_channel_id TEXT,
  mod_channel_id      TEXT,
  role_ids            JSONB NOT NULL DEFAULT '{}',
  tier_overrides      JSONB,
  council_role_id     TEXT,
  review_channel_id   TEXT,
  enabled             BOOLEAN NOT NULL DEFAULT FALSE
);
-- Migration for guild_config tables created before the on/off switch existed.
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT FALSE;
-- Migration for guild_config tables created before the council role existed.
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS council_role_id TEXT;
-- Migration for guild_config tables created before the review channel existed.
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS review_channel_id TEXT;
CREATE TABLE IF NOT EXISTS badge_holdings (
  discord_id TEXT NOT NULL,
  guild_id   TEXT NOT NULL,
  badge_key  TEXT NOT NULL,
  tier       INTEGER,
  awarded_at BIGINT,
  PRIMARY KEY (discord_id, guild_id, badge_key)
);
CREATE TABLE IF NOT EXISTS badge_seeded (
  discord_id TEXT NOT NULL,
  guild_id   TEXT NOT NULL,
  seeded_at  BIGINT,
  PRIMARY KEY (discord_id, guild_id)
);
