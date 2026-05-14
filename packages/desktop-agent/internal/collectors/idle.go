package collectors

import (
	"context"
	"errors"
	"log/slog"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/extraction/desktop-agent/internal/events"
)

// IdleCollector polls the system idle time and emits idle_detected /
// idle_ended events when the user crosses the configured threshold.
//
// On macOS we use `ioreg` to read IOHIDIdleTime; this avoids cgo and works
// with no special permissions.
type IdleCollector struct {
	Threshold    time.Duration
	PollInterval time.Duration
}

func NewIdleCollector(threshold, poll time.Duration) *IdleCollector {
	if threshold <= 0 {
		threshold = 5 * time.Minute
	}
	if poll <= 0 {
		poll = 5 * time.Second
	}
	return &IdleCollector{Threshold: threshold, PollInterval: poll}
}

func (c *IdleCollector) Name() string { return "idle" }

func (c *IdleCollector) Run(ctx context.Context, sink Sink, log *slog.Logger) error {
	log = log.With("collector", c.Name())

	var (
		inIdleState bool
		idleStart   time.Time
		warned      bool
	)

	tick := time.NewTicker(c.PollInterval)
	defer tick.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-tick.C:
		}

		idle, err := systemIdleDuration(ctx)
		if err != nil {
			if !warned {
				log.Warn("idle time lookup failed; will retry silently", "error", err)
				warned = true
			}
			continue
		}
		warned = false

		switch {
		case !inIdleState && idle >= c.Threshold:
			inIdleState = true
			idleStart = time.Now().Add(-idle)
			ev, err := events.NewEvent(events.EventIdleDetected, events.IdleDetected{
				IdleMs: idle.Milliseconds(),
			})
			if err == nil {
				if err := sink.Submit(ctx, ev); err != nil {
					log.Warn("submit idle_detected failed", "error", err)
				}
			}
		case inIdleState && idle < c.PollInterval:
			// User became active again (idle time reset close to zero).
			inIdleState = false
			total := time.Since(idleStart)
			ev, err := events.NewEvent(events.EventIdleEnded, events.IdleEnded{
				TotalIdleMs: total.Milliseconds(),
			})
			if err == nil {
				if err := sink.Submit(ctx, ev); err != nil {
					log.Warn("submit idle_ended failed", "error", err)
				}
			}
		}
	}
}

// systemIdleDuration returns the user's current idle time.
func systemIdleDuration(ctx context.Context) (time.Duration, error) {
	if runtime.GOOS != "darwin" {
		return 0, errors.New("idle detection only implemented for darwin")
	}
	cctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	// `ioreg -c IOHIDSystem` includes a HIDIdleTime field in nanoseconds.
	out, err := exec.CommandContext(cctx, "ioreg", "-c", "IOHIDSystem").Output()
	if err != nil {
		return 0, err
	}
	for _, line := range strings.Split(string(out), "\n") {
		if !strings.Contains(line, "HIDIdleTime") {
			continue
		}
		// Line is like:  | |   "HIDIdleTime" = 12345678
		idx := strings.LastIndex(line, "=")
		if idx < 0 {
			continue
		}
		raw := strings.TrimSpace(line[idx+1:])
		ns, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			continue
		}
		return time.Duration(ns), nil
	}
	return 0, errors.New("HIDIdleTime not found in ioreg output")
}
