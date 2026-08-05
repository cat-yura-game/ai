PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  telegram_id INTEGER PRIMARY KEY,
  display_name TEXT,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'go', 'pro', 'ultra')),
  plan_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_codes (
  code_hash TEXT PRIMARY KEY,
  telegram_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  telegram_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS web_usage (
  telegram_id INTEGER NOT NULL,
  period_key TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (telegram_id, period_key),
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_login_codes_telegram_expires
ON login_codes (telegram_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_sessions_telegram_expires
ON sessions (telegram_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_web_usage_period
ON web_usage (period_key);

PRAGMA optimize;
