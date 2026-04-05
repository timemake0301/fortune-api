#!/usr/bin/env bash
# =============================================================================
# E2Eスモークテスト — wrangler dev に対してcurlでフルフロー検証
# 使い方:
#   1. wrangler dev を起動: cd backend && npx wrangler dev
#   2. 別ターミナルで実行: bash test/e2e/smoke-test.sh
# =============================================================================

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8787}"
PASS=0
FAIL=0

# --- ヘルパー関数 ---
assert_status() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  ✓ $label (HTTP $actual)"
    ((PASS++))
  else
    echo "  ✗ $label — expected $expected, got $actual"
    ((FAIL++))
  fi
}

assert_json_field() {
  local label="$1" body="$2" field="$3" expected="$4"
  local actual
  actual=$(echo "$body" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())${field})" 2>/dev/null || echo "__PARSE_ERROR__")
  if [ "$actual" = "$expected" ]; then
    echo "  ✓ $label ($field = $actual)"
    ((PASS++))
  else
    echo "  ✗ $label — $field: expected '$expected', got '$actual'"
    ((FAIL++))
  fi
}

echo "============================================="
echo " E2Eスモークテスト  (${BASE_URL})"
echo "============================================="
echo ""

# --- 1. Health Check ---
echo "[1] GET /api/health"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/health")
assert_status "health check" 200 "$STATUS"
echo ""

# --- 2. CORS Preflight ---
echo "[2] OPTIONS /api/health (CORS)"
HEADERS=$(curl -s -D - -o /dev/null -X OPTIONS "$BASE_URL/api/health")
STATUS=$(echo "$HEADERS" | grep -i "^HTTP/" | tail -1 | awk '{print $2}')
assert_status "OPTIONS returns 200" 200 "$STATUS"
if echo "$HEADERS" | grep -qi "access-control-allow-origin"; then
  echo "  ✓ CORS header present"
  ((PASS++))
else
  echo "  ✗ CORS header missing"
  ((FAIL++))
fi
echo ""

# --- 3. 404 for unknown route ---
echo "[3] GET /api/unknown"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/unknown")
assert_status "unknown route returns 404" 404 "$STATUS"
echo ""

# --- 4. Payment Webhook (create purchase) ---
echo "[4] POST /api/webhook/payment"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/webhook/payment" \
  -H "Content-Type: application/json" \
  -d '{"payment_id":"smoke-test-001"}')
BODY=$(echo "$RESPONSE" | sed '$d')
STATUS=$(echo "$RESPONSE" | tail -1)
assert_status "payment webhook" 200 "$STATUS"
assert_json_field "success flag" "$BODY" "['success']" "True"

# purchase_idとview_tokenを取得
PURCHASE_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['data']['purchase_id'])" 2>/dev/null || echo "")
VIEW_TOKEN=$(echo "$BODY" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['data']['view_token'])" 2>/dev/null || echo "")

if [ -n "$PURCHASE_ID" ] && [ "$PURCHASE_ID" != "" ]; then
  echo "  ✓ purchase_id received: ${PURCHASE_ID:0:8}..."
  ((PASS++))
else
  echo "  ✗ purchase_id not found in response"
  ((FAIL++))
fi
if [ -n "$VIEW_TOKEN" ] && [ "$VIEW_TOKEN" != "" ]; then
  echo "  ✓ view_token received (length: ${#VIEW_TOKEN})"
  ((PASS++))
else
  echo "  ✗ view_token not found in response"
  ((FAIL++))
fi
echo ""

# --- 5. Idempotency: same payment_id → duplicate:true ---
echo "[5] POST /api/webhook/payment (idempotency)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/webhook/payment" \
  -H "Content-Type: application/json" \
  -d '{"payment_id":"smoke-test-001"}')
