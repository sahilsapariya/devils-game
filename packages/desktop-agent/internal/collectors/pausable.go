package collectors

import (
	"context"

	"github.com/extraction/desktop-agent/internal/events"
)

// PauseChecker reports whether collection is currently paused.
type PauseChecker interface {
	Paused() bool
}

// PausableSink wraps an underlying Sink and silently drops events while the
// associated PauseChecker reports Paused() == true. This lets the tray
// "Pause Collection" toggle suppress new data without tearing down collectors.
type PausableSink struct {
	Underlying Sink
	Checker    PauseChecker
}

// Submit routes the event to Underlying unless paused.
func (p *PausableSink) Submit(ctx context.Context, e events.Event) error {
	if p.Checker != nil && p.Checker.Paused() {
		return nil
	}
	return p.Underlying.Submit(ctx, e)
}
