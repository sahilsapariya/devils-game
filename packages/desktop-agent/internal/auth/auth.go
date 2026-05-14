// Package auth handles agent enrollment with the backend and refreshes the
// short-lived agent token. The token is persisted in the OS keychain (macOS
// Keychain / Linux Secret Service / Windows Credential Manager) via the
// cross-platform github.com/zalando/go-keyring library.
//
// Why go-keyring (vs keybase/go-keychain): single dependency, pure-Go on
// Linux/Windows, and uses macOS's `security` framework on darwin without
// requiring cgo. We already have one cgo dep (sqlite3) and prefer not to
// add more.
package auth

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/zalando/go-keyring"
)

// KeychainService is the service name used to store the agent's bearer token.
const KeychainService = "extraction-agent"

// KeychainAccount is the account name (one token per device for now).
const KeychainAccount = "agent-token"

// ErrNotEnrolled is returned when no token is stored.
var ErrNotEnrolled = errors.New("agent not enrolled")

// EnrollRequest is the body sent to /devices/enroll.
type EnrollRequest struct {
	DeviceID     string `json:"deviceId"`
	HmacKeyHash  string `json:"hmacKeyHash"`
	Platform     string `json:"platform"`
	AgentVersion string `json:"agentVersion"`
	Hostname     string `json:"hostname,omitempty"`
}

// EnrollResponse is the parsed response. The backend returns an agent-scoped
// token that the uploader uses for all subsequent batches.
type EnrollResponse struct {
	AgentToken string    `json:"agentToken"`
	ExpiresAt  time.Time `json:"expiresAt,omitempty"`
}

// Client is a thin HTTP client targeting the backend's device endpoints.
type Client struct {
	BackendURL string
	HTTP       *http.Client
}

// NewClient returns an auth client for the given backend.
func NewClient(backendURL string) *Client {
	return &Client{
		BackendURL: strings.TrimRight(backendURL, "/"),
		HTTP:       &http.Client{Timeout: 30 * time.Second},
	}
}

// Enroll registers the device and returns the agent token. The caller is
// expected to persist the token via StoreToken (or to ignore the failure if
// the backend doesn't implement enrollment yet).
func (c *Client) Enroll(ctx context.Context, userToken string, req EnrollRequest) (EnrollResponse, error) {
	var out EnrollResponse
	if c.BackendURL == "" {
		return out, errors.New("backend url not configured")
	}
	body, err := json.Marshal(req)
	if err != nil {
		return out, fmt.Errorf("marshal enroll request: %w", err)
	}
	url := c.BackendURL + "/devices/enroll"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return out, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if userToken != "" {
		httpReq.Header.Set("Authorization", "Bearer "+userToken)
	}

	resp, err := c.HTTP.Do(httpReq)
	if err != nil {
		return out, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))

	if resp.StatusCode == http.StatusNotFound {
		// Backend hasn't implemented this endpoint yet — graceful no-op.
		return out, ErrEndpointMissing
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return out, fmt.Errorf("enroll failed: http %d: %s",
			resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	if err := json.Unmarshal(respBody, &out); err != nil {
		return out, fmt.Errorf("decode enroll response: %w", err)
	}
	if out.AgentToken == "" {
		return out, errors.New("enroll response missing agentToken")
	}
	return out, nil
}

// RefreshToken exchanges the current agent token for a fresh one.
func (c *Client) RefreshToken(ctx context.Context, currentToken string) (string, error) {
	if c.BackendURL == "" {
		return "", errors.New("backend url not configured")
	}
	if currentToken == "" {
		return "", ErrNotEnrolled
	}
	url := c.BackendURL + "/auth/refresh"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader([]byte("{}")))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+currentToken)

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))

	if resp.StatusCode == http.StatusNotFound {
		return "", ErrEndpointMissing
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("refresh failed: http %d: %s",
			resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var out struct {
		AgentToken string `json:"agentToken"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", fmt.Errorf("decode refresh response: %w", err)
	}
	if out.AgentToken == "" {
		return "", errors.New("refresh response missing agentToken")
	}
	return out.AgentToken, nil
}

// ErrEndpointMissing signals that the backend has not yet implemented the
// device enrollment / token refresh endpoints. The agent falls back to a
// no-op so it can still queue telemetry locally.
var ErrEndpointMissing = errors.New("backend endpoint not implemented")

// StoreToken persists the agent token in the OS keychain.
func StoreToken(token string) error {
	if token == "" {
		return errors.New("empty token")
	}
	return keyring.Set(KeychainService, KeychainAccount, token)
}

// LoadToken returns the token stored in the keychain (or "" if none).
func LoadToken() (string, error) {
	v, err := keyring.Get(KeychainService, KeychainAccount)
	if err != nil {
		if errors.Is(err, keyring.ErrNotFound) {
			return "", nil
		}
		return "", err
	}
	return v, nil
}

// ClearToken removes the agent token from the keychain. Idempotent.
func ClearToken() error {
	err := keyring.Delete(KeychainService, KeychainAccount)
	if err != nil && !errors.Is(err, keyring.ErrNotFound) {
		return err
	}
	return nil
}

// HashHmacKey returns a hex SHA-256 of the given (hex) key, suitable for
// transmission during enrollment. The backend stores this hash; only the
// agent ever holds the raw key.
func HashHmacKey(hexKey string) string {
	raw, err := hex.DecodeString(hexKey)
	if err != nil {
		raw = []byte(hexKey)
	}
	h := sha256.Sum256(raw)
	return hex.EncodeToString(h[:])
}

// Platform returns a short string describing the runtime OS / arch.
func Platform() string {
	return fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH)
}

// KeychainTokenProvider implements uploader.TokenProvider backed by the
// keychain + an auth client. It refreshes on 401 and persists the new token.
type KeychainTokenProvider struct {
	Client *Client
	Log    *slog.Logger

	mu    sync.RWMutex
	token string
}

// NewKeychainTokenProvider loads the current token from the keychain.
func NewKeychainTokenProvider(client *Client, log *slog.Logger) *KeychainTokenProvider {
	tok, err := LoadToken()
	if err != nil && log != nil {
		log.Warn("load keychain token failed", "error", err)
	}
	return &KeychainTokenProvider{Client: client, Log: log, token: tok}
}

// Token returns the cached agent token.
func (k *KeychainTokenProvider) Token() string {
	k.mu.RLock()
	defer k.mu.RUnlock()
	return k.token
}

// Refresh requests a new token from the backend and persists it. If the
// backend endpoint isn't implemented yet, returns the existing token and a
// nil error so the caller doesn't treat that as fatal.
func (k *KeychainTokenProvider) Refresh(ctx context.Context) (string, error) {
	k.mu.RLock()
	current := k.token
	k.mu.RUnlock()

	if k.Client == nil {
		return current, errors.New("auth client not configured")
	}
	next, err := k.Client.RefreshToken(ctx, current)
	if err != nil {
		if errors.Is(err, ErrEndpointMissing) {
			if k.Log != nil {
				k.Log.Debug("refresh skipped — endpoint not implemented")
			}
			return current, nil
		}
		return current, err
	}

	k.mu.Lock()
	k.token = next
	k.mu.Unlock()

	if err := StoreToken(next); err != nil && k.Log != nil {
		k.Log.Warn("persist refreshed token failed", "error", err)
	}
	return next, nil
}

// Set replaces the in-memory token (used after fresh enrollment).
func (k *KeychainTokenProvider) Set(token string) {
	k.mu.Lock()
	k.token = token
	k.mu.Unlock()
}
