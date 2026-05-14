package classifier

import (
	"testing"

	"github.com/extraction/desktop-agent/internal/events"
)

func TestClassifyApp_Productive(t *testing.T) {
	cat, prod, conf := classifyApp("Visual Studio Code")
	if !prod || cat != CategoryDevelopment {
		t.Fatalf("VSCode should be productive/development, got %s prod=%v", cat, prod)
	}
	if conf < 0.8 {
		t.Fatalf("VSCode confidence too low: %f", conf)
	}
}

func TestClassifyApp_Distraction(t *testing.T) {
	cat, prod, _ := classifyApp("Instagram")
	if prod || cat != CategoryDistraction {
		t.Fatalf("Instagram should be distraction, got %s prod=%v", cat, prod)
	}
}

func TestClassifyApp_Unknown(t *testing.T) {
	cat, prod, _ := classifyApp("RandomCorporateApp")
	if prod || cat != CategoryNeutral {
		t.Fatalf("Unknown app should be neutral, got %s prod=%v", cat, prod)
	}
}

func TestClassifyEvent_GitCommit(t *testing.T) {
	c := New()
	ev, err := events.NewEvent(events.EventGitCommit, events.GitCommit{
		CommitHash: "abc",
		Message:    "hi",
	})
	if err != nil {
		t.Fatal(err)
	}
	classified := c.Classify(ev)
	if !classified.IsProductive {
		t.Fatal("git commit should be productive")
	}
	if classified.SignalType != SignalGit {
		t.Fatalf("unexpected signal type %s", classified.SignalType)
	}
}

func TestClassifyEvent_AppSwitched(t *testing.T) {
	c := New()
	ev, err := events.NewEvent(events.EventAppSwitched, events.AppSwitched{
		FromApp: "Mail",
		ToApp:   "Cursor",
	})
	if err != nil {
		t.Fatal(err)
	}
	classified := c.Classify(ev)
	if !classified.IsProductive || classified.Category != CategoryDevelopment {
		t.Fatalf("Cursor should be productive/development, got %+v", classified)
	}
}

func TestClassifyEvent_Idle(t *testing.T) {
	c := New()
	ev, err := events.NewEvent(events.EventIdleDetected, events.IdleDetected{IdleMs: 600000})
	if err != nil {
		t.Fatal(err)
	}
	classified := c.Classify(ev)
	if classified.SignalType != SignalIdle {
		t.Fatalf("expected idle signal, got %s", classified.SignalType)
	}
}
