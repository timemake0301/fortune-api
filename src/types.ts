// ===== Environment bindings =====
export interface Env {
  DB: D1Database;
  ALLOWED_ORIGIN: string;
  PSP_SIGNING_KEY?: string;    // Phase 8 (legacy mock)
  OPENAI_API_KEY?: string;     // Phase 3
  GEMINI_API_KEY?: string;     // Phase 3 (NanoBanana = Gemini Image Generation)
  LINE_CHANNEL_SECRET?: string;       // Phase 4
  LINE_CHANNEL_ACCESS_TOKEN?: string; // Phase 4
  LP_URL?: string;                    // Phase 4: Landing page URL
  // Phase 8: SBペイメントサービス
  SBPS_MERCHANT_ID: string;
  SBPS_SERVICE_ID: string;
  SBPS_HASH_KEY: string;
  SBPS_API_URL: string;
  SBPS_RETURN_URL: string;
  SBPS_PAGECON_URL: string;
}

// ===== Purchase =====
export type PurchaseStatus = 'PAID' | 'GENERATED' | 'FAILED';

export interface PurchaseRow {
  purchase_id: string;
  payment_id: string;
  status: PurchaseStatus;
  view_token_hash: string | null;
  prompt_input: string | null;
  result_text: string | null;
  result_image_url: string | null;
  created_at: string;
  updated_at: string;
}

// ===== Request types =====
export interface WebhookPaymentRequest {
  payment_id: string;
  amount: number;
  signature: string;
}

export interface GenerateRequest {
  prompt_input: string;
  view_token: string;
}

// ===== LINE Bot =====
export const LINE_WEBHOOK_PATH = '/api/webhook/line';

export interface LineWebhookEvent {
  type: string;
  replyToken: string;
  source: { type: string; userId: string };
  message?: { type: string; text?: string };
}

export interface LineWebhookBody {
  events: LineWebhookEvent[];
}

export interface LineSessionRow {
  line_user_id: string;
  message_count: number;
  accumulated_text: string;
  updated_at: string;
}

// ===== Route patterns =====
export const WEBHOOK_PAYMENT_PATH = '/api/webhook/payment';
export const PAYMENT_START_PATH = '/api/payment/start';
export const SBPS_PAGECON_PATH = '/api/sbps/pagecon';
export const SBPS_RETURN_PATH = '/api/sbps/return';
export const PURCHASE_STATUS_REGEX = /^\/api\/purchase\/([^/]+)\/status$/;
export const PURCHASE_GENERATE_REGEX = /^\/api\/purchase\/([^/]+)\/generate$/;
export const PURCHASE_RESULT_REGEX = /^\/api\/purchase\/([^/]+)\/result$/;

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ===== Log events (設計書 Section 10) =====
export const LOG_EVENTS = {
  LP_VIEW: 'lp_view',
  CHECKOUT_STARTED: 'checkout_started',
  PAYMENT_WEBHOOK_RECEIVED: 'payment_webhook_received',
  FORTUNE_GENERATE_STARTED: 'fortune_generate_started',
  FORTUNE_GENERATE_SUCCEEDED: 'fortune_generate_succeeded',
  FORTUNE_GENERATE_FAILED: 'fortune_generate_failed',
  FREE_SET_COMPLETED: 'free_set_completed',
  LP_LINK_SHOWN: 'lp_link_shown',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  SBPS_PAYMENT_STARTED: 'sbps_payment_started',
  SBPS_RESULT_CGI_RECEIVED: 'sbps_result_cgi_received',
  SBPS_RESULT_CGI_VERIFIED: 'sbps_result_cgi_verified',
  SBPS_RETURN_REDIRECT: 'sbps_return_redirect',
} as const;
