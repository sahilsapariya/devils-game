# VPS DEPLOYMENT GUIDE

End-to-end walkthrough for deploying PROJECT EXTRACTION to a cheap VPS.

**Target audience:** the operator (you), setting up their own personal instance.

**Total time:** ~30 minutes for first deploy.

**Recurring cost:** ~$5/month VPS + $1-3/month OpenAI usage.

---

## 1. CHOOSE & PROVISION A VPS

Any cheap Linux VPS will do. Tested-friendly providers:

| Provider | Plan | Cost | Specs |
|---|---|---|---|
| **Hetzner Cloud** | CPX11 | €4.51/mo (~$5) | 2 vCPU AMD, 2 GB RAM, 40 GB SSD, 20 TB traffic |
| **DigitalOcean** | Basic Droplet | $6/mo | 1 vCPU, 1 GB RAM, 25 GB SSD, 1 TB traffic |
| **Vultr** | Cloud Compute | $6/mo | 1 vCPU, 1 GB RAM, 25 GB SSD, 1 TB traffic |
| **Linode** | Nanode | $5/mo | 1 vCPU, 1 GB RAM, 25 GB SSD, 1 TB traffic |
| **Hetzner Cloud** | CAX11 (ARM) | €3.79/mo (~$4) | 2 vCPU ARM, 4 GB RAM, 40 GB SSD |

**Recommended:** Hetzner CPX11 — best price/performance, 2 GB RAM is comfortable.

When provisioning:
- OS: **Ubuntu 24.04 LTS**
- Add your SSH public key (recommended) or set a strong root password
- Note the IP address

---

## 2. POINT A DOMAIN AT THE VPS

You need a domain (e.g., `extraction.your-name.com`) for HTTPS to work.

Options:
- Use an existing domain — add an A record pointing your chosen subdomain at the VPS IP
- Buy a cheap domain (Namecheap, Porkbun, Cloudflare) — ~$10/year

Wait ~5 minutes for DNS propagation. Verify with:
```bash
dig +short extraction.your-name.com   # should return the VPS IP
```

---

## 3. SSH IN + BOOTSTRAP

From your local machine:

```bash
ssh root@<vps-ip>
```

On the VPS, install Docker and create the deployment directory by running the bootstrap script. The fastest path is to first install git, clone the repo, and run the script from there:

```bash
apt-get update && apt-get install -y git
mkdir -p /opt/extraction
cd /opt/extraction
git clone https://github.com/<your-username>/devils-game.git .
bash scripts/vps-bootstrap.sh
```

The bootstrap script does:
- Installs Docker Engine + Compose plugin
- Configures UFW firewall (allow SSH, 80, 443; deny everything else)
- Creates `/opt/extraction/data/` host volume with correct permissions
- Configures Docker daemon for log rotation (max-size 10m, max-file 3)
- Enables systemd to start Docker on boot

When it finishes, log out and back in (so your shell picks up the `docker` group):
```bash
exit
ssh root@<vps-ip>
cd /opt/extraction
```

---

## 4. CONFIGURE THE PRODUCTION ENVIRONMENT

Copy the template and fill in real values:

```bash
cp .env.production.example .env.production
nano .env.production
```

Required values to fill:

```bash
# Domain (used by Caddy for automatic HTTPS)
DOMAIN=extraction.your-name.com
ACME_EMAIL=you@your-name.com     # for Let's Encrypt renewal notices

# Auth secrets — generate with: openssl rand -hex 32
JWT_SECRET=<paste 64 hex chars>
JWT_REFRESH_SECRET=<paste different 64 hex chars>
INTERNAL_API_TOKEN=<paste different 64 hex chars>

# Operator account (optional — first run can register normally)
OPERATOR_EMAIL=you@your-name.com
ALLOW_REGISTRATION=false   # disable after first registration for security

# AI provider (one of: openai, ollama)
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.4-nano

# Optional voice (skip if you don't want voice announcements)
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=

# CORS — single-origin for production
CORS_ORIGINS=https://extraction.your-name.com

# Telemetry HMAC verification (enable after device enrollment is wired)
HMAC_VERIFICATION_ENABLED=false

# Database paths (don't change unless you know what you're doing)
DATABASE_PATH=/app/data/operational.db
TELEMETRY_DATABASE_PATH=/app/data/telemetry.db

# Logging
LOG_LEVEL=warn
NODE_ENV=production
PORT=3001
API_PREFIX=api
```

Lock it down:
```bash
chmod 600 .env.production
chown root:root .env.production
```

---

## 5. CONFIGURE CADDY

```bash
cp Caddyfile.example Caddyfile
nano Caddyfile
```

