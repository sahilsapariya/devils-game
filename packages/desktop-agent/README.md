# PROJECT EXTRACTION — Desktop Agent

A lightweight Go-based macOS daemon that continuously monitors user activity (active app,
idle time, terminal commands, git commits) and streams classified telemetry to the
PROJECT EXTRACTION backend.

The agent is built for a minimal footprint (< 5% CPU, < 100MB RAM), survives reboots
via a local SQLite buffer, and is offline-capable: telemetry batches are queued locally
and uploaded with exponential-backoff retries when the backend is reachable.

## Privacy Posture

The agent collects metadata ONLY:

- Active app **name** (no window titles outside the app name)
- Idle / active state (no keystrokes, no mouse coordinates)
- Detected dev command **types** (e.g. `git`, `npm`, `node`) — never arguments
- Git commit **metadata** (hash, message, files-changed count) — never diffs

The agent never reads clipboard, keystrokes, file contents, or full command lines.

## Build

Prerequisites:

- macOS 12+ (Linux/Windows builds work but most collectors are darwin-only)
- Go 1.22+
- CGO enabled (default on macOS) — required for the SQLite driver

```bash
cd packages/desktop-agent
go mod tidy
go build -ldflags "-X main.version=0.2.0" -o ./bin/agent ./cmd/agent
```

The `-ldflags "-X main.version=…"` flag injects the build-time version that the agent
reports in every telemetry batch (`X-Agent-Version` header + payload field).

## Enrollment

The agent uploads telemetry with an agent-scoped JWT issued by the backend during a
one-time enrollment.

1. Sign into the PROJECT EXTRACTION mobile app or web dashboard. The mobile app
   surfaces a one-time enrollment URL / QR containing your user JWT.
2. Run:

   ```bash
   ./bin/agent enroll --user-token <USER_JWT>
   ```

3. The agent generates a device UUID + 32-byte HMAC key (persisted to
   `~/.config/extraction/agent.toml`), registers them with `POST /devices/enroll`,
   and stores the returned agent JWT in your OS keychain (entry
   `extraction-agent / agent-token`).
4. Start the agent; uploads will now be authenticated.

If the backend hasn't implemented `/devices/enroll` yet, `agent enroll` will warn but
still persist the locally-generated key material; you can re-run enrollment once the
backend ships.

## Run

```bash
./bin/agent
```

Configuration is loaded from defaults → `~/.config/extraction/agent.toml` → environment
variables. See `internal/config/config.go` for keys.

Common overrides:

```bash
EXTRACTION_BACKEND_URL=http://localhost:3001/api \
EXTRACTION_LOG_LEVEL=debug \
./bin/agent
```

## Subcommands

```bash
# Install a post-commit hook in the given repo that POSTs to the local agent.
./bin/agent install-hooks /path/to/repo

# Enroll this device with the backend (see "Enrollment" above).
./bin/agent enroll --user-token <jwt>

# Wipe the SQLite buffer + keychain token (with a confirmation prompt).
./bin/agent reset           # interactive
./bin/agent reset --yes     # skip confirmation

# Print the resolved config as JSON (HMAC key + auth token redacted).
./bin/agent config

# Print the agent version.
./bin/agent version
```

## macOS Permissions

On first run, macOS may prompt for:

- **Accessibility** (System Settings → Privacy & Security → Accessibility).
  Required for reliable active-window detection via the AppleScript fallback.
- **Automation** (when AppleScript queries `System Events`). The agent uses
  `osascript` to read the frontmost app — macOS will surface a prompt the first
  time this runs.

If permissions are not granted, the agent still runs and degrades gracefully:
the window collector logs a warning and skips the affected ticks.

## Security

- **HMAC batch signing.** Every uploaded batch is signed with the device's 32-byte
  HMAC-SHA256 key. The request carries three signing headers:

  - `X-Device-Id: <hex device uuid>`
  - `X-Timestamp: <RFC3339 timestamp>`
  - `X-Signature: hex(HMAC-SHA256(key, timestamp + "\n" + body))`

  The backend reconstructs the HMAC using the device key registered at enrollment
  (only the SHA-256 hash of the key is transmitted during enrollment — the raw
  key never leaves the device).

- **Token storage.** The agent JWT is stored in the OS keychain
  (macOS Keychain via `security`, Linux Secret Service, Windows Credential
  Manager) using `github.com/zalando/go-keyring`. The TOML config file is mode
  0600 and is written atomically (write-temp + rename).

- **No secrets in logs.** The HMAC key + auth token are redacted from
  `agent config` output and never appear in structured log lines.

- **HMAC key persistence.** Generated on first run via `crypto/rand`, stored
  hex-encoded as `device_hmac_key` in `agent.toml` (mode 0600). To rotate the
  key, run `agent reset` and re-enroll.

## Architecture

```
+----------------+      +-----------+      +----------+      +-----------+
|  Collectors    | ---> | Classifier| ---> |  SQLite  | ---> |Aggregator |
| (window, idle, |      | (rules)   |      |  Buffer  |      | (5m wins) |
|  terminal, git)|      +-----------+      +----------+      +-----------+
+----------------+                                                 |
                                                                   v
                                                            +-------------+
                                                            |  Uploader   |
                                                            | (HMAC-signed|
                                                            |  batch HTTP)|
                                                            +-------------+
                                                                   |
                                                                   v
                                                          POST /telemetry/batch

      Round context poller   <-->   GET /rounds/current  (60s)
      Auth refresh           <-->   POST /auth/refresh   (on 401)
```

## Data Locations

- SQLite buffer: `~/Library/Application Support/extraction-agent/buffer.db`
  (falls back to `~/.local/share/extraction-agent/buffer.db` on non-macOS).
- Config: `~/.config/extraction/agent.toml`
- Logs: `~/Library/Logs/extraction-agent/agent.log` (tee'd with stderr).
- Keychain entry: service `extraction-agent`, account `agent-token`.

## Troubleshooting

- **Where do I check status?** Click the "EX" icon in the menu bar. The first three
  menu items show the live agent state, the active round (and remaining time),
  and today's running stats.
- **Where do I find logs?** Tray → "View Logs" opens `agent.log` in your default
  editor. The same file is on disk at `~/Library/Logs/extraction-agent/agent.log`.
- **Reset / re-enroll.** Run `./bin/agent reset` to wipe the SQLite buffer + the
  keychain token, then re-run `agent enroll --user-token …`. This is also the
  way to rotate the HMAC key (delete `~/.config/extraction/agent.toml` after
  reset and restart).
- **Backend dashboard.** Tray → "Open Backend Dashboard" opens `dashboard_url`
  from config (defaults to `BackendURL` minus a trailing `/api`).
- **Uploads keep failing.** Check the log for `batch upload failed`. A `401` will
  trigger a single auth refresh + retry; a `404` on `/telemetry/batch` means the
  backend hasn't shipped the ingest endpoint yet — batches stay queued in
  `buffer.db` and will drain when the endpoint comes online.

## Development

```bash
go test ./...
go vet ./...
```
