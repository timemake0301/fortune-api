// SBペイメントサービス リンク型決済ユーティリティ

import type { Env } from '../types';

// --- 購入要求パラメータの項目定義順（ハッシュ連結順） ---
const PURCHASE_REQUEST_FIELD_ORDER = [
  'pay_method',
  'merchant_id',
  'service_id',
  'cust_code',
  'sps_cust_no',
  'sps_payment_no',
  'order_id',
  'item_id',
  'pay_item_id',
  'item_name',
  'tax',
  'amount',
  'pay_type',
  'auto_charge_type',
  'service_type',
  'div_settele',
  'last_charge_month',
  'camp_type',
  'terminal_type',
  'success_url',
  'cancel_url',
  'error_url',
  'pagecon_url',
  'free1',
  'free2',
  'free3',
  'free_csv',
  'request_date',
  'limit_second',
] as const;

// --- SHA-1 ハッシュ生成 ---
export async function generateSbpsHashcode(
  concatenatedValues: string,
  hashKey: string,
): Promise<string> {
  const data = new TextEncoder().encode(concatenatedValues + hashKey);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// --- 購入要求パラメータ組み立て ---
export async function buildPurchaseRequestParams(
  env: Env,
  orderId: string,
  purchaseId: string,
): Promise<Record<string, string>> {
  const now = new Date();
  const requestDate = formatRequestDate(now);

  const params: Record<string, string> = {
    pay_method: '',
    merchant_id: env.SBPS_MERCHANT_ID,
    service_id: env.SBPS_SERVICE_ID,
    cust_code: orderId,
    sps_cust_no: '',
    sps_payment_no: '',
    order_id: orderId,
    item_id: 'fortune_001',
    pay_item_id: '',
    item_name: encodeBase64('タロット占い'),
    tax: '0',
    amount: '500',
    pay_type: '0',
    auto_charge_type: '',
    service_type: '0',
    div_settele: '',
    last_charge_month: '',
    camp_type: '',
    terminal_type: '0',
    success_url: env.SBPS_RETURN_URL + '?result=ok',
    cancel_url: env.SBPS_RETURN_URL + '?result=cancel',
    error_url: env.SBPS_RETURN_URL + '?result=error',
    pagecon_url: env.SBPS_PAGECON_URL,
    free1: orderId.substring(0, 20),
    free2: '',
    free3: '',
    free_csv: '',
    request_date: requestDate,
    limit_second: '600',
  };

  // 項目定義順にパラメータ値を連結（前後の半角スペースは削除）
  const concatenated = PURCHASE_REQUEST_FIELD_ORDER
    .map(key => (params[key] ?? '').trim())
    .join('');

  const hashcode = await generateSbpsHashcode(concatenated, env.SBPS_HASH_KEY);
  params.sps_hashcode = hashcode;

  return params;
}

// --- 結果CGIのハッシュ検証 ---
// 結果CGIのレスポンスパラメータのハッシュ検証
// 注: 結果CGIのハッシュはShift-JISベースだが、ASCII文字のみの場合はUTF-8と同一
// マルチバイト文字を含むフィールド（item_name, free1-3等）がある場合はShift-JIS変換が必要
export async function verifySbpsResultHash(
  params: Record<string, string>,
  fieldOrder: string[],
  hashKey: string,
): Promise<boolean> {
  const receivedHash = params.sps_hashcode;
  if (!receivedHash) return false;

  const concatenated = fieldOrder
    .map(key => (params[key] ?? '').trim())
    .join('');

  const expectedHash = await generateSbpsHashcode(concatenated, hashKey);

  // Constant-time comparison
  if (expectedHash.length !== receivedHash.length) return false;
  let result = 0;
  for (let i = 0; i < expectedHash.length; i++) {
    result |= expectedHash.charCodeAt(i) ^ receivedHash.charCodeAt(i);
  }
  return result === 0;
}

// --- application/x-www-form-urlencoded パース ---
export function parseFormUrlEncoded(body: string): Record<string, string> {
  const params: Record<string, string> = {};
  const pairs = body.split('&');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = decodeURIComponent(pair.substring(0, idx));
    const value = decodeURIComponent(pair.substring(idx + 1).replace(/\+/g, ' '));
    params[key] = value;
  }
  return params;
}

// --- Base64エンコード（マルチバイト文字対応） ---
export function encodeBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return btoa(String.fromCharCode(...bytes));
}

// --- リクエスト日時フォーマット（YYYYMMDDHHmmss, JST） ---
// Cloudflare WorkersはUTCで動作するため、+9時間してJSTに変換
function formatRequestDate(date: Date): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    jst.getUTCFullYear().toString() +
    pad(jst.getUTCMonth() + 1) +
    pad(jst.getUTCDate()) +
    pad(jst.getUTCHours()) +
    pad(jst.getUTCMinutes()) +
    pad(jst.getUTCSeconds())
  );
}
