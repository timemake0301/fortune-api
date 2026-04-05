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

// ===== Validation =====
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
