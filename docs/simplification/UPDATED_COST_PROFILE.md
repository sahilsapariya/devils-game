# UPDATED COST PROFILE

Realistic monthly costs for the simplified single-user / self-hosted architecture.

---

## TL;DR

**Local development:** $0/month.
**Self-hosted personal operation:** **$6-15/month** all-in.

The original SaaS-style $200-700/month figure no longer applies. We are running a single-operator system on a $5 VPS with one cheap AI API.

---

## LOCAL DEVELOPMENT

| Item | Cost |
|---|---|
| Node.js, Go, Docker, Expo | $0 (free OSS) |
| SQLite databases | $0 (file on disk) |
| Mobile dev via Expo Go | $0 |
| Browser extension via `chrome://extensions` | $0 |
| OpenAI for dev testing (optional) | ~$0.50/month at light dev use, or $0 if you skip AI and use template fallbacks |

**Total: $0-1/month for local dev.**

---

## PERSONAL DEPLOYMENT (RECOMMENDED PROFILE)

Single operator running on a single VPS, ~normal use (3-5 rounds per day, 4-8 hours per round).

| Item | Vendor | Monthly cost |
|---|---|---|
| **VPS** | Hetzner CPX11 (2 vCPU, 2 GB RAM, 40 GB SSD, EU/US) | **€4.51 (~$5)** |
| **Domain** | Namecheap / Porkbun / Cloudflare (annualized) | $1 |
| **TLS certificate** | Let's Encrypt via Caddy | $0 |
| **OpenAI API** (gpt-5.4-nano) | OpenAI — see breakdown below | $1-3 |
| **ElevenLabs TTS** (optional) | ElevenLabs Free tier (10k chars/mo) or Starter ($5/mo, 30k chars) | $0-5 |
| **Off-VPS backup storage** (optional) | Cloudflare R2 / Backblaze B2 (~1 GB) | $0-0.50 |
| **Total without TTS** | | **~$7/month** |
| **Total with TTS** | | **~$10-12/month** |

---

## OPENAI USAGE BREAKDOWN

GPT-5.4 nano pricing (assumed, similar to predecessors):
- **Input:** ~$0.10 per million tokens
- **Output:** ~$0.40 per million tokens

Per announcement (typical):
- Input prompt: ~600 tokens (system prompt + compact behavioral context)
- Output: ~80 tokens (a 30-second announcement)
- Cost: `(600 × $0.10/M) + (80 × $0.40/M) = $0.000092` ≈ **$0.0001 per announcement**

Per behavioral analysis (less frequent, larger):
- Input: ~1500 tokens (compact aggregated stats)
- Output: ~200 tokens (analysis summary)
- Cost: `(1500 × $0.10/M) + (200 × $0.40/M) = $0.00023` ≈ **$0.0003 per analysis**

Per typical operational day:
- 20 announcements (during 4 rounds × 5 announcements/round): $0.002
- 4 behavioral analyses (one per round): $0.0012
- 5 status report regenerations from cache miss: $0.0005
- **Daily total: ~$0.004**
- **Monthly total: ~$0.12-0.30** depending on usage intensity

Plus periodic non-round AI activity (ambient presence announcements, recovery offers, state transitions) — call it **$0.50-2.00/month** in heavy use.

Realistic upper bound: **$3/month** unless something is misconfigured.

### Cost spikes to watch for

| Cause | Symptom | Fix |
|---|---|---|
| Cache disabled or always missing | Same context produces new calls repeatedly | Verify `CacheService.size()` grows over time |
| Stuck in CRITICAL state | Announcement frequency 5/min, never resets | Check state machine; manually trigger round completion |
| Behavioral context not compactified | Input tokens > 3k per call | Verify compact summarization is applied before send |
| Retries on transient failures | Same call repeated 3-5 times | Lower retry count or add cache key on retry |

A budget cap of **$5/month** is reasonable. Set this in OpenAI dashboard → Billing → Usage limits.

---

## TTS (ELEVENLABS) USAGE BREAKDOWN

Voice announcements are **optional**. The system gracefully degrades to text-only if TTS is unavailable.

If enabled:
- Each announcement is ~80 characters of speech
- 20 announcements/day × 80 chars = 1600 chars/day = ~48k chars/month
- ElevenLabs Free tier (10k chars/mo): **insufficient — would cap out**
- ElevenLabs Starter ($5/mo, 30k chars): **insufficient — would cap out**
- ElevenLabs Creator ($22/mo, 100k chars): **comfortable**

Caching reduces this significantly — identical announcement text is reused (hash-keyed MP3 cache). Common operational phrases like "Operational check." repeat often, so realistic monthly chars sent are closer to **15-25k**.

Recommendation:
- **Voice is optional luxury** — start with TTS disabled ($0)
- If you want voice, **Starter ($5/mo)** is sufficient with aggressive caching
- **Creator ($22/mo)** only if you want voice on every announcement without cache

---

## OFFLINE / LOCAL-AI OPTION

