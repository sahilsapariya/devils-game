// Package storage implements the SQLite-backed event buffer used by the
// agent. The buffer survives restarts, supports offline operation, and is
// pruned automatically to keep disk usage small.
package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"path/filepath"
	"time"

	_ "github.com/mattn/go-sqlite3"

	"github.com/extraction/desktop-agent/internal/events"
)

// Store wraps the SQLite handle plus a few helpers. It is safe for concurrent
// use by multiple goroutines (sql.DB does its own pooling and SQLite is in
// WAL mode).
type Store struct {
	db *sql.DB
}

// Open initialises the SQLite buffer at dataDir/buffer.db and applies the
// schema. The caller must call Close when shutting down.
func Open(dataDir string) (*Store, error) {
	path := filepath.Join(dataDir, "buffer.db")
	dsn := fmt.Sprintf("file:%s?_journal=WAL&_busy_timeout=5000&_fk=1", path)
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(1) // SQLite serializes writes anyway; avoid file locking surprises.

	s := &Store{db: db}
	if err := s.init(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return s, nil
}

// Close releases the underlying SQLite handle.
func (s *Store) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *Store) init() error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS raw_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            event_data_json TEXT NOT NULL,
            classified INTEGER NOT NULL DEFAULT 0,
            uploaded INTEGER NOT NULL DEFAULT 0
        )`,
		`CREATE INDEX IF NOT EXISTS idx_raw_events_unclassified
            ON raw_events(classified, id)`,
		`CREATE INDEX IF NOT EXISTS idx_raw_events_timestamp
            ON raw_events(timestamp)`,
		`CREATE TABLE IF NOT EXISTS classified_events (
            event_id INTEGER PRIMARY KEY,
            category TEXT NOT NULL,
            is_productive INTEGER NOT NULL,
            confidence REAL NOT NULL,
            signal_type TEXT NOT NULL,
            aggregated INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (event_id) REFERENCES raw_events(id) ON DELETE CASCADE
        )`,
		`CREATE INDEX IF NOT EXISTS idx_classified_unaggregated
            ON classified_events(aggregated, event_id)`,
		`CREATE TABLE IF NOT EXISTS batch_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            batch_data_json TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            uploaded_at INTEGER,
            retry_count INTEGER NOT NULL DEFAULT 0,
            last_error TEXT
        )`,
		`CREATE INDEX IF NOT EXISTS idx_batch_queue_pending
            ON batch_queue(uploaded_at, id)`,
	}
	for _, q := range stmts {
		if _, err := s.db.Exec(q); err != nil {
			return fmt.Errorf("init schema (%q): %w", q[:32], err)
		}
	}
	return nil
}

// InsertRaw persists a raw event and returns its assigned ID.
func (s *Store) InsertRaw(ctx context.Context, e events.Event) (int64, error) {
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO raw_events(timestamp, event_type, event_data_json)
            VALUES (?, ?, ?)`,
		e.Timestamp.UTC().UnixMilli(), string(e.Type), string(e.Data),
	)
	if err != nil {
		return 0, fmt.Errorf("insert raw event: %w", err)
	}
	return res.LastInsertId()
}

// Submit is the Sink implementation used by collectors.
func (s *Store) Submit(ctx context.Context, e events.Event) error {
	_, err := s.InsertRaw(ctx, e)
	return err
}

// FetchUnclassified returns up to limit unclassified events ordered by id.
func (s *Store) FetchUnclassified(ctx context.Context, limit int) ([]events.Event, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, timestamp, event_type, event_data_json
            FROM raw_events WHERE classified = 0 ORDER BY id LIMIT ?`,
		limit,
	)
	if err != nil {
		return nil, fmt.Errorf("query unclassified: %w", err)
	}
	defer rows.Close()

	var out []events.Event
	for rows.Next() {
		var (
			id     int64
			tsMs   int64
			etype  string
			data   string
		)
		if err := rows.Scan(&id, &tsMs, &etype, &data); err != nil {
			return nil, err
		}
		out = append(out, events.Event{
			ID:        id,
			Timestamp: time.UnixMilli(tsMs).UTC(),
			Type:      events.EventType(etype),
			Data:      json.RawMessage(data),
		})
	}
	return out, rows.Err()
}

// SaveClassification writes a classifier result and marks the raw event
// as classified in a single transaction.
func (s *Store) SaveClassification(ctx context.Context, c events.ClassifiedEvent) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck

	if _, err := tx.ExecContext(ctx,
		`INSERT OR REPLACE INTO classified_events(event_id, category, is_productive, confidence, signal_type)
            VALUES (?, ?, ?, ?, ?)`,
		c.Event.ID, c.Category, boolToInt(c.IsProductive), c.ConfidenceScore, c.SignalType,
	); err != nil {
		return fmt.Errorf("insert classification: %w", err)
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE raw_events SET classified = 1 WHERE id = ?`, c.Event.ID,
	); err != nil {
		return fmt.Errorf("mark classified: %w", err)
	}
	return tx.Commit()
}

