// Package config loads agent configuration from environment variables and an
// optional TOML file at ~/.config/extraction/agent.toml. Environment overrides
// always win over file values; file values win over defaults.
package config

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"time"

	"github.com/BurntSushi/toml"
)

// Config is the resolved agent configuration. All durations are stored as
// time.Duration for convenience; the TOML/env values are integer milliseconds
// or seconds depending on the field, as documented.
type Config struct {
	// BackendURL is the base URL of the backend API (without trailing slash).
	BackendURL string `toml:"backend_url"`
	// AuthToken is the bearer token used for telemetry uploads. The canonical
	// store is the macOS Keychain (see internal/auth) — this field is used as
	// a fallback / dev override and is never persisted to the TOML file.
	// The TOML tag is "-" so Save() never writes it to disk; reads come only
	// from EXTRACTION_AUTH_TOKEN env.
	AuthToken string `toml:"-"`
	// DeviceID is a stable identifier for this device. Auto-generated and
	// persisted if not provided.
	DeviceID string `toml:"device_id"`
	// DeviceHmacKey is a 32-byte key (hex-encoded in TOML) used to sign
	// telemetry batches. Auto-generated on first run.
	DeviceHmacKey string `toml:"device_hmac_key"`

	// PollIntervalMs controls how often the window collector polls.
	PollInterval time.Duration `toml:"-"`
	// IdleThresholdMs is the minimum idle duration before an idle_detected
	// event is emitted.
	IdleThreshold time.Duration `toml:"-"`
	// BatchSize is the maximum number of aggregated records per upload.
	BatchSize int `toml:"batch_size"`
	// BatchInterval is how often the uploader runs.
	BatchInterval time.Duration `toml:"-"`
	// AggregationInterval is the window length used by the aggregator.
	AggregationInterval time.Duration `toml:"-"`
	// GitHookPort is the localhost port for the embedded git-hook receiver.
	GitHookPort int `toml:"git_hook_port"`
	// RoundPollIntervalSec is how often roundcontext polls the backend.
	RoundPollIntervalSec int `toml:"round_poll_interval_sec"`

	// DataDir is the directory used for the SQLite buffer.
	DataDir string `toml:"data_dir"`
	// LogLevel: debug | info | warn | error.
	LogLevel string `toml:"log_level"`
	// LogFile is an optional path that, if non-empty, is opened by the
	// logging package and tee'd into alongside stderr.
	LogFile string `toml:"log_file"`
	// DashboardURL is the URL opened by the tray's "Open Backend Dashboard"
	// menu item. Falls back to BackendURL if empty.
	DashboardURL string `toml:"dashboard_url"`

	// Raw millisecond/second values from TOML, used during unmarshal.
	PollIntervalMs   int `toml:"poll_interval_ms"`
	IdleThresholdMs  int `toml:"idle_threshold_ms"`
	BatchIntervalSec int `toml:"batch_interval_sec"`
	AggregationSec   int `toml:"aggregation_interval_sec"`
}

// Default returns a Config populated with safe defaults. These mirror the
// values documented in the spec.
func Default() Config {
	return Config{
		BackendURL:           "http://localhost:3001/api",
		DashboardURL:         "",
		AuthToken:            "",
		PollInterval:         2 * time.Second,
		IdleThreshold:        5 * time.Minute,
		BatchSize:            100,
		BatchInterval:        10 * time.Minute,
		AggregationInterval:  5 * time.Minute,
		GitHookPort:          7890,
		RoundPollIntervalSec: 60,
		DataDir:              defaultDataDir(),
		LogLevel:             "info",
		LogFile:              defaultLogFile(),
		PollIntervalMs:       2000,
		IdleThresholdMs:      300000,
		BatchIntervalSec:     600,
		AggregationSec:       300,
	}
}

// Load resolves config from defaults → TOML file (if present) → env vars.
func Load() (Config, error) {
	cfg := Default()

	if path := configPath(); path != "" {
		if _, err := os.Stat(path); err == nil {
			if _, err := toml.DecodeFile(path, &cfg); err != nil {
				return cfg, fmt.Errorf("decode config %s: %w", path, err)
			}
		}
	}

	applyEnv(&cfg)

	// Promote integer milli/sec fields into Durations, allowing TOML & env
	// to set either form.
	if cfg.PollIntervalMs > 0 {
		cfg.PollInterval = time.Duration(cfg.PollIntervalMs) * time.Millisecond
	}
	if cfg.IdleThresholdMs > 0 {
		cfg.IdleThreshold = time.Duration(cfg.IdleThresholdMs) * time.Millisecond
	}
	if cfg.BatchIntervalSec > 0 {
		cfg.BatchInterval = time.Duration(cfg.BatchIntervalSec) * time.Second
	}
	if cfg.AggregationSec > 0 {
		cfg.AggregationInterval = time.Duration(cfg.AggregationSec) * time.Second
	}

	if err := ensureDir(cfg.DataDir); err != nil {
		return cfg, err
	}

	if cfg.DeviceID == "" {
		id, err := resolveDeviceID(cfg.DataDir)
		if err != nil {
			return cfg, err
		}
		cfg.DeviceID = id
	}

	// Ensure an HMAC key exists. If we generate one (or migrate from no-key
	// state), persist back to TOML so future runs reuse it.
	if cfg.DeviceHmacKey == "" {
		key, err := generateHmacKey()
		if err != nil {
			return cfg, fmt.Errorf("generate device hmac key: %w", err)
		}
		cfg.DeviceHmacKey = key
		if err := persistKey(cfg); err != nil {
			// Don't fail startup just because we couldn't persist; log via
			// the caller's logger by surfacing through error chain.
			return cfg, fmt.Errorf("persist device hmac key: %w", err)
		}
	}

	return cfg, nil
}

