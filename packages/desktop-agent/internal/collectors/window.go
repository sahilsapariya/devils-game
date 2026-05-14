package collectors

import (
	"context"
	"errors"
	"log/slog"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/extraction/desktop-agent/internal/events"
)

// WindowCollector polls the OS for the currently focused application and emits
// an app_switched event whenever the focused app changes.
//
// On macOS this shells out to `osascript` (AppleScript) which only requires
// the user to grant Automation permission to the agent. We deliberately avoid
// cgo + CGWindowListCopyWindowInfo here so the project builds cleanly without
// linking against Apple frameworks; if cgo is later enabled, this file can be
// swapped for a build-tag variant.
type WindowCollector struct {
	Interval time.Duration
}

func NewWindowCollector(interval time.Duration) *WindowCollector {
	if interval <= 0 {
		interval = 2 * time.Second
	}
	return &WindowCollector{Interval: interval}
}

func (c *WindowCollector) Name() string { return "window" }

func (c *WindowCollector) Run(ctx context.Context, sink Sink, log *slog.Logger) error {
	log = log.With("collector", c.Name())

	var (
		prevApp   string
		prevSince = time.Now()
		warned    bool
	)

	tick := time.NewTicker(c.Interval)
	defer tick.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-tick.C:
		}

		app, err := activeAppName(ctx)
		if err != nil {
			if !warned {
				log.Warn("active window lookup failed; will retry silently",
					"error", err)
				warned = true
			}
			continue
		}
		warned = false
		if app == "" {
			continue
		}

		if prevApp == "" {
			prevApp = app
			prevSince = time.Now()
			continue
		}

		if app != prevApp {
			now := time.Now()
			focusMs := now.Sub(prevSince).Milliseconds()
			ev, err := events.NewEvent(events.EventAppSwitched, events.AppSwitched{
				FromApp:         prevApp,
				ToApp:           app,
				FocusDurationMs: focusMs,
			})
			if err != nil {
				log.Warn("encode app_switched failed", "error", err)
			} else if err := sink.Submit(ctx, ev); err != nil {
				log.Warn("submit app_switched failed", "error", err)
			}
			prevApp = app
			prevSince = now
		}
	}
}

// activeAppName returns the currently focused application name. Returns an
// empty string and no error if no app could be determined but the platform is
// supported.
func activeAppName(ctx context.Context) (string, error) {
	if runtime.GOOS != "darwin" {
		return "", errors.New("active window detection only implemented for darwin")
	}
	cctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	out, err := exec.CommandContext(cctx, "osascript", "-e",
		`tell application "System Events" to get name of first application process whose frontmost is true`,
	).Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}
