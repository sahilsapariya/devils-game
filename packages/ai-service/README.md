# @extraction/ai-service

PROJECT EXTRACTION's AI microservice. Generates procedural operator
announcements, synthesizes voice via ElevenLabs (with Ollama TTS fallback),
and runs deterministic + AI-augmented behavioral analysis.

It is **internal-only** — the backend is the sole expected caller. All
endpoints under `/internal/*` are guarded by the `X-Internal-Token` header.

The service NEVER decides gameplay outcomes. It only produces text, audio,
and analytical output. The backend remains the authority on state, scoring,
and consequence.

---

## Architecture

```
backend ──► POST /internal/generate-announcement ─► ai-service
                                                     │
                                                     ├─► TextGen (Claude → Ollama fallback)
                                                     ├─► QualityGates (deterministic)
                                                     ├─► TTS (ElevenLabs → Ollama TTS → text-only)
                                                     └─► VoiceStorage (local cache, S3-pluggable)

backend ──► POST /internal/analyze-behavior ──────► ai-service
                                                     │
                                                     ├─► AnalyzerService (deterministic stats)
                                                     └─► TextGen (narrative insights, optional)
```

### Provider fallback chains

- **Text:** `USE_PROVIDER` (default `claude`) → other provider on timeout/error
- **TTS:** ElevenLabs → Ollama TTS (if `OLLAMA_TTS_MODEL` set) → `voiceUrl: null` (caller renders text-only)
- **Behavioral AI insights:** AnalyzerService falls back to deterministic
  insights if AI layer fails. Deterministic insights always present.

---

## Running locally

```bash
# from repo root
cp packages/ai-service/.env.example packages/ai-service/.env
# fill in ANTHROPIC_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, INTERNAL_API_TOKEN

npm install                                # workspace install
npm run dev --workspace=@extraction/ai-service
```

Default port: `4001`.

### Docker

```bash
# from repo root
docker build -f packages/ai-service/Dockerfile -t extraction-ai-service:local .
docker run --rm -p 4001:4001 --env-file packages/ai-service/.env extraction-ai-service:local
```

### Smoke test

```bash
INTERNAL_API_TOKEN=<token> bash packages/ai-service/scripts/smoke-test.sh
```

---

## Environment variables

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `PORT` | no | `4001` | HTTP port |
| `INTERNAL_API_TOKEN` | prod only | (unset) | Shared secret for `X-Internal-Token`. Unset → dev mode (warning logged). |
| `USE_PROVIDER` | no | `claude` | `claude` or `ollama` |
| `ANTHROPIC_API_KEY` | if Claude | — | Anthropic SDK key |
| `ANTHROPIC_MODEL` | no | `claude-haiku-4-5-20251001` | Cost/latency optimized |
| `ELEVENLABS_API_KEY` | if TTS | — | |
| `ELEVENLABS_VOICE_ID` | if TTS | — | See voice provisioning below |
| `ELEVENLABS_MODEL` | no | `eleven_turbo_v2_5` | |
| `OLLAMA_BASE_URL` | no | `http://localhost:11434` | |
| `OLLAMA_TEXT_MODEL` | no | `llama3.1:8b` | Local text fallback |
| `OLLAMA_TTS_MODEL` | no | — | Optional TTS fallback (custom endpoint, see `tts.service.ts`) |
| `VOICE_CACHE_DIR` | no | `./voice-cache` | Local MP3 cache |
| `VOICE_CACHE_TTL_HOURS` | no | `24` | Auto-eviction window |
| `VOICE_PUBLIC_BASE_URL` | no | — | If set, voice URLs use this base (e.g. CDN) |

### ElevenLabs voice provisioning

Pick or create a **calm, detached, procedural female voice** in the
ElevenLabs dashboard (the stock "Rachel" voice is a reasonable default).
Copy the voice's UUID into `ELEVENLABS_VOICE_ID`. Voice settings are tuned
in code at `src/modules/tts/elevenlabs.client.ts`:

```ts
{ stability: 0.6, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true }
```

---

## API

All `/internal/*` endpoints require `X-Internal-Token: <INTERNAL_API_TOKEN>`
unless the env var is unset (dev mode).

### `GET /health`

Returns liveness + provider status (30s-cached):

