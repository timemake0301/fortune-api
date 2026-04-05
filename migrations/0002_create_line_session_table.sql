-- Migration: 0002_create_line_session_table
-- LINE無料占いセッションテーブル（設計書 Section 4 準拠）

CREATE TABLE IF NOT EXISTS line_session (
  line_user_id    TEXT PRIMARY KEY,
  message_count   INTEGER NOT NULL DEFAULT 0,
  accumulated_text TEXT NOT NULL DEFAULT '',
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
