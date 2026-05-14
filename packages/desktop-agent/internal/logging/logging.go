// Package logging centralises slog setup so every component shares a single
// configured logger.
package logging

import (
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
)

// New returns a JSON-structured slog.Logger at the given level. Unknown levels
// fall back to info. Output goes to stderr only.
func New(levelName string) *slog.Logger {
	return NewWithFile(levelName, "")
}

// NewWithFile returns a logger that tees to both stderr and the given file
// path (parent directory is created if missing). If logFile is empty or
// cannot be opened, output falls back to stderr alone.
func NewWithFile(levelName, logFile string) *slog.Logger {
	var lvl slog.Level
	switch strings.ToLower(levelName) {
	case "debug":
		lvl = slog.LevelDebug
	case "warn", "warning":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}

	var w io.Writer = os.Stderr
	if logFile != "" {
		if err := os.MkdirAll(filepath.Dir(logFile), 0o755); err == nil {
			if f, err := os.OpenFile(logFile,
				os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600); err == nil {
				w = io.MultiWriter(os.Stderr, f)
			}
		}
	}

	handler := slog.NewJSONHandler(w, &slog.HandlerOptions{Level: lvl})
	return slog.New(handler)
}