```json
{
  "ok": true,
  "service": "ai-service",
  "providers": { "claude": true, "ollama": false, "elevenlabs": true }
}
```

### `POST /internal/generate-announcement`

Body:

```json
{
  "type": "status_report",
  "context": {
    "timeRemainingSec": 1200,
    "violations": 2,
    "focusMinutes": 18,
    "state": "OPERATIONAL",
    "consecutiveFailures": 0,
    "recentPattern": "...",
    "recommendation": "...",
    "recoveryOpportunity": "..."
  },
  "toneGuidance": "optional extra tone hint",
  "skipVoice": false
}
```

Accepted `type`s: `status_report`, `pressure_escalation`,
`behavioral_analysis`, `recovery_offer`, `ambient_presence`,
`operational_update`.

Response:

```json
{
  "message": "...",
  "voiceUrl": "file:///app/voice-cache/<hash>.mp3" ,
  "durationSec": 6,
  "fallbackUsed": false,
  "providerUsed": "claude",
  "qualityReason": "..."        // present only when fallback was triggered by quality gates
}
```

- `fallbackUsed: true` → either AI generation failed or output did not pass quality gates; a static template was used.
- `voiceUrl: null` → TTS unavailable; caller should render text-only. **Not** counted as `fallbackUsed`.

### `POST /internal/analyze-behavior`

Body:

```json
{
  "userId": "user-123",
  "windowDays": 14,
  "includeAiInsights": true,
  "events": [
    { "type": "focus_session_started", "timestamp": "2026-05-15T09:00:00Z" },
    { "type": "focus_session_ended",   "timestamp": "2026-05-15T09:45:00Z" },
    { "type": "distraction_detected",  "timestamp": "2026-05-15T10:00:00Z", "domain": "twitter.com" }
  ]
}
```

Response:

```json
{
  "peakProductivityHours": [9, 10, 14],
  "commonDistractions": [
    { "domain": "twitter.com", "count": 12 }
  ],
  "avgFocusSessionMinutes": 38.4,
  "recoverySpeedDays": 1.5,
  "sustainableCeiling": 7,
  "insights": ["Peak productivity window observed at hour 9:00 UTC."],
  "meta": { "eventCount": 42, "windowDays": 14, "aiInsightsAttempted": true }
}
```

---

## Quality gates

`QualityGatesService` rejects any AI-generated message that:

- Is shorter than 5 characters or longer than 300
- Contains emojis (Unicode pictograph ranges)
- Contains markdown (`*`, `_`, `#`, bullet lists, fenced code)
- Contains banned phrases: "you can do it", "believe in yourself",
  "believe", "great job", "amazing", "awesome", "fantastic", "good luck",
  "sorry", "please", "yay/woohoo/hooray"

When rejected, the controller substitutes a template from
`FallbackTemplatesService` and sets `fallbackUsed: true`.

---

## Behavioral analysis algorithm

Deterministic pass first (always runs):

1. Hour-of-day histogram across all events → top 3 peak hours
2. Distraction event count grouped by domain → top 3
3. Pair `focus_session_started` / `focus_session_ended` events → average focus minutes
4. Pair `round_failed` / next `round_succeeded` → average recovery interval in days
5. Success rate (succeeded / total) mapped to 1–10 → `sustainableCeiling`

Optional AI pass (if 10+ events and `includeAiInsights: true`):

- Compact fact-sheet sent to Claude with a "no advice, no invention" prompt
- Output expected as `JSON array of 2–4 strings`
- Parsing failure → falls back to deterministic insights

---

## Known limitations

- ElevenLabs voice ID must be provisioned manually. Service will degrade to Ollama TTS → text-only without one.
- Voice cache is local filesystem only; production should mount persistent volume or implement an S3-backed `VoiceStorageService`.
- Ollama TTS endpoint shape varies by plugin; the default `POST /api/tts` call assumes a community TTS extension. Adjust `TtsService.synthesizeOllama` if your Ollama runtime differs.
- LRU announcement cache is in-memory; multi-replica deployments will not share it.
- `INTERNAL_API_TOKEN` is a shared-secret guard, not mTLS. Sufficient for an internal network; not for a public surface.

---

## Verification

```bash
cd packages/ai-service
npx tsc --noEmit
```
