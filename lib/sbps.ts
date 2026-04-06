// SBペイメントサービス リンク型決済ユーティリティ

import { webcrypto } from 'node:crypto';

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
  const hashBuffer = await webcrypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// --- 購入要求パラメータ組み立て ---
export async function buildPurchaseRequestParams(
  orderId: string,
  purchaseId: string,
): Promise<Record<string, string>> {
  const env = process.env;
  const merchantId = env.SBPS_MERCHANT_ID!;
  const serviceId = env.SBPS_SERVICE_ID!;
  const hashKey = env.SBPS_HASH_KEY!;
  const returnUrl = env.SBPS_RETURN_URL!;
  const pageconUrl = env.SBPS_PAGECON_URL!;

  const now = new Date();
  const requestDate = formatRequestDate(now);

  const params: Record<string, string> = {
    pay_method: '',
    merchant_id: merchantId,
    service_id: serviceId,
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
    success_url: returnUrl + '?result=ok&order_id=' + orderId,
    cancel_url: returnUrl + '?result=cancel',
    error_url: returnUrl + '?result=error',
    pagecon_url: pageconUrl,
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

  const hashcode = await generateSbpsHashcode(concatenated, hashKey);
  params.sps_hashcode = hashcode;

  return params;
}

// --- 結果CGIのハッシュ検証 ---
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
  return Buffer.from(str, 'utf-8').toString('base64');
}

// --- リクエスト日時フォーマット（YYYYMMDDHHmmss, JST） ---
// Vercel Serverless FunctionsもUTCで動作するため、+9時間してJSTに変換
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
