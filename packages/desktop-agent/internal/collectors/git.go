package collectors

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/extraction/desktop-agent/internal/events"
)

// GitCollector runs a tiny HTTP server on localhost that listens for
// post-commit hook callbacks. Each callback is translated into a git_commit
// event. We never read diffs or working-tree contents — the hook script is
// expected to pass commit metadata only (hash, message, files-changed count).
type GitCollector struct {
	Port int
}

// NewGitCollector creates a git collector listening on the given local port.
func NewGitCollector(port int) *GitCollector {
	if port <= 0 {
		port = 7890
	}
	return &GitCollector{Port: port}
}

func (c *GitCollector) Name() string { return "git" }

// gitHookPayload is the JSON shape the post-commit hook posts.
type gitHookPayload struct {
	CommitHash   string `json:"commitHash"`
	Message      string `json:"message"`
	FilesChanged int    `json:"filesChanged"`
	RepoName     string `json:"repoName,omitempty"`
	Branch       string `json:"branch,omitempty"`
}

func (c *GitCollector) Run(ctx context.Context, sink Sink, log *slog.Logger) error {
	log = log.With("collector", c.Name(), "port", c.Port)

	mux := http.NewServeMux()
	mux.HandleFunc("/git-event", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		defer r.Body.Close()

		var p gitHookPayload
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		if p.CommitHash == "" {
			http.Error(w, "commitHash required", http.StatusBadRequest)
			return
		}

		ev, err := events.NewEvent(events.EventGitCommit, events.GitCommit{
			CommitHash:   p.CommitHash,
			Message:      p.Message,
			FilesChanged: p.FilesChanged,
			RepoName:     p.RepoName,
			Branch:       p.Branch,
		})
		if err != nil {
			http.Error(w, "encode failed", http.StatusInternalServerError)
			return
		}
		if err := sink.Submit(r.Context(), ev); err != nil {
			log.Warn("submit git_commit failed", "error", err)
			http.Error(w, "queue failed", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	srv := &http.Server{
		Addr:              fmt.Sprintf("127.0.0.1:%d", c.Port),
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	listener, err := net.Listen("tcp", srv.Addr)
	if err != nil {
		return fmt.Errorf("git hook server listen: %w", err)
	}

	errCh := make(chan error, 1)
	go func() {
		log.Info("git hook server started", "addr", srv.Addr)
		err := srv.Serve(listener)
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
			return
		}
		errCh <- nil
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
		return nil
	case err := <-errCh:
		return err
	}
}
