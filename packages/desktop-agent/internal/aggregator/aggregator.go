// Package aggregator computes fixed-window metrics from the buffered event
// stream and emits batch payloads ready for upload.
package aggregator

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"runtime"
	"sync"
	"time"

	"github.com/extraction/desktop-agent/internal/classifier"
	"github.com/extraction/desktop-agent/internal/events"
	"github.com/extraction/desktop-agent/internal/storage"
)

// WindowMetrics is the aggregated record for a single time window.
type WindowMetrics struct {
	PeriodStart          time.Time `json:"periodStart"`
	PeriodEnd            time.Time `json:"periodEnd"`
	RoundID              string    `json:"roundId,omitempty"`
	TotalFocusMinutes    float64   `json:"totalFocusMinutes"`
	AppSwitches          int       `json:"appSwitches"`
	IdleMinutes          float64   `json:"idleMinutes"`
	ProductiveAppsActive []string  `json:"productiveAppsActive"`
	DistractionsDetected int       `json:"distractionsDetected"`
	GitCommits           int       `json:"gitCommits"`
	TerminalCommandCount int       `json:"terminalCommandCount"`
	EventCount           int       `json:"eventCount"`
}

// BatchPayload is the JSON shape uploaded to /telemetry/batch.
type BatchPayload struct {
	Source       string          `json:"source"`
	DeviceID     string          `json:"deviceId"`
	AgentVersion string          `json:"agentVersion"`
	OS           string          `json:"os"`
	GeneratedAt  time.Time       `json:"generatedAt"`
	Windows      []WindowMetrics `json:"windows"`
}

// RoundIDFn returns the active round ID (or "" + false).
type RoundIDFn func() (string, bool)

// Counters exposes simple "events this run" totals to the tray. Read with
// Snapshot.
type Counters struct {
	mu           sync.Mutex
	WindowsToday int
	FocusMinutes float64
	Distractions int
	GitCommits   int
}

// Snapshot returns a copy of the counter values.
func (c *Counters) Snapshot() (windows int, focus float64, distractions, commits int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.WindowsToday, c.FocusMinutes, c.Distractions, c.GitCommits
}

func (c *Counters) add(focus float64, distractions, commits int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.WindowsToday++
	c.FocusMinutes += focus
	c.Distractions += distractions
	c.GitCommits += commits
}

// Aggregator runs as a goroutine, periodically pulling classified events and
// inserting a BatchPayload into the storage batch queue.
type Aggregator struct {
	Store        *storage.Store
	Window       time.Duration
	DeviceID     string
	AgentVersion string
	Rounds       RoundIDFn
	Counters     *Counters
}

// New returns an Aggregator wired to the given store.
func New(store *storage.Store, window time.Duration, deviceID, agentVersion string) *Aggregator {
	if window <= 0 {
		window = 5 * time.Minute
	}
	return &Aggregator{
		Store:        store,
		Window:       window,
		DeviceID:     deviceID,
		AgentVersion: agentVersion,
		Counters:     &Counters{},
	}
}

// WithRounds enables round-id tagging.
func (a *Aggregator) WithRounds(fn RoundIDFn) *Aggregator { a.Rounds = fn; return a }

// Run blocks until ctx is cancelled, aggregating one window each tick.
func (a *Aggregator) Run(ctx context.Context, log *slog.Logger) error {
	log = log.With("component", "aggregator", "window", a.Window.String())
	tick := time.NewTicker(a.Window)
	defer tick.Stop()

	// Track the last computed window so we don't skip ahead during outages.
	windowEnd := time.Now().UTC().Truncate(a.Window)

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-tick.C:
		}

		now := time.Now().UTC()
		// Aggregate every completed window strictly before "now".
		for windowEnd.Add(a.Window).Before(now) || windowEnd.Add(a.Window).Equal(now) {
			start := windowEnd
			end := windowEnd.Add(a.Window)
			if err := a.aggregateWindow(ctx, log, start, end); err != nil {
				log.Warn("aggregate window failed", "error", err,
					"start", start, "end", end)
				break
			}
			windowEnd = end
		}
	}
}

// aggregateWindow computes metrics for [start, end) and pushes a payload.
func (a *Aggregator) aggregateWindow(ctx context.Context, log *slog.Logger, start, end time.Time) error {
	evs, err := a.Store.FetchClassifiedSince(ctx, start, end)
	if err != nil {
		return fmt.Errorf("fetch window: %w", err)
	}
	if len(evs) == 0 {
		return nil
	}

	metrics := computeMetrics(start, end, evs)

	if a.Rounds != nil {
		if id, ok := a.Rounds(); ok {
			metrics.RoundID = id
		}
	}

	if a.Counters != nil {
		a.Counters.add(metrics.TotalFocusMinutes, metrics.DistractionsDetected, metrics.GitCommits)
	}

	payload := BatchPayload{
		Source:       "desktop",
		DeviceID:     a.DeviceID,
		AgentVersion: a.AgentVersion,
		OS:           runtime.GOOS,
		GeneratedAt:  time.Now().UTC(),
		Windows:      []WindowMetrics{metrics},
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}

	id, err := a.Store.EnqueueBatch(ctx, data)
	if err != nil {
		return fmt.Errorf("enqueue batch: %w", err)
	}

	ids := make([]int64, 0, len(evs))
	for _, e := range evs {
		ids = append(ids, e.Event.ID)
	}
	if err := a.Store.MarkAggregated(ctx, ids); err != nil {
		log.Warn("mark aggregated failed", "error", err)
	}

	log.Info("window aggregated",
		"batch_id", id,
		"events", len(evs),
		"start", start,
		"end", end,
		"focus_minutes", metrics.TotalFocusMinutes,
		"distractions", metrics.DistractionsDetected,
	)
	return nil
}

func computeMetrics(start, end time.Time, evs []events.ClassifiedEvent) WindowMetrics {
	m := WindowMetrics{
		PeriodStart:          start,
		PeriodEnd:            end,
		ProductiveAppsActive: []string{},
		EventCount:           len(evs),
	}
	seenProductiveApps := make(map[string]struct{})

	var idleMs int64
	var idleStart time.Time
	inIdle := false

	for _, ce := range evs {
		switch ce.Event.Type {
		case events.EventAppSwitched:
			m.AppSwitches++
			var p events.AppSwitched
			_ = json.Unmarshal(ce.Event.Data, &p)
			if ce.IsProductive && p.ToApp != "" {
				if _, ok := seenProductiveApps[p.ToApp]; !ok {
					seenProductiveApps[p.ToApp] = struct{}{}
					m.ProductiveAppsActive = append(m.ProductiveAppsActive, p.ToApp)
				}
			}
			if ce.Category == classifier.CategoryDistraction {
				m.DistractionsDetected++
			}
			// Focus minutes: count focus duration on the previous app.
			if p.FocusDurationMs > 0 {
				m.TotalFocusMinutes += float64(p.FocusDurationMs) / 60000.0
			}

		case events.EventIdleDetected:
			if !inIdle {
				inIdle = true
				idleStart = ce.Event.Timestamp
			}
		case events.EventIdleEnded:
			if inIdle {
				inIdle = false
				idleMs += ce.Event.Timestamp.Sub(idleStart).Milliseconds()
			}

		case events.EventGitCommit:
			m.GitCommits++

		case events.EventTerminalActive:
			m.TerminalCommandCount++
		}
	}

	// If still idle at window end, count remainder.
	if inIdle {
		if idleStart.Before(start) {
			idleStart = start
		}
		idleMs += end.Sub(idleStart).Milliseconds()
	}

	m.IdleMinutes = float64(idleMs) / 60000.0
	return m
}
