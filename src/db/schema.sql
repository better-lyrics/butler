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
  review_last_posted_at BIGINT,
  exam_min_role_id    TEXT,
  enabled             BOOLEAN NOT NULL DEFAULT FALSE
);
-- Migration for guild_config tables created before the on/off switch existed.
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT FALSE;
-- Migration for guild_config tables created before the council role existed.
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS council_role_id TEXT;
-- Migration for guild_config tables created before the review channel existed.
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS review_channel_id TEXT;
-- Migration for guild_config tables created before the review digest schedule existed.
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS review_last_posted_at BIGINT;
-- Migration for guild_config tables created before the exam minimum role existed.
ALTER TABLE guild_config ADD COLUMN IF NOT EXISTS exam_min_role_id TEXT;
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
CREATE TABLE IF NOT EXISTS review_board_card (
  guild_id   TEXT NOT NULL,
  lyric_id   TEXT NOT NULL,
  message_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  position   INTEGER NOT NULL,
  state      TEXT NOT NULL DEFAULT 'pending',
  actor_id   TEXT,
  note       TEXT,
  entry      JSONB NOT NULL,
  PRIMARY KEY (guild_id, lyric_id)
);
CREATE TABLE IF NOT EXISTS exam_applicant_post (
  guild_id     TEXT NOT NULL,
  applicant_id TEXT NOT NULL,
  message_id   TEXT NOT NULL,
  channel_id   TEXT NOT NULL,
  posted_at    BIGINT NOT NULL,
  PRIMARY KEY (guild_id, applicant_id)
);
CREATE TABLE IF NOT EXISTS revision_board_card (
  guild_id    TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  message_id  TEXT NOT NULL,
  channel_id  TEXT NOT NULL,
  state       TEXT NOT NULL DEFAULT 'pending',
  actor_id    TEXT,
  note        TEXT,
  card        JSONB NOT NULL,
  PRIMARY KEY (guild_id, revision_id)
);
CREATE TABLE IF NOT EXISTS avatar_suggestion (
  id                  TEXT PRIMARY KEY,
  guild_id            TEXT NOT NULL,
  proposed_id         TEXT NOT NULL,
  label               TEXT NOT NULL,
  image_base64        TEXT NOT NULL,
  mime                TEXT NOT NULL,
  proposer_discord_id TEXT NOT NULL,
  proposer_key_id     TEXT,
  card_channel_id     TEXT,
  card_message_id     TEXT,
  state               TEXT NOT NULL DEFAULT 'pending',
  created_at          BIGINT NOT NULL,
  decided_by          TEXT,
  decided_at          BIGINT
);
