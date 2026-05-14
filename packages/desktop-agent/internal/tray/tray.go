// Package tray exposes a small wrapper around getlantern/systray. The agent
// uses the tray to surface its status (collecting / paused / offline), show
// round / stat info, pause or resume telemetry, open the log file location,
// and quit.
package tray

import (
	"context"
	"fmt"
	"log/slog"
	"os/exec"
	"runtime"
	"sync/atomic"
	"time"

	"github.com/getlantern/systray"
)

// State describes what the tray indicator is currently displaying.
type State int32

const (
	StateCollecting State = iota
	StatePaused
	StateOffline
)

// String makes State human readable.
func (s State) String() string {
	switch s {
	case StateCollecting:
		return "collecting"
	case StatePaused:
		return "paused"
	case StateOffline:
		return "offline"
	}
	return "unknown"
}

// RoundProvider exposes the data the tray needs to render the active-round
// line. The second return is false when there's no active round.
type RoundProvider interface {
	Current() (id, state string, remaining time.Duration, ok bool)
}

// StatsProvider exposes today's running counters.
type StatsProvider interface {
	Snapshot() (windows int, focusMinutes float64, distractions, commits int)
}

// Controller exposes the runtime controls used by the main loop to react to
// tray actions. The values are read by the collectors / uploader via Paused().
type Controller struct {
	state    atomic.Int32
	paused   atomic.Bool
	dataDir  string
	logFile  string
	dashURL  string
	log      *slog.Logger
	cancelFn context.CancelFunc

	rounds RoundProvider
	stats  StatsProvider
}

// Options bundles construction params so we can grow the tray without
// breaking call-sites.
type Options struct {
	DataDir      string
	LogFile      string
	DashboardURL string
	Rounds       RoundProvider
	Stats        StatsProvider
}

// NewController returns a controller whose initial state is "collecting".
func NewController(opts Options, log *slog.Logger, cancel context.CancelFunc) *Controller {
	c := &Controller{
		dataDir:  opts.DataDir,
		logFile:  opts.LogFile,
		dashURL:  opts.DashboardURL,
		log:      log,
		cancelFn: cancel,
		rounds:   opts.Rounds,
		stats:    opts.Stats,
	}
	c.state.Store(int32(StateCollecting))
	return c
}

// SetState updates the visible status.
func (c *Controller) SetState(s State) { c.state.Store(int32(s)) }

// State returns the current state.
func (c *Controller) State() State { return State(c.state.Load()) }

// Paused reports whether the user has paused collection.
func (c *Controller) Paused() bool { return c.paused.Load() }

// Run blocks the calling goroutine inside the platform's GUI loop.
func (c *Controller) Run(onReady, onExit func()) {
	systray.Run(onReady, onExit)
}

