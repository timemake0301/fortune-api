-- Migration: 0003_create_rate_limit_table
-- IPベースレート制限テーブル（設計書 Section 8.3 準拠）

CREATE TABLE IF NOT EXISTS rate_limit (
  key           TEXT PRIMARY KEY,
  count         INTEGER NOT NULL DEFAULT 1,
  window_start  TEXT NOT NULL DEFAULT (datetime('now'))
);
