package collectors

import (
	"context"
	"log/slog"
	"os/exec"
	"strings"
	"time"

	"github.com/extraction/desktop-agent/internal/events"
)

// TerminalCollector polls the process list for known development commands and
// emits a terminal_activity event the first time each (pid, command) pair is
// observed. This deliberately records the COMMAND TYPE only — never the argv
// tail — and does not read command output.
type TerminalCollector struct {
	Interval time.Duration
	// Whitelist of command basenames we care about. Anything else is ignored.
	Whitelist map[string]struct{}
}

// DefaultTerminalCommands is the set of dev tools the collector watches for.
var DefaultTerminalCommands = []string{
	"git", "npm", "node", "python", "python3", "go", "cargo",
	"make", "yarn", "pnpm", "pip", "pip3", "rustc", "deno", "bun",
}

func NewTerminalCollector(interval time.Duration, whitelist []string) *TerminalCollector {
	if interval <= 0 {
		interval = 5 * time.Second
	}
	if len(whitelist) == 0 {
		whitelist = DefaultTerminalCommands
	}
	wl := make(map[string]struct{}, len(whitelist))
	for _, w := range whitelist {
		wl[w] = struct{}{}
	}
	return &TerminalCollector{Interval: interval, Whitelist: wl}
}

func (c *TerminalCollector) Name() string { return "terminal" }

// procKey identifies a unique process we've already observed.
type procKey struct {
	PID int
	Cmd string
}

func (c *TerminalCollector) Run(ctx context.Context, sink Sink, log *slog.Logger) error {
	log = log.With("collector", c.Name())
	seen := make(map[procKey]time.Time)

	tick := time.NewTicker(c.Interval)
	defer tick.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-tick.C:
		}

		procs, err := listDevProcesses(ctx, c.Whitelist)
		if err != nil {
			log.Debug("process list failed", "error", err)
			continue
		}

		now := time.Now()
		current := make(map[procKey]struct{}, len(procs))
		for _, p := range procs {
			current[p] = struct{}{}
			if _, ok := seen[p]; ok {
				continue
			}
			seen[p] = now
			ev, err := events.NewEvent(events.EventTerminalActive, events.TerminalActivity{
				CommandType:   p.Cmd,
				WasSuccessful: true, // exit status not observed; default true
			})
			if err == nil {
				if err := sink.Submit(ctx, ev); err != nil {
					log.Warn("submit terminal_activity failed", "error", err)
				}
			}
		}

		// Prune disappeared processes so the seen map stays small.
		for k := range seen {
			if _, ok := current[k]; !ok {
				delete(seen, k)
			}
		}
	}
}

// listDevProcesses returns all currently running processes whose command name
// is in the whitelist.
func listDevProcesses(ctx context.Context, whitelist map[string]struct{}) ([]procKey, error) {
	cctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	// `ps -axco pid,comm` prints pid + command name (no args).
	out, err := exec.CommandContext(cctx, "ps", "-axco", "pid,comm").Output()
	if err != nil {
		return nil, err
	}
	var procs []procKey
	for i, line := range strings.Split(string(out), "\n") {
		if i == 0 { // header
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		pid := atoiSafe(fields[0])
		if pid <= 0 {
			continue
		}
		cmd := fields[1]
		if _, ok := whitelist[cmd]; !ok {
			continue
		}
		procs = append(procs, procKey{PID: pid, Cmd: cmd})
	}
	return procs, nil
}

func atoiSafe(s string) int {
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0
		}
		n = n*10 + int(r-'0')
	}
	return n
}
