// Package roundcontext polls the backend for the currently active round and
// exposes it to the rest of the agent. Collectors / aggregator can ask
// "is there a round going on right now?" without making any HTTP calls in
// their hot path.
//
// Behaviour:
//
//   - Polls GET ${backendURL}/rounds/current every Interval (default 60s).
//   - Caches the result in memory under a mutex.
//   - If the backend errors or returns 404, the last known state is kept for
//     StaleAfter (default 10 min); after that, Current() returns no-round.
//   - Sends bearer token via the supplied TokenProvider.
package roundcontext

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"
)

// TokenProvider matches uploader.TokenProvider; duplicated here to avoid a
// cycle.
type TokenProvider interface {
	Token() string
}

// RoundContext is the parsed round info returned by the backend.
type RoundContext struct {
	RoundID   string    `json:"roundId"`
	State     string    `json:"state"`
	StartedAt time.Time `json:"startedAt,omitempty"`
	EndsAt    time.Time `json:"endsAt,omitempty"`
}

// Active reports whether the round is in a state where telemetry should be
// tagged with its ID. We treat anything other than "" / "completed" /
// "cancelled" as active.
func (r RoundContext) Active() bool {
	if r.RoundID == "" {
		return false
	}
	switch strings.ToLower(r.State) {
	case "", "completed", "cancelled", "expired":
		return false
	}
	return true
}

// Remaining is the time until EndsAt, clamped to zero.
func (r RoundContext) Remaining() time.Duration {
	if r.EndsAt.IsZero() {
		return 0
	}
	d := time.Until(r.EndsAt)
	if d < 0 {
		return 0
	}
	return d
}

// Poller fetches the current round on a ticker.
type Poller struct {
	BackendURL string
	Tokens     TokenProvider
	Interval   time.Duration
	StaleAfter time.Duration
	Client     *http.Client

	mu        sync.RWMutex
	current   RoundContext
	updatedAt time.Time
	known     bool
}

// New constructs a Poller. backendURL may include /api or not — the path
// /rounds/current is appended.
func New(backendURL string, tokens TokenProvider, interval time.Duration) *Poller {
	if interval <= 0 {
		interval = 60 * time.Second
	}
	if tokens == nil {
		tokens = staticEmpty{}
	}
	return &Poller{
		BackendURL: strings.TrimRight(backendURL, "/"),
		Tokens:     tokens,
		Interval:   interval,
		StaleAfter: 10 * time.Minute,
		Client:     &http.Client{Timeout: 15 * time.Second},
	}
}

type staticEmpty struct{}

func (staticEmpty) Token() string { return "" }

// Current returns the cached round and whether it's currently active. The
// second return is false when the cache is stale, never-populated, or the
// round isn't in an active state.
func (p *Poller) Current() (RoundContext, bool) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	if !p.known {
		return RoundContext{}, false
	}
	if !p.updatedAt.IsZero() && p.StaleAfter > 0 &&
		time.Since(p.updatedAt) > p.StaleAfter {
		return RoundContext{}, false
	}
	if !p.current.Active() {
		return p.current, false
	}
	return p.current, true
}

// Run blocks until ctx is cancelled.
func (p *Poller) Run(ctx context.Context, log *slog.Logger) error {
	log = log.With("component", "roundcontext")
	// Do an immediate fetch so we don't sit blank for the first interval.
	if err := p.fetch(ctx); err != nil {
		log.Debug("initial round fetch failed", "error", err)
	}

	tick := time.NewTicker(p.Interval)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-tick.C:
			if err := p.fetch(ctx); err != nil {
				log.Debug("round fetch failed", "error", err)
			}
		}
	}
}

// fetch performs a single GET. A 404 / network error preserves the prior
// state (the StaleAfter window applies on read).
func (p *Poller) fetch(ctx context.Context) error {
	if p.BackendURL == "" {
		return errors.New("backend url not configured")
	}
	url := p.BackendURL + "/rounds/current"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	if tok := p.Tokens.Token(); tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	resp, err := p.Client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNoContent || resp.StatusCode == http.StatusNotFound {
		p.set(RoundContext{})
		return nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("http %d: %s", resp.StatusCode,
			strings.TrimSpace(string(body)))
	}

	var rc RoundContext
	if err := json.NewDecoder(resp.Body).Decode(&rc); err != nil {
		return fmt.Errorf("decode round response: %w", err)
	}
	p.set(rc)
	return nil
}

func (p *Poller) set(rc RoundContext) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.current = rc
	p.updatedAt = time.Now()
	p.known = true
}
