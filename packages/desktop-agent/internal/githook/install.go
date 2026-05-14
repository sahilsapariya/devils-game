// Package githook installs a post-commit hook in a target git repository.
// The hook posts commit metadata to the agent's local HTTP server.
package githook

import (
	"fmt"
	"os"
	"path/filepath"
)

const hookTemplate = `#!/bin/sh
# PROJECT EXTRACTION post-commit hook
# Posts commit metadata to the local desktop agent. Captures METADATA ONLY —
# no diff content is read or transmitted.

set -e

HASH=$(git rev-parse HEAD)
MSG=$(git log -1 --pretty=%%s | head -c 500)
FILES=$(git diff-tree --no-commit-id --name-only -r HEAD | wc -l | tr -d ' ')
REPO=$(basename "$(git rev-parse --show-toplevel)")
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Escape message for JSON.
escape_json() {
    printf '%%s' "$1" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g; s/	/\\\\t/g' | tr -d '\n'
}

MSG_ESC=$(escape_json "$MSG")

PAYLOAD=$(printf '{"commitHash":"%%s","message":"%%s","filesChanged":%%s,"repoName":"%%s","branch":"%%s"}' \
    "$HASH" "$MSG_ESC" "$FILES" "$REPO" "$BRANCH")

# Best-effort POST; ignore failures so commits never break.
curl --silent --max-time 2 --fail \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    http://127.0.0.1:%d/git-event >/dev/null 2>&1 || true

exit 0
`

// Install writes a post-commit hook into the .git/hooks directory of the
// given repository, configured to call http://127.0.0.1:<port>/git-event.
// Returns the absolute path of the installed hook.
func Install(repoPath string, port int) (string, error) {
	if port <= 0 {
		port = 7890
	}

	hooksDir, err := resolveHooksDir(repoPath)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(hooksDir, 0o755); err != nil {
		return "", fmt.Errorf("create hooks dir: %w", err)
	}

	hookPath := filepath.Join(hooksDir, "post-commit")
	if existing, err := os.Stat(hookPath); err == nil && !existing.IsDir() {
		backup := hookPath + ".extraction.backup"
		if _, berr := os.Stat(backup); os.IsNotExist(berr) {
			if err := os.Rename(hookPath, backup); err != nil {
				return "", fmt.Errorf("backup existing hook: %w", err)
			}
		}
	}

	contents := fmt.Sprintf(hookTemplate, port)
	if err := os.WriteFile(hookPath, []byte(contents), 0o755); err != nil {
		return "", fmt.Errorf("write hook: %w", err)
	}
	return hookPath, nil
}

// resolveHooksDir returns the absolute hooks directory for the given repo.
// Handles both regular repos (.git/hooks) and worktrees (.git is a file
// pointing to gitdir).
func resolveHooksDir(repoPath string) (string, error) {
	abs, err := filepath.Abs(repoPath)
	if err != nil {
		return "", err
	}
	gitPath := filepath.Join(abs, ".git")
	info, err := os.Stat(gitPath)
	if err != nil {
		return "", fmt.Errorf("not a git repository: %s", abs)
	}
	if info.IsDir() {
		return filepath.Join(gitPath, "hooks"), nil
	}
	// .git is a file (worktree) — read "gitdir: <path>" from it.
	b, err := os.ReadFile(gitPath)
	if err != nil {
		return "", err
	}
	var dir string
	if _, err := fmt.Sscanf(string(b), "gitdir: %s", &dir); err != nil {
		return "", fmt.Errorf("parse .git file: %w", err)
	}
	if !filepath.IsAbs(dir) {
		dir = filepath.Join(abs, dir)
	}
	return filepath.Join(dir, "hooks"), nil
}