Replace `extraction.example.com` with your actual domain. Save.

---

## 6. FIRST BOOT

```bash
docker compose -f docker-compose.prod.yml up -d
```

This will:
1. Build / pull the backend + ai-service images
2. Start Caddy, which immediately requests a Let's Encrypt cert for your domain
3. Start backend; on first boot it runs migrations and creates `data/operational.db` + `data/telemetry.db`
4. Start ai-service; on first boot it creates `data/voice-cache/`

Watch progress:
```bash
docker compose -f docker-compose.prod.yml logs -f
# (Ctrl-C to stop tailing once everything is running)
```

Wait ~30-60 seconds for Caddy to provision the TLS cert. Then verify:

```bash
curl https://extraction.your-name.com/health
# → {"status":"ok","components":{"database":{"status":"ok"},"cache":{"status":"ok"},"eventBus":{"status":"ok"}}}
```

If this returns 200, you're online.

---

## 7. CREATE THE OPERATOR ACCOUNT

From the VPS or your local machine:

```bash
curl -X POST https://extraction.your-name.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@your-name.com","password":"<your-strong-password>","displayName":"Operator"}'
```

This returns your access token + refresh token. Save them somewhere — you'll need the access token to log in from the mobile app, desktop agent, and browser extension.

After registration, set `ALLOW_REGISTRATION=false` in `.env.production` and restart backend:
```bash
docker compose -f docker-compose.prod.yml restart backend
```

This prevents any future registration attempts.

---

## 8. CONFIGURE YOUR CLIENTS

### Mobile app

Edit `packages/mobile/app.json` (on your dev machine, before building):

```json
"extra": {
  "apiBaseUrl": "https://extraction.your-name.com/api",
  "wsBaseUrl": "https://extraction.your-name.com"
}
```

Rebuild with Expo and install on your phone.

### Desktop agent

On your laptop:

```bash
cd packages/desktop-agent
./bin/agent enroll \
  --user-token "<your access token>" \
  --backend-url "https://extraction.your-name.com/api"
```

This stores the agent token in macOS Keychain and writes config to `~/.config/extraction/agent.toml`.

Then run the agent:
```bash
./bin/agent
```

(For auto-start on login, see "Optional: macOS LaunchAgent" below.)

### Browser extension

1. In Chrome, go to `chrome://extensions` and load the `packages/extension/dist/` directory
2. Click the extension icon, paste:
   - API URL: `https://extraction.your-name.com/api`
   - Auth token: `<your access token>`

---

## 9. VERIFY END-TO-END

From your local machine:

```bash
BASE=https://extraction.your-name.com
TOKEN=<your access token>

# Create a mission
curl -X POST $BASE/api/missions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"First objective","priority":1}'
```

Open your mobile app. You should see the mission appear on the dashboard. If you start a round, the desktop agent will tag telemetry events with that round ID, and the browser extension will surface distraction overlays during it.

---

## 10. OPERATIONAL TASKS

### View logs

```bash
ssh root@vps
cd /opt/extraction
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f ai-service
docker compose -f docker-compose.prod.yml logs -f caddy
```

### Restart a container

```bash
docker compose -f docker-compose.prod.yml restart backend
```

### Update the deployment

```bash
ssh root@vps "cd /opt/extraction && git pull && docker compose -f docker-compose.prod.yml up -d --build"
```

### Backup SQLite databases

```bash
# On the VPS (or via SSH from local):
bash /opt/extraction/scripts/backup-sqlite.sh
# → /opt/extraction/data/backups/YYYY-MM-DD/operational.db, telemetry.db
```

For off-VPS storage:
```bash
# Install rclone once: apt-get install rclone
rclone copy /opt/extraction/data/backups/ <remote>:extraction-backups/
```

Add this to cron for nightly backups:
```bash
# As root: crontab -e
0 3 * * * /opt/extraction/scripts/backup-sqlite.sh && rclone copy /opt/extraction/data/backups/ remote:extraction-backups/
```

### Inspect the SQLite databases

```bash
docker compose -f docker-compose.prod.yml exec backend sqlite3 /app/data/operational.db
sqlite> .schema
sqlite> SELECT id, email, current_streak, reputation_score FROM users;
sqlite> SELECT COUNT(*) FROM events;
sqlite> .quit
```

### Restart everything cleanly

