// Package uploader posts batched telemetry to the backend with exponential
// backoff retries. Batches that fail all retries are kept in the queue for
// the next upload tick.
package uploader

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/extraction/desktop-agent/internal/storage"
)

// TokenProvider abstracts the source of the bearer token used for uploads so
// the uploader can request a refresh on 401 without a hard dependency on the
// auth package.
type TokenProvider interface {
	// Token returns the current bearer token (may be empty if not enrolled).
	Token() string
	// Refresh attempts to refresh the token and returns the new value. May be
	// a no-op for static tokens.
	Refresh(ctx context.Context) (string, error)
}

// StaticToken is a TokenProvider backed by a single immutable string. Used
// for dev / non-enrolled setups.
type StaticToken struct {
	V string
}

// Token returns the static token.
func (s *StaticToken) Token() string { return s.V }

// Refresh is a no-op for static tokens.
func (s *StaticToken) Refresh(_ context.Context) (string, error) { return s.V, nil }

// Uploader pushes queued batches to the backend on each tick.
type Uploader struct {
	Store         *storage.Store
	BackendURL    string
	Tokens        TokenProvider
	DeviceID      string
	HmacKey       []byte
	AgentVersion  string
	Source        string
	Interval      time.Duration
	BatchSize     int
	MaxRetries    int
	Client        *http.Client
}

// Options bundles non-trivial construction parameters.
type Options struct {
	BackendURL   string
	Tokens       TokenProvider
	DeviceID     string
	HmacKey      string // hex-encoded
	AgentVersion string
	Interval     time.Duration
	BatchSize    int
}

// New wires up an uploader.
func New(store *storage.Store, opts Options) *Uploader {
	if opts.Interval <= 0 {
		opts.Interval = 10 * time.Minute
	}
	if opts.BatchSize <= 0 {
		opts.BatchSize = 100
	}
	if opts.Tokens == nil {
		opts.Tokens = &StaticToken{}
	}

	var key []byte
	if opts.HmacKey != "" {
		if k, err := hex.DecodeString(opts.HmacKey); err == nil {
			key = k
		} else {
			// Fall back to using the raw bytes if it isn't valid hex.
			key = []byte(opts.HmacKey)
		}
	}

	return &Uploader{
		Store:        store,
		BackendURL:   strings.TrimRight(opts.BackendURL, "/"),
		Tokens:       opts.Tokens,
		DeviceID:     opts.DeviceID,
		HmacKey:      key,
		AgentVersion: opts.AgentVersion,
		Source:       "desktop",
		Interval:     opts.Interval,
		BatchSize:    opts.BatchSize,
		MaxRetries:   5,
		Client:       &http.Client{Timeout: 30 * time.Second},
	}
}

// Run blocks until ctx is cancelled. It also runs an initial upload pass at
// startup to drain anything left over from a previous session.
func (u *Uploader) Run(ctx context.Context, log *slog.Logger) error {
	log = log.With("component", "uploader", "backend", u.BackendURL)
	u.flush(ctx, log)

	tick := time.NewTicker(u.Interval)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-tick.C:
			u.flush(ctx, log)
		}
	}
}

// flush attempts to upload every pending batch, retrying each with
// exponential backoff up to MaxRetries.
func (u *Uploader) flush(ctx context.Context, log *slog.Logger) {
	batches, err := u.Store.PendingBatches(ctx, u.BatchSize)
	if err != nil {
		log.Warn("fetch pending batches failed", "error", err)
		return
	}
	if len(batches) == 0 {
		return
	}

	for _, b := range batches {
		if ctx.Err() != nil {
			return
		}
		if err := u.uploadWithRetry(ctx, b, log); err != nil {
			log.Warn("batch upload failed (will retry later)",
				"batch_id", b.ID, "retry_count", b.RetryCount, "error", err)
			if recErr := u.Store.RecordBatchFailure(ctx, b.ID, truncErr(err)); recErr != nil {
				log.Warn("record batch failure failed", "error", recErr)
			}
			continue
		}
		if err := u.Store.MarkUploaded(ctx, b.ID); err != nil {
			log.Warn("mark uploaded failed", "batch_id", b.ID, "error", err)
		}
	}
}

