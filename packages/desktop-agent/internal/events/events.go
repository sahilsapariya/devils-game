// Package events defines the canonical event types emitted by collectors and
// consumed by the classifier, storage layer, aggregator, and uploader.
//
// These types intentionally carry METADATA only — no keystrokes, no clipboard
// contents, no command arguments, no file contents.
package events

import (
	"encoding/json"
	"time"
)

// EventType is the discriminator for a raw event payload.
type EventType string

const (
	EventAppSwitched     EventType = "app_switched"
	EventIdleDetected    EventType = "idle_detected"
	EventIdleEnded       EventType = "idle_ended"
	EventTerminalActive  EventType = "terminal_activity"
	EventGitCommit       EventType = "git_commit"
)

// Event is the raw collector output. EventData is a polymorphic payload keyed
// by Type — it is marshalled as JSON for SQLite storage and for upload.
type Event struct {
	ID        int64           `json:"id,omitempty"`
	Timestamp time.Time       `json:"timestamp"`
	Type      EventType       `json:"type"`
	Data      json.RawMessage `json:"data"`
}

// AppSwitched fires when the active window changes from one app to another.
// FocusDurationMs is how long FromApp was focused before the switch.
type AppSwitched struct {
	FromApp         string `json:"fromApp"`
	ToApp           string `json:"toApp"`
	FocusDurationMs int64  `json:"focusDurationMs"`
}

// IdleDetected fires once when continuous idle time exceeds the configured
// threshold.
type IdleDetected struct {
	IdleMs int64 `json:"idleMs"`
}

// IdleEnded fires when activity resumes after a previously-detected idle period.
type IdleEnded struct {
	TotalIdleMs int64 `json:"totalIdleMs"`
}

// TerminalActivity is emitted when a known development command is observed
// running. We deliberately store the COMMAND TYPE (e.g. "git", "npm") and
// not the argv tail.
type TerminalActivity struct {
	CommandType   string `json:"commandType"`
	WasSuccessful bool   `json:"wasSuccessful"`
}

// GitCommit is emitted when a post-commit hook posts to the agent's local
// server. FilesChanged is a count — file paths and diffs are never stored.
type GitCommit struct {
	CommitHash   string `json:"commitHash"`
	Message      string `json:"message"`
	FilesChanged int    `json:"filesChanged"`
	RepoName     string `json:"repoName,omitempty"`
	Branch       string `json:"branch,omitempty"`
}

// ClassifiedEvent decorates a raw event with classifier output.
type ClassifiedEvent struct {
	Event           Event   `json:"event"`
	IsProductive    bool    `json:"isProductive"`
	Category        string  `json:"category"`
	ConfidenceScore float64 `json:"confidenceScore"`
	SignalType      string  `json:"signalType"`
}

// EncodeData is a small helper for constructing Event values from typed payloads.
func EncodeData(v any) (json.RawMessage, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(b), nil
}

// NewEvent builds an Event with the current timestamp.
func NewEvent(t EventType, payload any) (Event, error) {
	data, err := EncodeData(payload)
	if err != nil {
		return Event{}, err
	}
	return Event{
		Timestamp: time.Now().UTC(),
		Type:      t,
		Data:      data,
	}, nil
}
