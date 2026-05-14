package storage

import (
	"context"
	"testing"
	"time"

	"github.com/extraction/desktop-agent/internal/events"
)

func TestStore_Roundtrip(t *testing.T) {
	dir := t.TempDir()
	s, err := Open(dir)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer s.Close()

	ctx := context.Background()

	ev, err := events.NewEvent(events.EventGitCommit, events.GitCommit{
		CommitHash:   "deadbeef",
		Message:      "feat: thing",
		FilesChanged: 3,
	})
	if err != nil {
		t.Fatal(err)
	}
	id, err := s.InsertRaw(ctx, ev)
	if err != nil {
		t.Fatalf("insert raw: %v", err)
	}
	if id == 0 {
		t.Fatal("expected non-zero id")
	}

	unclassified, err := s.FetchUnclassified(ctx, 10)
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if len(unclassified) != 1 {
		t.Fatalf("expected 1 unclassified, got %d", len(unclassified))
	}

	classified := events.ClassifiedEvent{
		Event:           unclassified[0],
		IsProductive:    true,
		Category:        "development",
		ConfidenceScore: 0.9,
		SignalType:      "git",
	}
	if err := s.SaveClassification(ctx, classified); err != nil {
		t.Fatalf("save: %v", err)
	}

	again, err := s.FetchUnclassified(ctx, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(again) != 0 {
		t.Fatalf("expected 0 unclassified after save, got %d", len(again))
	}

	since, err := s.FetchClassifiedSince(ctx, time.Now().Add(-time.Hour), time.Now().Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if len(since) != 1 {
		t.Fatalf("expected 1 classified, got %d", len(since))
	}

	batchID, err := s.EnqueueBatch(ctx, []byte(`{"x":1}`))
	if err != nil {
		t.Fatal(err)
	}
	pending, err := s.PendingBatches(ctx, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(pending) != 1 || pending[0].ID != batchID {
		t.Fatalf("expected 1 pending batch with id %d, got %+v", batchID, pending)
	}
	if err := s.MarkUploaded(ctx, batchID); err != nil {
		t.Fatal(err)
	}
	pending, _ = s.PendingBatches(ctx, 10)
	if len(pending) != 0 {
		t.Fatalf("expected 0 pending after upload, got %d", len(pending))
	}
}