// uploadWithRetry POSTs the batch with exponential backoff (1s, 2s, 4s, 8s, 16s).
func (u *Uploader) uploadWithRetry(ctx context.Context, b storage.PendingBatch, log *slog.Logger) error {
	delay := time.Second
	var lastErr error
	for attempt := 0; attempt < u.MaxRetries; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(delay):
			}
			delay *= 2
		}
		if err := u.post(ctx, b.Payload); err != nil {
			lastErr = err
			// 401 — try a single refresh and retry the attempt.
			var authErr authError
			if errors.As(err, &authErr) {
				if _, refreshErr := u.Tokens.Refresh(ctx); refreshErr != nil {
					log.Warn("token refresh failed", "error", refreshErr)
					return err
				}
				log.Info("token refreshed after 401; retrying")
				continue
			}
			// 4xx (except 408/429) — permanent, don't retry.
			var perm permanentError
			if errors.As(err, &perm) {
				return err
			}
			log.Debug("upload attempt failed",
				"batch_id", b.ID, "attempt", attempt+1, "error", err)
			continue
		}
		return nil
	}
	if lastErr == nil {
		lastErr = errors.New("upload failed without specific error")
	}
	return lastErr
}

// envelope wraps the original aggregator-produced payload with source/device
// metadata expected by the backend. The aggregator already embeds DeviceID
// + AgentVersion in its own BatchPayload, but we add a `source` field at the
// outer level for consistency with mobile/web ingest paths.
type envelope struct {
	Source       string          `json:"source"`
	DeviceID     string          `json:"deviceId"`
	AgentVersion string          `json:"agentVersion"`
	SentAt       time.Time       `json:"sentAt"`
	Batch        json.RawMessage `json:"batch"`
}

// post performs a single HTTP POST.
func (u *Uploader) post(ctx context.Context, payload []byte) error {
	url := u.BackendURL + "/telemetry/batch"

	body, err := u.envelopeBody(payload)
	if err != nil {
		return fmt.Errorf("build envelope: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	if tok := u.Tokens.Token(); tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}

	// HMAC over the actual request body. Backend recomputes using the device
	// key registered at enrollment.
	if len(u.HmacKey) > 0 {
		ts := time.Now().UTC().Format(time.RFC3339)
		mac := hmac.New(sha256.New, u.HmacKey)
		mac.Write([]byte(ts))
		mac.Write([]byte("\n"))
		mac.Write(body)
		sig := hex.EncodeToString(mac.Sum(nil))
		req.Header.Set("X-Device-Id", u.DeviceID)
		req.Header.Set("X-Signature", sig)
		req.Header.Set("X-Timestamp", ts)
	} else if u.DeviceID != "" {
		req.Header.Set("X-Device-Id", u.DeviceID)
	}
	if u.AgentVersion != "" {
		req.Header.Set("X-Agent-Version", u.AgentVersion)
	}
	if u.Source != "" {
		req.Header.Set("X-Source", u.Source)
	}

	resp, err := u.Client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		_, _ = io.Copy(io.Discard, resp.Body)
		return nil
	}

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
	msg := fmt.Sprintf("http %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))

	if resp.StatusCode == http.StatusUnauthorized {
		return authError{msg: msg}
	}

	// 4xx (other than 408/429) is permanent — server rejects the payload.
	if resp.StatusCode >= 400 && resp.StatusCode < 500 &&
		resp.StatusCode != http.StatusRequestTimeout &&
		resp.StatusCode != http.StatusTooManyRequests {
		return permanentError{msg: msg}
	}
	return errors.New(msg)
}

func (u *Uploader) envelopeBody(batch []byte) ([]byte, error) {
	env := envelope{
		Source:       u.Source,
		DeviceID:     u.DeviceID,
		AgentVersion: u.AgentVersion,
		SentAt:       time.Now().UTC(),
		Batch:        json.RawMessage(batch),
	}
	return json.Marshal(env)
}

type permanentError struct{ msg string }

func (e permanentError) Error() string { return e.msg }

type authError struct{ msg string }

func (e authError) Error() string { return e.msg }

func truncErr(err error) string {
	s := err.Error()
	if len(s) > 256 {
		s = s[:256]
	}
	return s
}