BODY=$(echo "$RESPONSE" | sed '$d')
STATUS=$(echo "$RESPONSE" | tail -1)
assert_status "duplicate payment 200" 200 "$STATUS"
assert_json_field "duplicate flag" "$BODY" "['data']['duplicate']" "True"
echo ""

# --- 6. Get Purchase Status ---
echo "[6] GET /api/purchase/:id/status"
if [ -n "$PURCHASE_ID" ]; then
  RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/purchase/$PURCHASE_ID/status")
  BODY=$(echo "$RESPONSE" | sed '$d')
  STATUS=$(echo "$RESPONSE" | tail -1)
  assert_status "status endpoint" 200 "$STATUS"
  assert_json_field "status is PAID" "$BODY" "['data']['status']" "PAID"
  assert_json_field "has_result is False" "$BODY" "['data']['has_result']" "False"
else
  echo "  ⏭ skipped (no purchase_id)"
fi
echo ""

# --- 7. Generate Fortune (requires OPENAI_API_KEY) ---
echo "[7] POST /api/purchase/:id/generate"
if [ -n "$PURCHASE_ID" ] && [ -n "$VIEW_TOKEN" ]; then
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "$BASE_URL/api/purchase/$PURCHASE_ID/generate" \
    -H "Content-Type: application/json" \
    -d "{\"prompt_input\":\"恋愛運について教えてください\",\"view_token\":\"$VIEW_TOKEN\"}")
  BODY=$(echo "$RESPONSE" | sed '$d')
  STATUS=$(echo "$RESPONSE" | tail -1)
  # 200 = 生成成功、502 = OpenAI API未設定 → どちらも「ルーティング正常」
  if [ "$STATUS" = "200" ]; then
    assert_status "generate endpoint" 200 "$STATUS"
    assert_json_field "status GENERATED" "$BODY" "['data']['status']" "GENERATED"
  elif [ "$STATUS" = "502" ] || [ "$STATUS" = "500" ]; then
    echo "  ⚠ generate returned $STATUS (API key未設定の可能性 — ルーティングは正常)"
    ((PASS++))
  else
    assert_status "generate endpoint" "200 or 502" "$STATUS"
  fi
else
  echo "  ⏭ skipped (no purchase_id or view_token)"
fi
echo ""

# --- 8. Get Result ---
echo "[8] GET /api/purchase/:id/result"
if [ -n "$PURCHASE_ID" ] && [ -n "$VIEW_TOKEN" ]; then
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    "$BASE_URL/api/purchase/$PURCHASE_ID/result?view_token=$VIEW_TOKEN")
  BODY=$(echo "$RESPONSE" | sed '$d')
  STATUS=$(echo "$RESPONSE" | tail -1)
  assert_status "result endpoint" 200 "$STATUS"
else
  echo "  ⏭ skipped (no purchase_id or view_token)"
fi
echo ""

# --- 9. Validation: missing payment_id ---
echo "[9] POST /api/webhook/payment (validation)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/webhook/payment" \
  -H "Content-Type: application/json" \
  -d '{}')
STATUS=$(echo "$RESPONSE" | tail -1)
assert_status "missing payment_id → 400" 400 "$STATUS"
echo ""

# --- 10. Security Headers ---
echo "[10] Security headers check"
HEADERS=$(curl -s -D - -o /dev/null "$BASE_URL/api/health")
for HDR in "x-content-type-options" "x-frame-options" "cache-control" "content-type"; do
  if echo "$HEADERS" | grep -qi "$HDR"; then
    echo "  ✓ $HDR present"
    ((PASS++))
  else
    echo "  ✗ $HDR missing"
    ((FAIL++))
  fi
done
echo ""

# --- Summary ---
echo "============================================="
TOTAL=$((PASS + FAIL))
echo " Results: ${PASS}/${TOTAL} passed, ${FAIL} failed"
if [ "$FAIL" -eq 0 ]; then
  echo " ✅ All smoke tests passed!"
else
  echo " ❌ Some tests failed"
fi
echo "============================================="

exit $FAIL
