-- PostgreSQL Migration: 全テーブル作成
-- Vercel Postgres (Neon) 用。Cloudflare D1 (SQLite) からの移行。

-- ============================================================
-- 1. purchase テーブル（設計書 Section 6 準拠）
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase (
  purchase_id      VARCHAR(36) PRIMARY KEY,
  payment_id       VARCHAR(36) NOT NULL UNIQUE,
  status           VARCHAR(20) NOT NULL DEFAULT 'PAID'
                   CHECK (status IN ('PAID', 'GENERATED', 'FAILED')),
  view_token_hash  VARCHAR(64),
  prompt_input     TEXT,
  result_text      TEXT,
  result_image_url TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_status ON purchase(status);
CREATE INDEX IF NOT EXISTS idx_purchase_created_at ON purchase(created_at);

-- ============================================================
-- 2. line_session テーブル（設計書 Section 4 準拠）
-- ============================================================
CREATE TABLE IF NOT EXISTS line_session (
  line_user_id     VARCHAR(64) PRIMARY KEY,
  message_count    INTEGER NOT NULL DEFAULT 0,
  accumulated_text TEXT NOT NULL DEFAULT '',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. rate_limit テーブル（設計書 Section 8.3 準拠）
-- ============================================================
CREATE TABLE IF NOT EXISTS rate_limit (
  key              VARCHAR(255) PRIMARY KEY,
  count            INTEGER NOT NULL DEFAULT 1,
  window_start     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. sbps_pending テーブル（SBPS決済中間状態管理）
-- ============================================================
CREATE TABLE IF NOT EXISTS sbps_pending (
  order_id         VARCHAR(36) PRIMARY KEY,
  purchase_id      VARCHAR(36) NOT NULL UNIQUE,
  view_token_plain VARCHAR(64),
  status           VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  res_result       VARCHAR(10),
  res_err_code     VARCHAR(20),
  res_tracking_id  VARCHAR(64),
  pay_method       VARCHAR(32),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sbps_pending_purchase_id ON sbps_pending(purchase_id);
CREATE INDEX IF NOT EXISTS idx_sbps_pending_created_at ON sbps_pending(created_at);
CREATE INDEX IF NOT EXISTS idx_sbps_pending_status ON sbps_pending(status);