// BuildMenu populates the tray menu. Should be called from onReady.
func (c *Controller) BuildMenu() {
	systray.SetTitle("EX")
	systray.SetTooltip("PROJECT EXTRACTION — Desktop Agent")

	mStatus := systray.AddMenuItem(c.statusLabel(), "Current agent status")
	mStatus.Disable()
	mRound := systray.AddMenuItem(c.roundLabel(), "Active round info")
	mRound.Disable()
	mStats := systray.AddMenuItem(c.statsLabel(), "Telemetry counters since startup")
	mStats.Disable()
	systray.AddSeparator()

	mPause := systray.AddMenuItem("Pause Collection", "Stop submitting events")
	mResume := systray.AddMenuItem("Resume Collection", "Resume submitting events")
	mResume.Hide()

	systray.AddSeparator()
	mDash := systray.AddMenuItem("Open Backend Dashboard", "Open the web dashboard in your browser")
	mLogs := systray.AddMenuItem("View Logs", "Open the agent log file")
	mFolder := systray.AddMenuItem("Open Data Folder", "Open the SQLite buffer directory")
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("Quit", "Stop the agent")

	// Background ticker refreshes the round + stats labels every 5s.
	stop := make(chan struct{})
	go func() {
		t := time.NewTicker(5 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-stop:
				return
			case <-t.C:
				mStatus.SetTitle(c.statusLabel())
				mRound.SetTitle(c.roundLabel())
				mStats.SetTitle(c.statsLabel())
			}
		}
	}()

	go func() {
		for {
			select {
			case <-mPause.ClickedCh:
				c.paused.Store(true)
				c.SetState(StatePaused)
				mStatus.SetTitle(c.statusLabel())
				mPause.Hide()
				mResume.Show()
				c.log.Info("collection paused via tray")

			case <-mResume.ClickedCh:
				c.paused.Store(false)
				c.SetState(StateCollecting)
				mStatus.SetTitle(c.statusLabel())
				mResume.Hide()
				mPause.Show()
				c.log.Info("collection resumed via tray")

			case <-mDash.ClickedCh:
				url := c.dashURL
				if url == "" {
					url = "http://localhost:3001"
				}
				if err := openURL(url); err != nil {
					c.log.Warn("open dashboard failed", "error", err)
				}

			case <-mLogs.ClickedCh:
				path := c.logFile
				if path == "" {
					path = c.dataDir
				}
				if err := openPath(path); err != nil {
					c.log.Warn("open logs failed", "error", err)
				}

			case <-mFolder.ClickedCh:
				if err := openPath(c.dataDir); err != nil {
					c.log.Warn("open data folder failed", "error", err)
				}

			case <-mQuit.ClickedCh:
				c.log.Info("quit requested via tray")
				close(stop)
				if c.cancelFn != nil {
					c.cancelFn()
				}
				systray.Quit()
				return
			}
		}
	}()
}

func (c *Controller) statusLabel() string {
	return fmt.Sprintf("Status: %s", c.State())
}

func (c *Controller) roundLabel() string {
	if c.rounds == nil {
		return "Round: idle"
	}
	id, state, remaining, ok := c.rounds.Current()
	if !ok {
		return "Round: idle"
	}
	stateUpper := state
	if stateUpper == "" {
		stateUpper = "ACTIVE"
	}
	if remaining > 0 {
		return fmt.Sprintf("%s — %s remaining (%s)",
			stateUpper, formatDuration(remaining), shortID(id))
	}
	return fmt.Sprintf("%s — %s", stateUpper, shortID(id))
}

func (c *Controller) statsLabel() string {
	if c.stats == nil {
		return "Today: --"
	}
	windows, focus, distractions, commits := c.stats.Snapshot()
	if windows == 0 {
		return "Today: no events yet"
	}
	return fmt.Sprintf("Today: %s focus, %d distractions, %d commits",
		formatMinutes(focus), distractions, commits)
}

func formatDuration(d time.Duration) string {
	if d <= 0 {
		return "0s"
	}
	d = d.Round(time.Second)
	h := int(d / time.Hour)
	m := int((d % time.Hour) / time.Minute)
	s := int((d % time.Minute) / time.Second)
	if h > 0 {
		return fmt.Sprintf("%d:%02d:%02d", h, m, s)
	}
	return fmt.Sprintf("%02d:%02d", m, s)
}

func formatMinutes(m float64) string {
	total := int(m)
	h := total / 60
	mins := total % 60
	if h > 0 {
		return fmt.Sprintf("%dh %02dm", h, mins)
	}
	return fmt.Sprintf("%dm", mins)
}

func shortID(id string) string {
	if len(id) > 8 {
		return id[:8]
	}
	return id
}

// openPath opens a folder or file using the OS-native file manager / editor.
func openPath(path string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", path).Start()
	case "linux":
		return exec.Command("xdg-open", path).Start()
	case "windows":
		return exec.Command("explorer", path).Start()
	}
	return fmt.Errorf("unsupported os %s", runtime.GOOS)
}

// openURL opens a URL in the user's default browser.
func openURL(url string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", url).Start()
	case "linux":
		return exec.Command("xdg-open", url).Start()
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	}
	return fmt.Errorf("unsupported os %s", runtime.GOOS)
}