```bash
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

### Disk usage

```bash
df -h /
du -sh /opt/extraction/data
docker system df
```

If Docker image cache is bloating, prune unused images:
```bash
docker image prune -af
```

---

## 11. OPTIONAL ENHANCEMENTS

### Optional: macOS LaunchAgent for desktop agent

Create `~/Library/LaunchAgents/com.extraction.agent.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.extraction.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/path/to/devils-game/packages/desktop-agent/bin/agent</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/extraction-agent.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/extraction-agent.err</string>
</dict>
</plist>
```

Load it:
```bash
launchctl load ~/Library/LaunchAgents/com.extraction.agent.plist
```

### Optional: Fail2ban for SSH protection

```bash
apt-get install -y fail2ban
systemctl enable --now fail2ban
```

### Optional: Disable root SSH after creating a non-root user

```bash
# Create a deploy user
adduser deploy
usermod -aG docker,sudo deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# Test SSH as deploy user, THEN disable root SSH:
# nano /etc/ssh/sshd_config  → PermitRootLogin no
# systemctl reload sshd
```

### Optional: GitHub Actions auto-deploy

In `.github/workflows/deploy.yml`, add an `ssh` deploy step:

```yaml
- name: Deploy via SSH
  uses: appleboy/ssh-action@v1
  with:
    host: ${{ secrets.VPS_HOST }}
    username: deploy
    key: ${{ secrets.VPS_SSH_KEY }}
    script: |
      cd /opt/extraction
      git pull
      docker compose -f docker-compose.prod.yml up -d --build
```

Triggers on push to `main` (or manual dispatch).

---

## 12. TROUBLESHOOTING

### Caddy can't provision TLS cert

Most common cause: DNS hasn't propagated yet, or the firewall is blocking port 80.

```bash
# Verify DNS
dig +short extraction.your-name.com

# Verify port 80 is reachable from outside
curl -v http://extraction.your-name.com/

# Caddy logs
docker compose -f docker-compose.prod.yml logs caddy
```

If `dig` returns nothing, wait longer for DNS. If port 80 isn't reachable, check the cloud provider's firewall (separate from UFW).

### Backend won't start

```bash
docker compose -f docker-compose.prod.yml logs backend
```

Common causes:
- Missing or malformed `.env.production` values (especially JWT secrets less than 32 chars)
- Permission issue on `/opt/extraction/data` (run `chown -R 1001:1001 /opt/extraction/data` — Docker's non-root user is UID 1001)
- Migration failure (rare — check the log)

### AI service returns 502 from Caddy

Caddy can reach the AI service container but the service itself isn't responding. Check `docker compose logs ai-service` — likely a missing env var or bad model name.

### Mobile app can't connect

- Verify HTTPS works: `curl https://extraction.your-name.com/health`
- Verify mobile is connected to the internet (not just same Wi-Fi — mobile traffic goes over the public internet to your VPS)
- Check the JWT token isn't expired

### OpenAI calls fail with 401

Your `OPENAI_API_KEY` is invalid or revoked. Get a fresh key from https://platform.openai.com → API keys.

### Costs spiking

Check Anthropic / OpenAI usage dashboard. If unexpected, possible causes:
- AI service is generating announcements more frequently than intended (check operational state machine logic; usually means stuck in CRITICAL)
- Cache not working (check `cache.size` in `/health` response — should grow over time, not reset constantly)

Mitigation: lower `OPENAI_MAX_DAILY_CALLS` env var (if implemented; otherwise add it).

### SQLite database corrupted

```bash
# Stop backend first
docker compose -f docker-compose.prod.yml stop backend

# Check integrity
docker compose -f docker-compose.prod.yml exec backend sqlite3 /app/data/operational.db "PRAGMA integrity_check;"
# Should print "ok"

# If corrupted, restore from backup
cp /opt/extraction/data/backups/2026-05-14/operational.db /opt/extraction/data/operational.db

# Restart
docker compose -f docker-compose.prod.yml up -d
```

---

## 13. DECOMMISSION

To completely remove:

```bash
docker compose -f docker-compose.prod.yml down -v
rm -rf /opt/extraction
# Destroy the VPS via your provider's dashboard
# Delete the DNS A record
# Revoke the OpenAI API key
# Optional: delete the GitHub repo
```

Your data: copy `/opt/extraction/data/` somewhere safe before `rm -rf`.

---

## SUMMARY

| Step | Time |
|---|---|
| Provision VPS | 2 min |
| Point DNS | 1 min + propagation wait |
| SSH + bootstrap | 5 min |
| Configure `.env.production` | 5 min |
| Deploy | 2 min build + 30s for TLS |
| Register operator | 30 s |
| Configure clients | 10 min |
| **Total** | **~30 min** for a fully operational personal instance |

The operation is now online and reachable from your phone, laptop, and browser, anywhere in the world, for ~$6/month.
