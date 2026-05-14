#!/usr/bin/env bash
# Smoke-test the ai-service. Run AFTER `npm run dev` (or compose up).
#
# Usage:
#   bash scripts/smoke-test.sh
#   AI_SERVICE_URL=http://localhost:4001 INTERNAL_API_TOKEN=secret bash scripts/smoke-test.sh
set -euo pipefail

URL="${AI_SERVICE_URL:-http://localhost:4001}"
TOKEN="${INTERNAL_API_TOKEN:-}"

echo "==> GET ${URL}/health"
curl -fsS "${URL}/health" | tee /tmp/ai-health.json
echo

AUTH_HEADER=()
if [[ -n "${TOKEN}" ]]; then
  AUTH_HEADER=(-H "X-Internal-Token: ${TOKEN}")
fi

echo "==> POST ${URL}/internal/generate-announcement (status_report)"
curl -fsS "${AUTH_HEADER[@]}" \
  -H 'Content-Type: application/json' \
  "${URL}/internal/generate-announcement" \
  -d '{
    "type": "status_report",
    "context": {
      "timeRemainingSec": 1200,
      "violations": 2,
      "focusMinutes": 18,
      "state": "OPERATIONAL"
    }
  }' | tee /tmp/ai-announce.json
echo

echo "==> POST ${URL}/internal/analyze-behavior (synthetic events)"
curl -fsS "${AUTH_HEADER[@]}" \
  -H 'Content-Type: application/json' \
  "${URL}/internal/analyze-behavior" \
  -d '{
    "userId": "smoke-user",
    "windowDays": 7,
    "includeAiInsights": false,
    "events": [
      {"type":"focus_session_started","timestamp":"2026-05-15T09:00:00Z"},
      {"type":"focus_session_ended","timestamp":"2026-05-15T09:45:00Z"},
      {"type":"distraction_detected","timestamp":"2026-05-15T10:00:00Z","domain":"twitter.com"},
      {"type":"distraction_detected","timestamp":"2026-05-15T10:05:00Z","domain":"twitter.com"},
      {"type":"distraction_detected","timestamp":"2026-05-15T10:10:00Z","domain":"youtube.com"},
      {"type":"round_failed","timestamp":"2026-05-15T11:00:00Z"},
      {"type":"round_succeeded","timestamp":"2026-05-17T11:00:00Z"},
      {"type":"focus_session_started","timestamp":"2026-05-18T09:00:00Z"},
      {"type":"focus_session_ended","timestamp":"2026-05-18T10:00:00Z"},
      {"type":"round_succeeded","timestamp":"2026-05-18T11:00:00Z"}
    ]
  }' | tee /tmp/ai-analysis.json
echo

echo "Smoke test complete."
