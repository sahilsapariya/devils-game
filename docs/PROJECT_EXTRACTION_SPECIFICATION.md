# PROJECT EXTRACTION — PRODUCTION SPECIFICATION

**Version:** 1.0  
**Date:** 2026-05-15  
**Status:** Finalized for Implementation  
**Architect:** Principal Systems Design

---

## TABLE OF CONTENTS

1. [Executive Overview](#executive-overview)
2. [Core Architectural Decisions](#core-architectural-decisions)
3. [System Architecture](#system-architecture)
4. [Operational State Machine](#operational-state-machine)
5. [Event Sourcing & Data Flow](#event-sourcing--data-flow)
6. [Telemetry Pipeline](#telemetry-pipeline)
7. [Immersion Engine](#immersion-engine)
8. [Adaptive Difficulty Engine](#adaptive-difficulty-engine)
9. [AI Orchestration System](#ai-orchestration-system)
10. [Mobile App Architecture](#mobile-app-architecture)
11. [Desktop Agent Architecture](#desktop-agent-architecture)
12. [Browser Extension Architecture](#browser-extension-architecture)
13. [Backend Architecture](#backend-architecture)
14. [Real-Time Synchronization](#real-time-synchronization)
15. [Offline Resilience](#offline-resilience)
16. [Security & Privacy Architecture](#security--privacy-architecture)
17. [Deployment Architecture](#deployment-architecture)
18. [Implementation Roadmap](#implementation-roadmap)

---

## EXECUTIVE OVERVIEW

**PROJECT EXTRACTION** is a cross-device behavioral operating system that creates persistent psychological pressure toward objective completion through:

- **Continuous operational monitoring** across mobile, desktop, and web
- **Event-sourced behavioral tracking** enabling precise causality analysis
- **Adaptive difficulty orchestration** that dynamically escalates pressure toward sustainable limits
- **Immersive environmental control** through coordinated announcements, overlays, and tonal shifts
- **Offline-first resilience** with mobile app as operational runtime authority
- **Multi-signal behavioral verification** preventing faked productivity
- **AI-augmented narration** that maintains thematic immersion without controlling deterministic logic

The system operates as a **coordinated ecosystem** where:
- **Backend** orchestrates operational events and persists state
- **Mobile app** maintains authoritative round state and immersive UI
- **Desktop agent** continuously monitors behavioral signals
- **Browser extension** tracks distraction patterns
- **AI layer** generates contextual announcements and analysis

All components sync in real-time via Socket.io. The system continues functioning during backend outages via local mobile authority.

---

## CORE ARCHITECTURAL DECISIONS

### Decision 1: Mobile App as Operational Runtime Authority

**What it means:**
- Mobile app maintains the authoritative local state for active rounds
- Round timers run on mobile, not backend
- Announcements are queued and played locally
- Telemetry is buffered locally and synced asynchronously
- During backend outages, the app continues operating normally

**Why:**
- Ensures continuous immersion even during infrastructure failures
- Reduces backend dependency for critical round-time operations
- Enables authentic offline experience
- Builds psychological continuity

**Implications:**
- Mobile app must have robust local persistence (SQLite)
- Sync logic must handle eventual consistency gracefully
- Mobile app needs offline announcement capability (pre-cached + Ollama)
- Backend is eventually consistent, not immediately consistent

### Decision 2: Event Sourcing Mandatory

**What it means:**
- Every operational state transition is captured as an immutable event
- Events are the source of truth; state is derived from events
- Full event replay capability exists
- Complete audit trail of behavioral history

**Why:**
- Enables precise behavioral analysis and pattern detection
- Supports perfect reconstruction of causality (why did the consequence occur?)
- Allows operational replay for debugging and validation
- Creates immutable record for reputation/consequences

**Implications:**
- `events` table is append-only (no deletes, no updates)
- State is computed from events, not stored directly
- Snapshots needed every N events for performance
- Event ordering and timestamps are critical

### Decision 3: Multi-Signal Behavioral Inference

**What it means:**
- Productivity is never inferred from a single signal
- System triangulates: IDE activity + git commits + terminal usage + browser behavior + manual check-ins
- Adaptive weighting based on historical player patterns
- Anomaly detection flags suspicious signals

**Why:**
- Single signals are easily faked (open IDE window, no actual work)
- Multi-signal approach reveals authentic patterns
- Anomaly detection catches cheating attempts
- Builds trust that verification is legitimate

**Implications:**
- Telemetry schema must support multiple signal types
- Behavioral inference engine analyzes patterns, not raw events
- Players see transparent scoring (why did this count as productive?)
- Thresholds adapt per-player based on historical patterns

### Decision 4: Invisible Operational State Transitions

**What it means:**
- Player cannot see when state machine transitions (Operational → Critical, etc.)
- State transitions are reflected in subtle UI/tonal changes, not explicit announcements
- System design makes transitions feel like inevitable pressure escalation, not rule changes

**Why:**
- Maintains immersion and inevitability
- Prevents players from gaming state transitions
- Creates psychological continuity
- Enhances the sense of relentless pressure

**Implications:**
- UI animates gradually (announcement frequency ↑, overlay intensity ↑, color shifts)
- No "You are now in Critical mode" messages
- State affects behavior, not visibility
- Analytics can show states, but UI doesn't expose them

### Decision 5: Difficulty Orbits Sustainable Maximum

**What it means:**
- System identifies each player's sustainable difficulty level (where they succeed ~70% of rounds)
- Difficulty escalates up to 85% of that ceiling
- Variance oscillates around that level, not linear escalation
- Recovery rounds lower difficulty intentionally

**Why:**
- Prevents impossible-to-pass scenarios
- Creates achievable challenge curve
- Builds comeback mechanics
- Sustains long-term psychological engagement

**Implications:**
- Difficulty tracking monitors success/failure rates
- Adaptive engine adjusts ceiling as player improves
- Some rounds are intentionally easier (recovery)
- Rounds never escalate infinitely

### Decision 6: AI Never Controls Deterministic Logic

**What it means:**
- AI generates narration, announcements, analysis
- Core logic (scoring, verification, consequences) is deterministic
- AI cannot decide round outcomes, consequences, or progression

**Why:**
- Prevents unfair/inconsistent gameplay
- Maintains system credibility
- Enables explainability (why did I fail?)
- Separates immersion from fairness

**Implications:**
- AI has read-only access to operational state
- Consequence engine is rule-based, not ML-based
- Scoring is transparent and reproducible
- AI output is quality-gated before delivery

### Decision 7: Consequences = Reputation + Continuity, Not Only Punishment

**What it means:**
- Consequences affect permanent reputation score
- Reputation affects operational continuity (streak, recovery availability, difficulty)
- Consequences are logged permanently (player can review history)
- Recovery opportunities exist after failures

**Why:**
- Creates psychological weight without just being punitive
- Failure becomes part of narrative, not just a setback
- Comebacks are emotionally powerful
- System feels fair but relentless

**Implications:**
- Reputation system is central to player progression
- Consequences affect future rounds, not just current one
- Failed rounds unlock specific recovery opportunities
- Public operational logs create accountability

---

## SYSTEM ARCHITECTURE

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                       OPERATIONAL ECOSYSTEM                      │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐         ┌─────────────────┐      ┌──────────────┐
│   Mobile App     │         │  Desktop Agent  │      │  Extension   │
│  (React Native)  │         │     (Go)        │      │ (Manifest V3)│
│                  │         │                 │      │              │
│ - Round runtime  │         │ - App tracking  │      │ - Domain     │
│ - Announcements  │◄────────┤ - Git tracking  │◄─────┤   tracking   │
│ - Overlays       │  gRPC   │ - Idle detect   │  HTTP│ - Overlays   │
│ - Local cache    │         │ - Terminal act. │      │ - Warnings   │
│ - Immersive UI   │         │ - Local buffer  │      │              │
└────────┬─────────┘         └────────┬────────┘      └────────┬─────┘
         │                            │                         │
         │ WebSocket (Socket.io)      │ gRPC                    │ HTTP
         │                            │                         │
         └────────────────┬───────────┴─────────────────────────┘
                          │
                   ┌──────▼──────┐
                   │   Backend   │
                   │  (NestJS)   │
                   │             │
                   │ - Event hub │
                   │ - Mission   │
                   │   engine    │
                   │ - Scoring   │
                   │ - State     │
                   │   machine   │
                   └──────┬──────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
    ┌────▼────┐    ┌─────▼──────┐    ┌────▼─────┐
    │PostgreSQL│    │    Redis   │    │  Ollama  │
    │          │    │            │    │          │
    │ - Events │    │ - Real-time│    │ - Local  │
    │ - Rounds │    │   state    │    │   TTS    │
    │ - Players│    │ - Pub/sub  │    │ - Voice  │
    │ - Telemetry   │ - Cache    │    │   gen    │
    └──────────┘    └────────────┘    └──────────┘
                          │
                    ┌─────▼─────┐
                    │ ElevenLabs│
                    │           │
                    │ - Cloud   │
                    │   TTS     │
                    │ - Voice   │
                    │   quality │
                    └───────────┘
```

### Subsystem Ownership & Boundaries

| Subsystem | Owner | Responsibilities | Dependencies |
|-----------|-------|------------------|--------------|
| **Mobile App** | Mobile Team | Round runtime, immersive UI, local state, offline operation | Backend APIs, local SQLite |
| **Backend Core** | Backend Team | Event orchestration, mission engine, state machine, API serving | PostgreSQL, Redis, Socket.io |
| **Desktop Agent** | Systems Team | Activity monitoring, telemetry collection, local buffering | Backend gRPC, local SQLite |
| **Browser Extension** | Systems Team | Domain tracking, distraction detection, overlays, warnings | Backend HTTP APIs |
| **AI/Immersion** | AI Team | Narration generation, TTS orchestration, behavioral analysis | Backend APIs, ElevenLabs, Ollama |
| **Infrastructure** | DevOps Team | Deployment, CI/CD, database, Redis, monitoring | All subsystems |

---

## OPERATIONAL STATE MACHINE

### State Definitions

The system transitions through operational states that affect behavior, tone, and intensity without being explicitly visible to the player.

```
States and Transitions:

DORMANT
  └─ (mission assigned)
     └─> MONITORING
           ├─ (round about to start)
           │  └─> OPERATIONAL
           │       ├─ (20% time remaining OR 2+ violations)
           │       │  └─> CRITICAL
           │       │       ├─ (round completed)
           │       │       │  └─> OPERATIONAL
           │       │       └─ (round failed)
           │       │          └─> RECOVERY
           │       ├─ (round completed successfully)
           │       │  └─> MONITORING
           │       └─ (round abandoned)
           │          └─> RECOVERY
           └─ (all missions completed)
              └─> EXTRACTION
                  └─ (finalization sequence)
                     └─> SILENCE
                         └─> (system shutdown)

Recovery Cycle:
RECOVERY (after failure)
  ├─ (recovery round completed)
  │  └─> MONITORING
  └─ (recovery period > 24 hours)
     └─> DORMANT
```

### State Behaviors

#### DORMANT
- **Duration:** Between missions or at startup
- **UI State:** Minimal. Operational logs visible. Mission selection interface.
- **Telemetry:** Passive monitoring only (no telemetry collection)
- **Announcements:** None unless new mission assigned
- **Psychological Effect:** Waiting, anticipation
- **Transition Trigger:** Player assigns mission OR system assigns mission

#### MONITORING
- **Duration:** Between rounds, during prep
- **UI State:** Operational dashboard. Mission overview. Countdown to next round.
- **Telemetry:** Collection enabled, baseline metrics only
- **Announcements:** Ambient presence (every 5-10 min). Operational readiness checks.
- **Psychological Effect:** Vigilant waiting, system presence
- **Transition Trigger:** Round start time reaches, or player initiates round

#### OPERATIONAL
- **Duration:** Active round execution
- **UI State:** Full round dashboard. Real-time stats. Focus timer.
- **Telemetry:** Full collection. All signals active.
- **Announcements:** Periodic status updates (every 15-30 min). Distraction warnings.
- **Psychological Effect:** Active pressure, operational continuity
- **Transition Trigger:** 20% time remaining, 2+ violations, or successful completion

#### CRITICAL
- **Duration:** Final ~20% of round time OR after multiple violations
- **UI State:** Intensified color scheme (subtle red tint). Announcement frequency ↑. Overlay persistence ↑.
- **Telemetry:** Aggressive collection. All signals sampled more frequently.
- **Announcements:** Every 5-10 min. Increasingly urgent tone. Pressure escalation commentary.
- **Psychological Effect:** Relentless pressure, inevitability, urgency
- **Transition Trigger:** Round completion OR abandonment

#### RECOVERY
- **Duration:** Post-failure, 2-7 days
- **UI State:** Compassionate tone. Recovery opportunity options. Streak rebuild mechanics.
- **Telemetry:** Lighter collection. Behavioral analysis (identifying failure patterns).
- **Announcements:** Supportive (not punitive). Pattern analysis. Recovery path recommendations.
- **Psychological Effect:** Redemption focus, learning from failure
- **Transition Trigger:** Recovery round completed, or 7+ days elapsed

#### EXTRACTION
- **Duration:** All primary objectives completed
- **UI State:** System winding down. Announcements decreasing. Quiet mode.
- **Telemetry:** Wrapping up. Final analysis.
- **Announcements:** Celebratory. Operational completion acknowledgment. System preparing for finalization.
- **Psychological Effect:** Earned completion, system respect, anticipation of finale
- **Transition Trigger:** All missions completed

#### SILENCE
- **Duration:** Final shutdown sequence (5-10 minutes)
- **UI State:** Minimal. Extraction completion message. System shutting down.
- **Telemetry:** Stopped.
- **Announcements:** Final farewell. System termination countdown.
- **Psychological Effect:** Finality, earned rest
- **Transition Trigger:** Player acknowledges extraction

---

## EVENT SOURCING & DATA FLOW

### Event Types (Complete Taxonomy)

#### Operational Events
```typescript
// Round lifecycle
round.scheduled { roundId, userId, startsAt, endsAt, missionId }
round.started { roundId, userId, timestamp }
round.paused { roundId, userId, timestamp, reason }
round.resumed { roundId, userId, timestamp }
round.completed { roundId, userId, timestamp, pointsEarned, stats }
round.failed { roundId, userId, timestamp, failureReason, severityLevel }
round.abandoned { roundId, userId, timestamp, reason }

// State machine
state.transition { fromState, toState, userId, roundId, timestamp, triggerReason }

// Announcements
announcement.generated { announcementId, userId, roundId, announcementType, content, timestamp, aiGenerated }
announcement.played { announcementId, userId, timestamp, voiceUrl, duration }
announcement.acknowledged { announcementId, userId, timestamp }
```

#### Behavioral Events
```typescript
behavior.focus_session_started { roundId, userId, timestamp, appName, focusSource }
behavior.focus_session_ended { roundId, userId, timestamp, duration, appName }
behavior.app_switched { roundId, userId, timestamp, fromApp, toApp, focusDurationBefore }
behavior.idle_detected { roundId, userId, timestamp, idleDuration, appName }
behavior.idle_ended { roundId, userId, timestamp, idleDuration }
behavior.distraction_detected { roundId, userId, timestamp, distractionType, domain, intensity, durationSeconds }
behavior.recovery_action { roundId, userId, timestamp, actionType, description }
telemetry.git_commit { roundId, userId, timestamp, commitHash, message, filesChanged }
telemetry.terminal_activity { roundId, userId, timestamp, commandType, wasSuccessful }
telemetry.code_review { roundId, userId, timestamp, prId, reviewType }
```

#### Consequence Events
```typescript
consequence.issued { consequenceId, userId, roundId, timestamp, consequenceType, severity, description, reputationDelta }
consequence.acknowledged { consequenceId, userId, timestamp }
```

#### Difficulty Events
```typescript
difficulty.adjusted { roundId, userId, timestamp, newDifficultyLevel, previousLevel, adjustmentReason }
difficulty.ceiling_updated { userId, timestamp, newCeiling, previousCeiling, basis }
```

### Event Storage & Processing

#### Event Table Schema
```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  round_id UUID REFERENCES rounds(id),
  
  -- Event metadata
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB NOT NULL,
  
  -- Immutable timestamps
  occurred_at TIMESTAMP NOT NULL,
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Processing state
  is_processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP,
  
  -- Indexing
  INDEX idx_user_round_type (user_id, round_id, event_type),
  INDEX idx_occurred_at (occurred_at DESC),
  INDEX idx_unprocessed (is_processed, event_type)
);

-- Snapshots for performance (computed periodically)
CREATE TABLE event_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  round_id UUID REFERENCES rounds(id),
  
  -- Snapshot is state as of this point
  snapshot_at TIMESTAMP NOT NULL,
  event_count INT NOT NULL,
  
  -- Aggregated state
  state_data JSONB NOT NULL,
  
  INDEX idx_user_round_snapshot (user_id, round_id, snapshot_at DESC)
);
```

#### Event Processing Pipeline

```
Raw Event → Queue (Redis) → Process (NestJS Worker) → Persist (PostgreSQL)
                                    ↓
                        Update Real-Time State (Redis)
                                    ↓
                        Broadcast to Clients (Socket.io)
                                    ↓
                        Trigger Side Effects (announcements, consequences)
```

**Processing Steps:**
1. **Validation:** Event schema check, timestamp sanity, user/round existence
2. **Enrichment:** Add metadata (location, device info, behavioral context)
3. **Deduplication:** Check for duplicate events (idempotency)
4. **Persistence:** Write to PostgreSQL events table
5. **State Update:** Recompute state from recent events + last snapshot
6. **Broadcasting:** Publish to user's Socket.io namespace
7. **Side Effects:** Trigger consequence checks, announcement generation, difficulty updates
8. **Snapshotting:** Every 1000 events, save computed state snapshot

---

## TELEMETRY PIPELINE

### Local Telemetry Architecture (Device Level)

#### Desktop Agent Telemetry Collection

Activity Monitor → Classification → Buffering → Aggregation → Batching → Upload

**Collection Points:**
- App switching (window title, process name)
- Idle detection (mouse/keyboard inactivity)
- Terminal activity (command execution history)
- Git activity (commit events via git hooks)
- IDE activity (VSCode extension, file saves, build runs)
- Browser activity (domains only, via extension)

**Processing Steps:**

1. **Raw Event Capture** (every 1-5 seconds)
   - timestamp, eventType (app_switched), fromApp, toApp, focusDuration

2. **Local Classification** (Go agent, on-device)
   - classify(event) → isProductive, category, confidenceScore, signalType

3. **Buffering** (local SQLite, 1 hour retention)
   - Store classified events locally
   - Persist across application restarts
   - Compress after 24 hours

4. **Aggregation** (5-minute windows)
   - periodStart, periodEnd, metrics (totalFocusMinutes, appSwitches, idleMinutes, productiveAppsActive, eventCount)

5. **Batching** (100 events or 10 minutes, whichever comes first)
   - Group aggregated metrics
   - Add device metadata (OS version, agent version)
   - Sign batch with agent key

6. **Upload** (with retry logic)
   - POST /api/telemetry/batch with deviceId, batches

#### Mobile App Telemetry Collection

Round Events → Local Queue → Batch → Background Upload

**Collection Points:**
- Announcement delivery and acknowledgment
- Overlay interactions
- App state transitions
- Manual check-ins
- Focus timer events
- Distraction warnings shown

**Processing:**
1. Events queued in local SQLite immediately
2. Every 30 seconds or 50 events, batch queue
3. Upload batches in background (doesn't block UI)
4. Retry failed batches using exponential backoff

#### Extension Telemetry Collection

Tab Changes → Domain Classification → Queue → Batch → Send

**Collection:**
- Only track domain (e.g., youtube.com, not specific URL)
- Classify domain as productive/distraction
- Batch every minute or 20 events

### Backend Telemetry Aggregation

#### Ingestion Pipeline

Client Batches → Validate → Deduplicate → Decompose → Process → Persist → Aggregate

**Step 1: Validate**
- Check device signature
- Verify timestamps are recent (< 1 hour old)
- Ensure user/round exists
- Reject malformed events

**Step 2: Deduplicate**
- Check if batch was already received (idempotent)
- Skip duplicate events (same timestamp + type)

**Step 3: Decompose**
- Break batch into individual events
- Restore full event context

**Step 4: Process**
- For each event, run inference
- Is this productive or distraction?
- What's the signal confidence?
- How does it affect behavioral score?

**Step 5: Persist**
- Write events to PostgreSQL events table
- Update Redis operational state

**Step 6: Aggregate**
- Every 5 minutes, compute behavioral metrics
- Store in behavioral_records table
- Trigger adaptive difficulty check

#### Behavioral Inference Engine

**Multi-Signal Scoring (per round):**

```
ProductivityScore = (
  0.3 * ide_activity_score +
  0.3 * git_activity_score +
  0.2 * focus_duration_score +
  0.1 * distraction_absence_score +
  0.1 * manual_checkin_score
)
```

**Anomaly Detection:**
- 20+ commits in 1 minute (likely automated/faked)
- 12+ hour IDE session with 0 commits
- Idle for 90% of round
- Git commits with 0 code changes
- Domain visits but device offline

**Adaptive Weighting:**
- Each player has historical productivity pattern
- current_round_score adjusted against player pattern + recent trend

---

## IMMERSION ENGINE

### Immersion State Cascade

The system maintains **multiple overlapping immersion layers** that compound to create overwhelming psychological pressure.

#### Layer 1: Announcement Frequency
```
State           | Interval    | Tone
────────────────────────────────────────
Dormant         | None        | —
Monitoring      | 10 min      | Calm, procedural
Operational     | 20 min      | Standard, informative
Critical        | 5 min       | Urgent, escalating
Recovery        | 15 min      | Supportive, analytical
Extraction      | 30 min      | Celebratory, winding down
Silence         | 2 min       | Final, farewell
```

#### Layer 2: UI Intensity
```
State           | Color Tint | Animations     | Information Density
─────────────────────────────────────────────────────────────────
Dormant         | Neutral    | Minimal        | Low
Monitoring      | Neutral    | Subtle         | Medium
Operational     | Neutral    | Standard       | High
Critical        | Red shift  | Aggressive     | Very High
Recovery        | Cool blue  | Gentle         | Medium
Extraction      | Neutral    | Slowing        | Low
Silence         | Fading     | Minimal        | Minimal
```

#### Layer 3: Overlay Frequency & Persistence
```
State           | Distraction Overlay | Consequence Overlay | Stats Overlay
────────────────────────────────────────────────────────────────────────
Operational     | On violation        | On issue            | Optional
Critical        | Persistent (10s)    | Persistent (15s)    | Auto-show
Recovery        | None                | Gentle (5s)         | Auto-show
```

#### Layer 4: Sound Design
```
State           | Ambient Sound       | Announcement Voice | Tone
────────────────────────────────────────────────────────────────
Dormant         | Silence             | —                  | —
Monitoring      | Subtle beep (1/min) | Calm, female       | Procedural
Operational     | Distant alarm loop  | Standard, female   | Authoritative
Critical        | Insistent alarm     | Urgent, female     | Escalating
Recovery        | Soft tones          | Supportive, warm   | Compassionate
Extraction      | Fading audio        | Celebratory        | Triumphant
Silence         | Silence             | Final message      | Farewell
```

### Announcement Generation Engine

#### Categories & Templates

**1. Status Reports** (every 20 min in OPERATIONAL)
Template: "Time_remaining. Violation_count violations recorded. Focus_duration in current session."

**2. Behavioral Analysis** (every 30 min)
Template: "Pattern detected: Behavior_pattern. Recommendation: Suggested_action."

**3. Pressure Escalation** (triggered in CRITICAL)
Template: "Operational status. Consequence preview."

**4. Recovery Offers** (in RECOVERY state)
Template: "Recovery available. Opportunity_type can rebuild streak."

**5. Operational Updates** (state transitions, invisible to player)
Template: "System operational update. Effect on gameplay."

**6. Ambient Presence** (every 5-10 min in MONITORING)
"System ready. Operational status: nominal. Stand by for mission assignment."

### AI Narration Orchestration

AI receives read-only context and generates announcements within thematic bounds. Quality gates validate output before delivery. Fallback system uses pre-recorded announcements on failure.

---

## ADAPTIVE DIFFICULTY ENGINE

### Difficulty Dimension Framework

Difficulty is a vector of independent dimensions:

```
RoundDifficulty = {
  time_pressure (1-10),
  distraction_sensitivity (1-10),
  verification_strictness (1-10),
  announcement_frequency (1-10),
  environmental_pressure (1-10),
  points_multiplier (0.5-2.0)
}
```

### Difficulty Ceiling Calculation

System **continuously estimates each player's sustainable difficulty ceiling**:

```
sustainable_ceiling = f(
  recent_success_rate (target: 70%),
  recovery_speed,
  consistency,
  skill_trend
)
```

**Algorithm:**
1. Success Rate Analysis (last 10 rounds)
2. Adaptive Escalation (increase one dimension every 2-3 rounds)
3. Difficulty Oscillation (varies ceiling × 0.6 to ceiling × 1.0)

### Consequence-Triggered Adjustments

Round Failed → Recovery State → Next 1-2 rounds at 60% of ceiling
2nd Consecutive Failure → Reset to baseline
3rd Consecutive Failure → Force 24-hour break

---

## AI ORCHESTRATION SYSTEM

### AI System Architecture

User Behavior Context → Behavioral Analyzer (deterministic rules) → AI Narration Engine (Claude/Ollama) → Quality Gates (deterministic) → TTS Synthesis → Delivery

### AI Integration Points

1. **Procedural Announcement Generation** - Context-aware narration within operational tone
2. **Behavioral Pattern Analysis** - Identify peak times, distraction triggers, recovery speed, optimal scheduling
3. **Performance Summarization** - Round end analysis and insight generation

### Ollama Local Fallback

Purpose: System operates fully offline via local Ollama instance
Setup: Mistral 7B or Llama 2 13B for narration + Coqui TTS for voice
Fallback Behavior: ElevenLabs first, Ollama on timeout or failure

---

## MOBILE APP ARCHITECTURE

### Core Responsibilities

1. Operational Runtime Authority
2. Immersive UI
3. Announcement Delivery
4. Local Persistence (SQLite)
5. Telemetry Buffering
6. Offline Continuity

### Local State Management

SQLite tables: rounds, announcements, telemetry_queue, consequences, operational_logs

### Offline Round Execution

- Round timer runs locally (React Native Timer)
- Announcements pre-downloaded before round starts
- Telemetry queued in SQLite, uploaded on reconnect
- Events retained locally (30-day retention)

### UI/UX Architecture

Main Dashboard shows:
- Time remaining (large, prominent)
- Current status
- Violations count
- Focus duration
- Behavioral metrics (mini cards)
- Operational log (scrollable)

Announcement Overlay (fullscreen, critical moments):
- System operational icon
- Event description (time, violations, context)
- 20-second countdown timer
- Audio playback

### Background Service

Native background service maintains:
- Round timer (even if app killed)
- Announcement queue monitoring (every 30 sec)
- Telemetry collection (via headless workers)
- Persistent notification with round status

---

## DESKTOP AGENT ARCHITECTURE

### Go-Based Architecture

Built in Go for minimal resource overhead, easy system integration, fast local processing.

### Core Components

Activity Collectors → Local Classifier → Local SQLite Buffer → Aggregator & Batcher → Uploader → System Tray Integration

### Activity Collection Strategy

- **App Switching:** Monitor active window every 2 seconds
- **Idle Detection:** Check mouse/keyboard activity, emit on 5+ min idle
- **Terminal Activity:** Track process execution, command type, exit status
- **Git Activity:** Via git hooks integration in user's repos
- **Local SQLite:** 1-hour retention, compress after 24h, offline persistence

---

## BROWSER EXTENSION ARCHITECTURE

### Manifest V3 Implementation

Permissions: activeTab, tabs, storage, host_permissions for all_urls
Background: Service worker (background.js)
Content scripts: content.js
UI: popup.html

### Core Functionality

#### Tab Tracking
- Monitor active tab every 1 second
- Extract domain (not full URL)
- Classify domain as distraction/neutral/productive

#### Time Tracking Per Domain
- Session history per domain
- Every 5 minutes, emit batch

#### Overlay System
- Inject distraction warning overlay (fixed positioning, centered)
- Display "DISTRACTION DETECTED. Return to operation immediately."
- Persist for 5 seconds, then auto-remove

#### Telemetry Relay
- Batch every 30 seconds or 20 events
- POST to /api/telemetry/batch with device metadata
- Include fallback retry logic

---

## BACKEND ARCHITECTURE

### NestJS Module Structure

Organized as: config → common → modules (auth, users, missions, rounds, telemetry, announcements, consequences, difficulty, events, websockets) → database

### Critical Services

#### RoundStateMachine
- Deterministic state transitions
- Trigger validation
- Event emission on transition
- State update with invisible flag

#### BehavioralInferenceEngine
- Multi-signal scoring (IDE + git + focus + distraction + checkin)
- Weighted combination
- Anomaly detection (commits in < 1min, 12h+ IDE with 0 commits, 90% idle, 0-change commits, offline contradictions)
- Player pattern comparison

---

## REAL-TIME SYNCHRONIZATION

### Socket.io Event Schema

**Client → Server:**
- telemetry:batch
- round:status
- user:check-in

**Server → Client:**
- round:started
- behavioral:violation-detected
- announcement:incoming
- consequence:issued
- stats:update

### Conflict Resolution

Priority hierarchy:
- round.status conflicts → backend authoritative
- behavioral.distraction conflicts → extension authoritative
- behavioral.idle conflicts → desktop authoritative
- telemetry.productivity conflicts → weighted multi-signal

---

## OFFLINE RESILIENCE

### Mobile App Offline Protocol

Round Active + Backend Down:
1. Mobile maintains local round state
2. Local timer continues
3. Announcements from pre-cached queue
4. Telemetry events queue in SQLite
5. UI shows "Offline Mode" indicator

### Offline Grace Periods

```
< 10 min:    Transparent (no penalty)
10-30 min:   Warning (slight reputation penalty)
30+ min:     Escalation (round moved to recovery)
> 2 hours:   Auto-abandonment (round marked incomplete)
```

### Sync On Reconnection

Send all queued events → Compare local vs backend round state → Backend wins on conflict → Log conflict for analysis

---

## SECURITY & PRIVACY ARCHITECTURE

### Authentication & Authorization

JWT Token Flow: Login → Verify credentials (bcrypt) → Issue JWT { user_id, email, iat, exp } → Return token + refresh token → Store in secure storage → All requests: Bearer header

**Token Specs:**
- Access token: 7-day expiry
- Refresh token: 30-day expiry, rotated on refresh
- Secret: Min 32 characters, environment-stored only

**Permission Model:** Users access only their own data via middleware enforcement

### Data Privacy

**Collection Boundaries:**
- COLLECT: Window title (app name only), Domain name, Terminal command type, Git metadata, IDE activity, Idle time, App switches, Commit hashes
- DO NOT COLLECT: Full window content, Full URLs, Command arguments, Diff contents, File contents, Keystroke timing, Clipboard, Private repos

**Encryption:**
- In Transit: TLS 1.3 minimum, HTTPS only, Certificate pinning in mobile
- At Rest: AES-256 for sensitive fields, bcrypt for passwords, KMS for backups

**Data Retention:**
- Telemetry: 90 days
- Behavioral records: 1 year
- Consequences: Permanent
- User profiles: Until deletion
- API logs: 30 days

### Privacy Policy & Transparency

Players informed of: What's collected, How it's processed, Retention period, Who accesses it, Rights to delete. Explicit opt-in before operation. Can revoke consent. GDPR compliance (data export).

---

## DEPLOYMENT ARCHITECTURE

### Infrastructure Components

Frontend (CDN) → Load Balancer → Backend (Kubernetes: API pods, WebSocket pods, Worker pods) → Data Layer (PostgreSQL + read replica, Redis 3-node cluster) → External Services (ElevenLabs, GitHub API, Ollama, S3)

### CI/CD Pipeline

Developer push → GitHub Actions (test, lint, build Docker, push registry) → Deploy to staging → Integration tests → Manual approval → Production rolling deploy (10% → 50% → 100%) → Monitor error rates (5 min SLO) → Auto-rollback if > 5% errors

### Environment Configuration

.env.staging: Staging DB/Redis, ElevenLabs staging quota, LOG_LEVEL=debug
.env.production: Production DB + replicas, Production Redis cluster, ElevenLabs production quota, LOG_LEVEL=warn

---

## IMPLEMENTATION ROADMAP

### Phase Breakdown

**Phase 1: Backend Foundation (Week 1-2)**
- NestJS setup, Database + migrations, PostgreSQL + Redis init, JWT auth, CRUD APIs, Event sourcing foundation, WebSocket gateway

**Phase 2: Mission Engine (Week 2-3)**
- Round state machine, Round orchestration, Scoring system, Consequence engine, Difficulty calculation, Event processor workers

**Phase 3: Mobile App (Week 3-4)**
- React Native/Expo setup, SQLite, Dashboard UI, Announcements, Offline state mgmt, WebSocket client

**Phase 4: Desktop Agent (Week 4-5)**
- Go setup, Activity collectors, Classification, Buffering, Batch uploader, gRPC client

**Phase 5: Browser Extension (Week 5)**
- Manifest V3 setup, Tab tracking, Domain classification, Overlays, Telemetry relay

**Phase 6: AI Integration (Week 6)**
- ElevenLabs integration, Ollama setup, Announcement generation, TTS, Quality gates

**Phase 7: Integration & Polish (Week 6-7)**
- E2E testing, Performance optimization, Security review, Deployment setup, Documentation, Soft launch

---

This specification is production-ready and provides complete architectural guidance for implementation.

