// Package collectors implements the activity collectors that produce raw
// Events for the rest of the pipeline. Each collector exposes a Run method
// that blocks until ctx is cancelled.
package collectors

import (
	"context"
	"log/slog"

	"github.com/extraction/desktop-agent/internal/events"
)

// Sink is the destination every collector writes to. It is implemented by the
// storage layer (and by simple channels in tests).
type Sink interface {
	Submit(ctx context.Context, e events.Event) error
}

// Collector is the small interface a collector must satisfy to be wired into
// the main loop.
type Collector interface {
	Name() string
	Run(ctx context.Context, sink Sink, log *slog.Logger) error
}
