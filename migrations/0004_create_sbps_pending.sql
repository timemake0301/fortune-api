-- SBPS決済の中間状態を管理するテーブル
-- 決済開始(order_id発行)〜結果CGI受信(purchase作成)の間の対応を保持
-- 結果画面返却時にview_tokenの平文が必要なため一時保存
-- 失敗時のエラー情報もここに記録する
CREATE TABLE IF NOT EXISTS sbps_pending (
  order_id         TEXT PRIMARY KEY,
  purchase_id      TEXT NOT NULL UNIQUE,
  view_token_plain TEXT,
  status           TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  res_result       TEXT,              -- SBPSの処理結果（OK/NG/PY/CN）
  res_err_code     TEXT,              -- SBPSのエラーコード
  res_tracking_id  TEXT,              -- SBPSの取引追跡ID
  pay_method       TEXT,              -- 使用された決済手段
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sbps_pending_purchase_id ON sbps_pending(purchase_id);
CREATE INDEX IF NOT EXISTS idx_sbps_pending_created_at ON sbps_pending(created_at);
CREATE INDEX IF NOT EXISTS idx_sbps_pending_status ON sbps_pending(status);
