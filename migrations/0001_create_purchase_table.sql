-- Migration: 0001_create_purchase_table
-- purchaseテーブル（設計書 Section 6 準拠）

CREATE TABLE IF NOT EXISTS purchase (
  purchase_id     TEXT PRIMARY KEY,
  payment_id      TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'PAID'
                  CHECK (status IN ('PAID', 'GENERATED', 'FAILED')),
  view_token_hash TEXT,
  prompt_input    TEXT,
  result_text     TEXT,
  result_image_url TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_purchase_status ON purchase(status);
CREATE INDEX IF NOT EXISTS idx_purchase_created_at ON purchase(created_at);