// FetchClassifiedSince returns all classified events in the given window
// (timestamps inclusive of start, exclusive of end).
func (s *Store) FetchClassifiedSince(ctx context.Context, start, end time.Time) ([]events.ClassifiedEvent, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT r.id, r.timestamp, r.event_type, r.event_data_json,
                c.category, c.is_productive, c.confidence, c.signal_type
           FROM raw_events r
           JOIN classified_events c ON c.event_id = r.id
           WHERE r.timestamp >= ? AND r.timestamp < ?
           ORDER BY r.timestamp`,
		start.UTC().UnixMilli(), end.UTC().UnixMilli(),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []events.ClassifiedEvent
	for rows.Next() {
		var (
			id      int64
			tsMs    int64
			etype   string
			data    string
			cat     string
			prodInt int
			conf    float64
			signal  string
		)
		if err := rows.Scan(&id, &tsMs, &etype, &data, &cat, &prodInt, &conf, &signal); err != nil {
			return nil, err
		}
		out = append(out, events.ClassifiedEvent{
			Event: events.Event{
				ID:        id,
				Timestamp: time.UnixMilli(tsMs).UTC(),
				Type:      events.EventType(etype),
				Data:      json.RawMessage(data),
			},
			Category:        cat,
			IsProductive:    prodInt != 0,
			ConfidenceScore: conf,
			SignalType:      signal,
		})
	}
	return out, rows.Err()
}

// MarkAggregated flags the given classified events as included in a batch.
func (s *Store) MarkAggregated(ctx context.Context, ids []int64) error {
	if len(ids) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck

	for _, id := range ids {
		if _, err := tx.ExecContext(ctx,
			`UPDATE classified_events SET aggregated = 1 WHERE event_id = ?`, id,
		); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// EnqueueBatch persists a batch JSON payload for upload.
func (s *Store) EnqueueBatch(ctx context.Context, payload []byte) (int64, error) {
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO batch_queue(batch_data_json, created_at) VALUES (?, ?)`,
		string(payload), time.Now().UTC().UnixMilli(),
	)
	if err != nil {
		return 0, fmt.Errorf("enqueue batch: %w", err)
	}
	return res.LastInsertId()
}

// PendingBatch represents a queued batch awaiting upload.
type PendingBatch struct {
	ID         int64
	Payload    []byte
	CreatedAt  time.Time
	RetryCount int
}

// PendingBatches returns up to limit unuploaded batches ordered by creation.
func (s *Store) PendingBatches(ctx context.Context, limit int) ([]PendingBatch, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, batch_data_json, created_at, retry_count
           FROM batch_queue
           WHERE uploaded_at IS NULL
           ORDER BY id
           LIMIT ?`,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []PendingBatch
	for rows.Next() {
		var (
			id       int64
			payload  string
			createMs int64
			retries  int
		)
		if err := rows.Scan(&id, &payload, &createMs, &retries); err != nil {
			return nil, err
		}
		out = append(out, PendingBatch{
			ID:         id,
			Payload:    []byte(payload),
			CreatedAt:  time.UnixMilli(createMs).UTC(),
			RetryCount: retries,
		})
	}
	return out, rows.Err()
}

// MarkUploaded marks a batch as successfully uploaded.
func (s *Store) MarkUploaded(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE batch_queue SET uploaded_at = ? WHERE id = ?`,
		time.Now().UTC().UnixMilli(), id,
	)
	return err
}

// RecordBatchFailure increments retry_count and records the last error.
func (s *Store) RecordBatchFailure(ctx context.Context, id int64, errMsg string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE batch_queue SET retry_count = retry_count + 1, last_error = ? WHERE id = ?`,
		errMsg, id,
	)
	return err
}

// CleanupOld deletes uploaded batches and raw events older than the given age.
// Returns the number of deleted raw events and batches.
func (s *Store) CleanupOld(ctx context.Context, age time.Duration) (int64, int64, error) {
	cutoffMs := time.Now().Add(-age).UTC().UnixMilli()

	res, err := s.db.ExecContext(ctx,
		`DELETE FROM raw_events WHERE timestamp < ?`, cutoffMs,
	)
	if err != nil {
		return 0, 0, fmt.Errorf("cleanup raw events: %w", err)
	}
	rawDel, _ := res.RowsAffected()

	res, err = s.db.ExecContext(ctx,
		`DELETE FROM batch_queue WHERE uploaded_at IS NOT NULL AND uploaded_at < ?`,
		cutoffMs,
	)
	if err != nil {
		return rawDel, 0, fmt.Errorf("cleanup batches: %w", err)
	}
	batchDel, _ := res.RowsAffected()

	return rawDel, batchDel, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
