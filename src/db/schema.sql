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
  enabled             BOOLEAN NOT NULL DEFAULT FALSE
);