// Save writes the current Config back to the TOML file. Only persisted
// fields (those with TOML tags other than `-`) are written.
func Save(cfg Config) error {
	return persistKey(cfg)
}

// persistKey writes the config to the TOML file with mode 0600. Fields with
// `toml:"-"` (AuthToken + runtime durations) are skipped automatically by the
// encoder.
func persistKey(cfg Config) error {
	path := configPath()
	if path == "" {
		return fmt.Errorf("no home directory; cannot persist config")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	enc := toml.NewEncoder(f)
	if err := enc.Encode(cfg); err != nil {
		_ = f.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, path)
}

// ConfigPath returns the resolved on-disk path for the TOML config (may be "").
func ConfigPath() string { return configPath() }

func applyEnv(cfg *Config) {
	if v := os.Getenv("EXTRACTION_BACKEND_URL"); v != "" {
		cfg.BackendURL = v
	}
	if v := os.Getenv("EXTRACTION_AUTH_TOKEN"); v != "" {
		cfg.AuthToken = v
	}
	if v := os.Getenv("EXTRACTION_DEVICE_ID"); v != "" {
		cfg.DeviceID = v
	}
	if v := os.Getenv("EXTRACTION_DATA_DIR"); v != "" {
		cfg.DataDir = v
	}
	if v := os.Getenv("EXTRACTION_LOG_LEVEL"); v != "" {
		cfg.LogLevel = v
	}
	if v := os.Getenv("EXTRACTION_POLL_INTERVAL_MS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.PollIntervalMs = n
		}
	}
	if v := os.Getenv("EXTRACTION_IDLE_THRESHOLD_MS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.IdleThresholdMs = n
		}
	}
	if v := os.Getenv("EXTRACTION_BATCH_SIZE"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.BatchSize = n
		}
	}
	if v := os.Getenv("EXTRACTION_BATCH_INTERVAL_SEC"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.BatchIntervalSec = n
		}
	}
	if v := os.Getenv("EXTRACTION_AGGREGATION_SEC"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.AggregationSec = n
		}
	}
	if v := os.Getenv("EXTRACTION_GIT_HOOK_PORT"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.GitHookPort = n
		}
	}
}

func configPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".config", "extraction", "agent.toml")
}

func defaultDataDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ".extraction-agent"
	}
	if runtime.GOOS == "darwin" {
		return filepath.Join(home, "Library", "Application Support", "extraction-agent")
	}
	return filepath.Join(home, ".local", "share", "extraction-agent")
}

func defaultLogFile() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	if runtime.GOOS == "darwin" {
		return filepath.Join(home, "Library", "Logs", "extraction-agent", "agent.log")
	}
	return filepath.Join(home, ".local", "state", "extraction-agent", "agent.log")
}

func ensureDir(path string) error {
	if path == "" {
		return fmt.Errorf("data dir is empty")
	}
	return os.MkdirAll(path, 0o755)
}

func resolveDeviceID(dataDir string) (string, error) {
	path := filepath.Join(dataDir, "device-id")
	if b, err := os.ReadFile(path); err == nil {
		if s := string(b); s != "" {
			return s, nil
		}
	}
	id := generateDeviceID()
	if err := os.WriteFile(path, []byte(id), 0o600); err != nil {
		return "", fmt.Errorf("persist device id: %w", err)
	}
	return id, nil
}

// generateDeviceID returns a 16-byte hex device id derived from crypto/rand.
// Falls back to time-based id only on catastrophic random failure.
func generateDeviceID() string {
	b := make([]byte, 16)
	if _, err := readRandom(b); err != nil {
		return fmt.Sprintf("dev-%d", time.Now().UnixNano())
	}
	return hexEncode(b)
}

// generateHmacKey returns a 32-byte hex-encoded HMAC key.
func generateHmacKey() (string, error) {
	b := make([]byte, 32)
	if _, err := readRandom(b); err != nil {
		return "", err
	}
	return hexEncode(b), nil
}

func hexEncode(b []byte) string {
	const hex = "0123456789abcdef"
	out := make([]byte, len(b)*2)
	for i, v := range b {
		out[i*2] = hex[v>>4]
		out[i*2+1] = hex[v&0x0f]
	}
	return string(out)
}
