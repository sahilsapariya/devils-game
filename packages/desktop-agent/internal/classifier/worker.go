package classifier

import (
	"context"
	"log/slog"
	"time"

	"github.com/extraction/desktop-agent/internal/storage"
)

// Worker polls the store for unclassified events and writes classifications
// back. It runs as a goroutine driven by a small ticker.
type Worker struct {
	Store      *storage.Store
	Classifier *Classifier
	Interval   time.Duration
	BatchSize  int
}

// NewWorker wires up a classifier worker.
func NewWorker(store *storage.Store, interval time.Duration, batchSize int) *Worker {
	if interval <= 0 {
		interval = 2 * time.Second
	}
	if batchSize <= 0 {
		batchSize = 200
	}
	return &Worker{
		Store:      store,
		Classifier: New(),
		Interval:   interval,
		BatchSize:  batchSize,
	}
}

// Run blocks until ctx is cancelled.
func (w *Worker) Run(ctx context.Context, log *slog.Logger) error {
	log = log.With("component", "classifier-worker")
	tick := time.NewTicker(w.Interval)
	defer tick.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-tick.C:
		}

		evs, err := w.Store.FetchUnclassified(ctx, w.BatchSize)
		if err != nil {
			log.Warn("fetch unclassified failed", "error", err)
			continue
		}
		for _, ev := range evs {
			ce := w.Classifier.Classify(ev)
			if err := w.Store.SaveClassification(ctx, ce); err != nil {
				log.Warn("save classification failed", "error", err, "event_id", ev.ID)
			}
		}
	}
}
