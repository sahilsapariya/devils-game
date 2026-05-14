// Package classifier turns raw collector events into ClassifiedEvent records.
// It runs entirely on-device using a small set of hard-coded rules — there is
// no machine learning here and no network access.
package classifier

import (
	"encoding/json"
	"strings"

	"github.com/extraction/desktop-agent/internal/events"
)

// Category labels.
const (
	CategoryDevelopment   = "development"
	CategoryCommunication = "communication"
	CategoryDistraction   = "distraction"
	CategoryNeutral       = "neutral"
)

// Signal types describe which sub-pipeline a classified event feeds.
const (
	SignalApp      = "app"
	SignalIdle     = "idle"
	SignalTerminal = "terminal"
	SignalGit      = "git"
)

// productiveApps is the canonical list of dev tools we consider productive.
// Names are matched case-insensitively against the macOS application name.
var productiveApps = map[string]struct{}{
	"visual studio code": {},
	"vscode":             {},
	"code":               {},
	"code - insiders":    {},
	"cursor":             {},
	"intellij idea":      {},
	"intellij idea ce":   {},
	"pycharm":            {},
	"pycharm ce":         {},
	"goland":             {},
	"webstorm":           {},
	"rubymine":           {},
	"phpstorm":           {},
	"clion":              {},
	"datagrip":           {},
	"android studio":     {},
	"xcode":              {},
	"terminal":           {},
	"iterm":              {},
	"iterm2":             {},
	"warp":               {},
	"alacritty":          {},
	"ghostty":            {},
	"kitty":              {},
	"hyper":              {},
	"sublime text":       {},
	"vim":                {},
	"neovim":             {},
	"emacs":              {},
	"zed":                {},
	"figma":              {},
	"postman":            {},
	"insomnia":           {},
}

// communicationApps are work-adjacent comms tools.
var communicationApps = map[string]struct{}{
	"slack":              {},
	"discord":            {},
	"microsoft teams":    {},
	"teams":              {},
	"zoom":               {},
	"zoom.us":            {},
	"google meet":        {},
	"mail":               {},
	"outlook":            {},
	"messages":           {},
}

// distractionApps and substring matchers used for web-based distractions.
var distractionApps = map[string]struct{}{
	"instagram":  {},
	"youtube":    {},
	"netflix":    {},
	"tiktok":     {},
	"reddit":     {},
	"twitter":    {},
	"x":          {},
	"facebook":   {},
	"twitch":     {},
	"spotify":    {},
	"steam":      {},
}

// Classifier is a small rules engine. It is intentionally stateless so it can
// be used safely from any goroutine.
type Classifier struct{}

// New returns a default Classifier.
func New() *Classifier { return &Classifier{} }

// Classify produces a ClassifiedEvent for the given raw event. The classifier
// always returns a valid result — when no rule matches, the event is labeled
// neutral with a low confidence score.
func (c *Classifier) Classify(e events.Event) events.ClassifiedEvent {
	out := events.ClassifiedEvent{
		Event:           e,
		IsProductive:    false,
		Category:        CategoryNeutral,
		ConfidenceScore: 0.3,
		SignalType:      SignalApp,
	}

	switch e.Type {
	case events.EventAppSwitched:
		var p events.AppSwitched
		if err := json.Unmarshal(e.Data, &p); err == nil {
			cat, prod, conf := classifyApp(p.ToApp)
			out.Category = cat
			out.IsProductive = prod
			out.ConfidenceScore = conf
			out.SignalType = SignalApp
		}

	case events.EventIdleDetected, events.EventIdleEnded:
		out.Category = CategoryNeutral
		out.IsProductive = false
		out.ConfidenceScore = 0.9
		out.SignalType = SignalIdle

	case events.EventTerminalActive:
		var p events.TerminalActivity
		if err := json.Unmarshal(e.Data, &p); err == nil {
			out.Category = CategoryDevelopment
			out.IsProductive = true
			out.ConfidenceScore = confidenceForCommand(p.CommandType)
			out.SignalType = SignalTerminal
		}

	case events.EventGitCommit:
		out.Category = CategoryDevelopment
		out.IsProductive = true
		out.ConfidenceScore = 0.95
		out.SignalType = SignalGit
	}

	return out
}

// classifyApp inspects an application name and returns (category, productive, confidence).
func classifyApp(name string) (string, bool, float64) {
	n := strings.ToLower(strings.TrimSpace(name))
	if n == "" {
		return CategoryNeutral, false, 0.2
	}
	if _, ok := productiveApps[n]; ok {
		return CategoryDevelopment, true, 0.9
	}
	if _, ok := communicationApps[n]; ok {
		return CategoryCommunication, false, 0.7
	}
	if _, ok := distractionApps[n]; ok {
		return CategoryDistraction, false, 0.85
	}
	// Substring matches — covers names like "Google Chrome - YouTube" if/when
	// the platform layer ever provides window titles.
	for keyword := range distractionApps {
		if strings.Contains(n, keyword) {
			return CategoryDistraction, false, 0.6
		}
	}
	for keyword := range productiveApps {
		if strings.Contains(n, keyword) {
			return CategoryDevelopment, true, 0.6
		}
	}
	return CategoryNeutral, false, 0.4
}

// confidenceForCommand returns a per-command confidence score.
func confidenceForCommand(cmd string) float64 {
	switch strings.ToLower(cmd) {
	case "git":
		return 0.95
	case "go", "cargo", "rustc":
		return 0.92
	case "npm", "yarn", "pnpm", "node", "deno", "bun":
		return 0.85
	case "python", "python3", "pip", "pip3":
		return 0.85
	case "make":
		return 0.8
	}
	return 0.7
}