For zero AI API cost, use **Ollama** locally on your laptop (not on the VPS):
- Install Ollama: free
- Run a model like `llama3.1:8b`: ~5 GB disk, ~6 GB RAM when active
- Configure ai-service to use Ollama (set `AI_PROVIDER=ollama`)
- **AI cost: $0/month**

Caveats:
- Only works while your laptop is on and reachable from the VPS (requires tunnel or LAN routing — not trivial)
- Or: run ai-service on your laptop too instead of the VPS, and have the VPS-hosted backend reach it. Adds complexity.
- Simpler alternative: stay on OpenAI; it's $1-3/month.

---

## ONE-TIME COSTS

| Item | Cost | When |
|---|---|---|
| Domain (annual) | $10-15/year | Recurring annual |
| Apple Developer Program | $99/year | Only if distributing iOS mobile binary outside TestFlight |
| Google Play Developer | $25 one-time | Only if distributing Android binary outside internal testing |
| Chrome Web Store Developer | $5 one-time | Only if publishing extension publicly |

For **personal use**, all three distribution accounts are unnecessary:
- Mobile: build via Expo + install directly to your own device (`eas build` + `--profile development`)
- Browser extension: load unpacked locally
- Desktop agent: just run the Go binary

---

## SCALING NOTES (NOT GOAL, BUT FOR REFERENCE)

If you ever wanted to share with one or two trusted people (small group, not public):

- **2-3 operators:** stay on the same VPS. Add another 256 MB RAM headroom. **Same $5-7/month.** AI usage scales linearly: $3-9/month combined.
- **10 operators:** upgrade to Hetzner CPX21 (2 vCPU, 4 GB RAM): €7.05/mo. Same SQLite + in-memory architecture. AI usage ~$10-30/month.

Beyond ~25 operators, you'd hit single-process Node.js scaling limits and want to revisit horizontal scaling. **At which point the original SaaS architecture (Postgres + Redis + multi-pod) makes sense again.**

For one operator: **$6/month** is the right number.

---

## COMPARISON

| Plan | Old SaaS plan | New self-hosted |
|---|---|---|
| Cloud provider | AWS / GCP | Hetzner VPS |
| Database | RDS Postgres ($20-50/mo) | SQLite ($0) |
| Cache | ElastiCache Redis ($15-30/mo) | In-memory ($0) |
| Compute | EKS cluster (~$70/mo control plane) + nodes (~$30+) | $5 VPS |
| Load balancer | ALB ($16/mo + traffic) | Caddy on the VPS ($0) |
| Object storage | S3 ($5-20/mo) | Local volume on VPS ($0) |
| TLS | ACM (free) but ALB carries cost | Caddy auto Let's Encrypt ($0) |
| Observability | Sentry + Datadog ($30-100/mo) | Docker logs + SQLite audit ($0) |
| Secrets management | Secrets Manager ($1/mo + API costs) | `.env.production` on the VPS ($0) |
| Backups | RDS automated ($variable) | Daily cron + rclone to R2 (~$0.50/mo) |
| AI | Anthropic ($5-30/mo) + ElevenLabs ($22/mo) | OpenAI nano ($1-3/mo) + optional ElevenLabs |
| Domain | $10/year | $10/year |
| **Monthly total** | **$200-700** | **$6-15** |

The simplified architecture is **97% cheaper** for the same single-operator functionality.

---

## BUDGET RECOMMENDATIONS

**Tier 1 — Minimal:**
- Hetzner CPX11 VPS: $5
- Domain (annualized): $1
- OpenAI: $1-3
- **Total: $7-9/month**
- Tradeoff: no voice TTS, no off-site backups

**Tier 2 — Comfortable (recommended):**
- Hetzner CPX11 VPS: $5
- Domain: $1
- OpenAI: $1-3
- ElevenLabs Starter (if you want voice): $5
- Off-site backups (R2): $0.50
- **Total: $12-15/month**

**Tier 3 — Indulgent:**
- Hetzner CPX21 VPS (4 GB RAM): $8
- Domain on a premium TLD: $1
- OpenAI with higher daily budget: $5
- ElevenLabs Creator: $22
- R2 + offsite mirror: $1
- **Total: $37/month**

**Tier 1 is plenty** for the actual product. The system is designed to feel immersive at any budget level.

---

## COST MONITORING PRACTICES

1. **OpenAI dashboard alerts** — set daily/monthly spend caps in https://platform.openai.com/usage. A $5/month hard cap is reasonable.
2. **Hetzner billing** — predictable flat rate; no overage risk
3. **ElevenLabs character usage** — visible in dashboard; cache hit ratio in ai-service logs tells you if you're efficient
4. **VPS disk usage** — `du -sh /opt/extraction/data` monthly; SQLite + voice cache shouldn't exceed 5 GB even after a year of heavy use
5. **Quarterly review** — check actual spend vs. estimate; investigate if > 2× expected

---

## DECOMMISSION COST

If you stop using the system:
- Destroy VPS: $0
- Cancel domain renewal: $0 (just don't renew next year)
- Revoke OpenAI key: $0
- Optionally archive `/opt/extraction/data/` to cold storage: < $0.10/year

**No long-term commitment.** No contracts. The system is fully owned by you.
