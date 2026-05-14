# PROJECT EXTRACTION — IMPLEMENTATION ROADMAP

**Optimized for Subagent-Driven Parallel Execution**

**Total Duration:** 7 weeks (compressed via parallelization)  
**Subagent Teams:** 6 independent subsystems  
**Key Principle:** Minimum blocking dependencies, maximum parallel work

---

## SUBAGENT OWNERSHIP & BOUNDARIES

### Subagent A: Backend Core & Mission Engine
**Owner:** Backend Team  
**Scope:** NestJS app, PostgreSQL, Redis, event sourcing, APIs, state machine  
**Duration:** Weeks 1-3 (can run in parallel with mobile)  
**Key Deliverables:** Operational hub, mission orchestration, event processing

### Subagent B: Mobile App & Offline Runtime
**Owner:** Mobile Team  
**Scope:** React Native/Expo, SQLite local cache, UI, announcements, background service  
**Duration:** Weeks 2-4 (starts when backend APIs defined)  
**Key Deliverables:** Primary immersive interface, offline operation

### Subagent C: Desktop Agent & Telemetry
**Owner:** Systems Team  
**Scope:** Go daemon, activity monitoring, git tracking, local buffering, gRPC client  
**Duration:** Weeks 2-3 (starts when telemetry API defined)  
**Key Deliverables:** Behavioral telemetry pipeline, git integration

### Subagent D: Browser Extension
**Owner:** Systems Team (parallel with Desktop Agent)  
**Scope:** Manifest V3 extension, tab tracking, domain classification, overlays  
**Duration:** Week 2 (very fast, independent)  
**Key Deliverables:** Distraction tracking overlay system

### Subagent E: AI & Immersion Systems
**Owner:** AI Team  
**Scope:** ElevenLabs integration, Ollama setup, announcement generation, TTS  
**Duration:** Weeks 3-4 (starts when announcement service API defined)  
**Key Deliverables:** Dynamic narration, voice synthesis, quality gates

### Subagent F: Infrastructure & Deployment
**Owner:** DevOps Team  
**Scope:** Docker, Kubernetes, CI/CD, PostgreSQL setup, monitoring  
**Duration:** Weeks 1-7 (parallel throughout, final push week 7)  
**Key Deliverables:** Production-ready infrastructure, deployment pipeline

---

## DEPENDENCY GRAPH

```
Week 1
├─ [A] Backend: Project setup, database schema, API skeleton
├─ [F] Infrastructure: Docker compose, PostgreSQL, Redis local setup
│
Week 2 (can start after A completes)
├─ [A] Backend: Authentication, user management, mission APIs
├─ [B] Mobile: React Native project, local SQLite schema, navigation
├─ [C] Desktop: Go project setup, activity monitors
├─ [D] Extension: Manifest V3 project, tab tracking
└─ [F] Infrastructure: Kubernetes setup, GitHub Actions CI

Week 3 (dependent on A Week 1-2)
├─ [A] Backend: Round state machine, event sourcing, scoring engine
├─ [B] Mobile: Round dashboard UI, local round state management
├─ [C] Desktop: Telemetry buffering, classification, SQLite schema
├─ [D] Extension: Domain classification, overlay system
├─ [E] AI: Announcement templates, ElevenLabs API integration
└─ [F] Infrastructure: Staging environment, monitoring setup

Week 4 (dependent on A Week 2-3)
├─ [A] Backend: Real-time Socket.io sync, consequence engine, difficulty engine
├─ [B] Mobile: Announcements system, offline operation, background service
├─ [C] Desktop: Batch uploader, gRPC client implementation
├─ [D] Extension: Telemetry relay API integration
├─ [E] AI: Behavioral analysis engine, adaptive narration
└─ [F] Infrastructure: PostgreSQL backups, disaster recovery

Week 5
├─ [A] Backend: Integration testing, API refinement
├─ [B] Mobile: End-to-end offline/online sync testing
├─ [C] Desktop: Integration with backend, telemetry validation
├─ [D] Extension: Integration testing, Chrome Web Store prep
├─ [E] AI: Quality gates implementation, fallback system
└─ [F] Infrastructure: Load testing, scaling testing

Week 6
├─ All Subagents: Cross-subsystem integration testing
├─ All Subagents: Performance optimization
├─ [F] Infrastructure: Production environment setup
└─ All Subagents: Documentation finalization

Week 7
├─ All Subagents: Bug fixes, security review
├─ [F] Infrastructure: Staged rollout to production
└─ All Subagents: Monitoring, observability, alert setup
```

---

## DETAILED TASK BREAKDOWN

### PHASE 1: BACKEND FOUNDATION (Week 1-2)

#### Task 1.1: NestJS Project Initialization
**Subagent:** A (Backend)  
**Duration:** 2 hours  
**Output:** Runnable NestJS app with database connectivity

```
Steps:
1. Create NestJS project via CLI
2. Configure TypeORM for PostgreSQL
3. Set up configuration module (.env loading)
4. Create database connection factory
5. Run first migration (creates empty database)
6. Implement health check endpoint (/health)
7. Test: docker-compose up → npm run dev → curl localhost:3001/health
8. Commit: "feat: initialize NestJS backend with database connectivity"
```

#### Task 1.2: PostgreSQL Schema & Migrations
**Subagent:** A (Backend)  
**Duration:** 4 hours  
**Depends on:** 1.1  
**Output:** Complete database schema with all tables

```
Steps:
1. Create migration file: initial-schema.ts
2. Implement users table with proper indexes
3. Implement missions table with foreign keys
4. Implement rounds table (complex, many relationships)
5. Implement telemetry_events table (high-volume, needs indexing)
6. Implement events table (append-only, event sourcing foundation)
7. Implement behavioral_records, consequences, announcements tables
8. Test: npm run migration:generate → npm run migration:run
9. Verify schema: \d in PostgreSQL to inspect all tables
10. Commit: "feat: implement complete PostgreSQL schema with 8 core tables"
```

#### Task 1.3: Redis Setup & Integration
**Subagent:** A (Backend)  
**Duration:** 2 hours  
**Depends on:** 1.1  
**Output:** Redis client module, caching utility

```
Steps:
1. Add redis package to dependencies
2. Create redis.module.ts with client provider
3. Implement cache decorator for easy memoization
4. Implement pub/sub utility (for Socket.io later)
5. Test Redis connectivity via health check
6. Test caching: store value → retrieve → verify
7. Commit: "feat: integrate Redis for caching and pub/sub"
```

#### Task 1.4: JWT Authentication
**Subagent:** A (Backend)  
**Duration:** 3 hours  
**Depends on:** 1.1, 1.2  
**Output:** Auth module, JWT strategy, protected routes

```
Steps:
1. Create auth module (auth.module.ts)
2. Implement auth service (register, login, validate)
3. Implement JWT strategy (passport-jwt)
4. Add JWT guard (@UseGuards(JwtAuthGuard))
5. Create auth controller (POST /auth/register, POST /auth/login)
6. Implement password hashing (bcrypt, 12 rounds)
7. Test: register user → login → access protected route
8. Test failure cases: wrong password, non-existent user
9. Commit: "feat: implement JWT authentication with register/login"
```

#### Task 1.5: User Management APIs
**Subagent:** A (Backend)  
**Duration:** 2 hours  
**Depends on:** 1.1, 1.2, 1.4  
**Output:** User controller and service

```
Steps:
1. Create users module
2. Implement users service (find, update, delete)
3. Create users controller (GET /users/me, PATCH /users/me)
4. Add @JwtAuthGuard to protected endpoints
5. Test: Get current user, update profile, verify authorization
6. Test: Unauthorized access to other users' data rejected
7. Commit: "feat: implement user management endpoints"
```

#### Task 1.6: Mission Management APIs
**Subagent:** A (Backend)  
**Duration:** 3 hours  
**Depends on:** 1.1, 1.2, 1.4, 1.5  
**Output:** Mission CRUD, mission service

```
Steps:
1. Create missions module
2. Implement missions service (create, read, update, list)
3. Create missions controller (GET /missions, POST /missions, PATCH /missions/:id)
4. Add user ownership enforcement (can only see own missions)
5. Test: Create mission → verify user_id matches
6. Test: List missions → paginated results
7. Test: Update mission → only own missions
8. Commit: "feat: implement mission management CRUD"
```

#### Task 1.7: API Documentation & OpenAPI Schema
**Subagent:** A (Backend)  
**Duration:** 2 hours  
**Depends on:** 1.4, 1.5, 1.6  
**Output:** Swagger docs at /api

```
Steps:
1. Add @nestjs/swagger package
2. Annotate auth controller with Swagger decorators
3. Annotate users controller
4. Annotate missions controller
5. Add API description and tags
6. Generate OpenAPI schema
7. Test: Visit localhost:3001/api (Swagger UI)
8. Commit: "docs: add OpenAPI Swagger documentation"
```

---

### PHASE 2: BACKEND MISSION ENGINE (Week 2-3)

#### Task 2.1: Round State Machine
**Subagent:** A (Backend)  
**Duration:** 4 hours  
**Depends on:** 1.2, 1.4, 1.5  
**Output:** Round state machine service, state transition logic

```
Steps:
1. Create rounds module
2. Implement round entity with all fields
3. Create RoundStateMachine service (handles state transitions)
4. Implement transition rules (dormant→monitoring→operational→critical, etc)
5. Implement DORMANT state (no active round)
6. Implement MONITORING state (between rounds)
7. Implement OPERATIONAL state (round active)
8. Implement CRITICAL state (final 20%, pressure escalates)
9. Test: Verify state transitions follow rules
10. Test: Invalid transitions rejected
11. Commit: "feat: implement round state machine with 7 states"
```

#### Task 2.2: Event Sourcing Foundation
**Subagent:** A (Backend)  
**Duration:** 3 hours  
**Depends on:** 1.2  
**Output:** Event service, event store, event processor

```
Steps:
1. Create events module
2. Implement event entity (append-only)
3. Create event service (emit, retrieve, replay)
4. Implement event validation (schema check)
5. Implement event processor worker (Bull queue)
6. Test: Emit event → stored in DB
7. Test: Retrieve events by user/round
8. Test: Process queue works (event → Redis → broadcast)
9. Commit: "feat: implement event sourcing with immutable event store"
```

#### Task 2.3: Round Scoring Engine
**Subagent:** A (Backend)  
**Duration:** 3 hours  
**Depends on:** 2.1  
**Output:** Scoring service, points calculation

```
Steps:
1. Create scoring service
2. Implement multi-signal scoring algorithm (IDE + git + focus + distraction + checkin)
3. Implement anomaly detection (20 commits/min, 12h IDE + 0 commits, etc)
4. Implement adaptive weighting (player-specific patterns)
5. Implement scoring breakdown (returns per-signal scores)
6. Test: Calculate score for synthetic round data
7. Test: Anomaly detection flags suspicious patterns
8. Test: Weighting adapts per player
9. Commit: "feat: implement multi-signal behavioral scoring"
```

#### Task 2.4: Consequence Engine
**Subagent:** A (Backend)  
**Duration:** 3 hours  
**Depends on:** 2.1, 1.2  
**Output:** Consequence service, consequence rules

```
Steps:
1. Create consequences module
2. Implement consequence entity
3. Create consequence service (issue, acknowledge)
4. Implement consequence types (streak_break, reputation_penalty, recovery_required, difficulty_reset)
5. Implement severity levels (low, medium, high, critical)
6. Implement reputation delta calculation
7. Test: Issue consequence → stored + event emitted
8. Test: Acknowledge consequence → updates status
9. Test: Reputation deltas affect player reputation
10. Commit: "feat: implement consequence system with reputation tracking"
```

#### Task 2.5: Difficulty Engine
**Subagent:** A (Backend)  
**Duration:** 4 hours  
**Depends on:** 2.1, 2.3  
**Output:** Difficulty calculation service, adaptive scaling

```
Steps:
1. Create difficulty module
2. Implement difficulty dimension model (time, sensitivity, strictness, frequency, pressure, multiplier)
3. Implement ceiling calculation (based on success rate, recovery speed, consistency)
4. Implement escalation logic (increase dimension by 1-2 points)
5. Implement oscillation logic (vary difficulty around ceiling)
6. Implement consequence-triggered adjustments (failure → easier next round)
7. Test: Calculate ceiling from synthetic player history
8. Test: Escalation logic increases difficulty appropriately
9. Test: Oscillation varies correctly around ceiling
10. Test: Failure triggers recovery round at lower difficulty
11. Commit: "feat: implement adaptive difficulty engine with 6-dimensional scaling"
```

#### Task 2.6: Round Orchestration & CRUD
**Subagent:** A (Backend)  
**Duration:** 3 hours  
**Depends on:** 2.1, 2.4, 2.5  
**Output:** Round controller and service

```
Steps:
1. Create rounds controller
2. Implement GET /rounds/current (active round)
3. Implement GET /rounds (list with filters)
4. Implement POST /rounds (create new round, initialize state)
5. Implement PATCH /rounds/:id (update status, complete, abandon)
6. Implement GET /rounds/:id/behavioral-record (aggregated stats)
7. Test: Create round → initializes in DORMANT state
8. Test: Complete round → triggers consequences if needed
9. Test: Abandon round → moves to RECOVERY state
10. Commit: "feat: implement round CRUD and orchestration"
```

#### Task 2.7: Telemetry Ingestion API
**Subagent:** A (Backend)  
**Duration:** 2 hours  
**Depends on:** 1.2, 2.2  
**Output:** Telemetry controller, batch ingestion

```
Steps:
1. Create telemetry module
2. Implement POST /telemetry/batch (batch ingestion)
3. Implement validation (schema, timestamps, user/round exist)
4. Implement deduplication (idempotency check)
5. Implement decomposition (batch → individual events)
6. Queue events for processing
7. Test: Submit batch → received + queued
8. Test: Duplicate batches rejected (idempotent)
9. Test: Invalid events rejected
10. Commit: "feat: implement telemetry batch ingestion with validation"
```

---

### PHASE 3: WEBSOCKET & REAL-TIME SYNC (Week 3-4)

#### Task 3.1: Socket.io Gateway
**Subagent:** A (Backend)  
**Duration:** 3 hours  
**Depends on:** 1.3, 2.2  
**Output:** WebSocket gateway, namespaces, event broadcasting

```
Steps:
1. Add Socket.io adapter with Redis (for multi-server scaling)
2. Create operational gateway (OperationalGateway)
3. Implement JWT authentication for WebSocket connections
4. Implement user namespace isolation (each user gets own namespace)
5. Implement room system (user + round_id)
6. Test: Client connects → authenticated
7. Test: Events broadcast to correct namespace
8. Test: Multiple users don't see each other's data
9. Commit: "feat: implement Socket.io WebSocket gateway with auth"
```

#### Task 3.2: Real-Time Event Broadcasting
**Subagent:** A (Backend)  
**Duration:** 2 hours  
**Depends on:** 3.1, 2.2  
**Output:** Event broadcasting service

```
Steps:
1. Implement EventBroadcaster service
2. Subscribe to event queue (Redis Pub/Sub)
3. Broadcast events to Socket.io namespaces
4. Implement selective broadcasting (only to affected user)
5. Test: Event emitted → broadcast to user's socket
6. Test: Multiple clients receive same event
7. Commit: "feat: implement real-time event broadcasting via Socket.io"
```

#### Task 3.3: Client WebSocket Events
**Subagent:** A (Backend)  
**Duration:** 2 hours  
**Depends on:** 3.1  
**Output:** Handlers for client events

```
Steps:
1. Implement telemetry:batch handler (server receives client telemetry)
2. Implement round:status handler (client updates round status)
3. Implement user:check-in handler (manual checkin from client)
4. Queue incoming events to event store
5. Test: Client sends event → server receives + stores
6. Commit: "feat: implement client-to-server WebSocket event handlers"
```

---

### PHASE 4: MOBILE APP (Week 2-4)

#### Task 4.1: React Native Project Setup
**Subagent:** B (Mobile)  
**Duration:** 2 hours  
**Output:** Expo project, navigation, basic structure

```
Steps:
1. npx create-expo-app extraction
2. Add React Navigation (stack + tab navigation)
3. Configure TypeScript
4. Create folder structure (screens, components, services, hooks)
5. Test: npm start → app loads in Expo Go
6. Commit: "chore: initialize React Native Expo project"
```

#### Task 4.2: SQLite Local Persistence
**Subagent:** B (Mobile)  
**Duration:** 3 hours  
**Depends on:** 4.1  
**Output:** SQLite database, schema, CRUD utilities

```
Steps:
1. Add expo-sqlite package
2. Create database initialization function
3. Implement tables: rounds, announcements, telemetry_queue, consequences
4. Create CRUD utilities (insert, update, select, delete)
5. Test: Insert round → query → verify data
6. Test: Database persists after app restart
7. Commit: "feat: implement local SQLite persistence"
```

#### Task 4.3: Authentication UI & JWT Storage
**Subagent:** B (Mobile)  
**Duration:** 3 hours  
**Depends on:** 4.1  
**Output:** Login/register screens, secure token storage

```
Steps:
1. Add expo-secure-store for token storage
2. Create login screen (email + password)
3. Create register screen (email + password + confirm)
4. Implement authentication service (connect to backend)
5. Store JWT token securely on success
6. Test: Register user → token stored
7. Test: Login user → token stored
8. Test: Invalid credentials → error message
9. Commit: "feat: implement authentication UI with secure token storage"
```

#### Task 4.4: Dashboard UI Framework
**Subagent:** B (Mobile)  
**Duration:** 4 hours  
**Depends on:** 4.1, 4.2  
**Output:** Main dashboard screen, round status display

```
Steps:
1. Create dashboard screen layout
2. Implement round status display (time remaining, violations, focus duration)
3. Implement behavioral metrics mini-cards (focus sessions, distractions, idle)
4. Implement operational log (scrollable timeline)
5. Create skeleton loaders (while loading)
6. Test: Load dashboard → displays mock round data
7. Test: Scroll operational log → works smoothly
8. Commit: "feat: implement main dashboard UI with mock data"
```

#### Task 4.5: Announcement System
**Subagent:** B (Mobile)  
**Duration:** 3 hours  
**Depends on:** 4.1, 4.2  
**Output:** Announcement queue, playback, fullscreen overlay

```
Steps:
1. Create announcement service (queue management)
2. Create fullscreen announcement overlay component
3. Implement announcement display (message + countdown timer)
4. Implement audio playback (via Expo Audio)
5. Implement dismissal behavior (timer auto-dismiss vs manual)
6. Test: Queue announcement → displays fullscreen
7. Test: Audio plays → user can acknowledge
8. Test: Multiple announcements queue → display sequentially
9. Commit: "feat: implement announcement system with fullscreen overlays"
```

#### Task 4.6: WebSocket Client Integration
**Subagent:** B (Mobile)  
**Duration:** 3 hours  
**Depends on:** 4.1, 3.1  
**Output:** Socket.io client, event listeners

```
Steps:
1. Add socket.io-client package
2. Create socket service (connect, disconnect, emit, listen)
3. Implement JWT authentication for socket connection
4. Implement event listeners (round:started, announcement:incoming, etc)
5. Handle disconnection/reconnection
6. Test: Connect to backend → receive events
7. Test: Send telemetry batch → backend receives
8. Test: Reconnection works (resend queued batches)
9. Commit: "feat: integrate Socket.io WebSocket client"
```

#### Task 4.7: Offline State Management
**Subagent:** B (Mobile)  
**Duration:** 3 hours  
**Depends on:** 4.2, 4.6  
**Output:** Offline mode detection, state sync logic

```
Steps:
1. Implement network status detector (useNetInfo)
2. Create offline store (Redux or Context for offline state)
3. Implement queue on offline: cache API calls
4. Implement resync on reconnect: send queued requests
5. Implement offline UI indicator
6. Test: Disable network → app still functional
7. Test: Enable network → queued requests send
8. Commit: "feat: implement offline resilience and sync"
```

#### Task 4.8: Local Round Timer (Offline)
**Subagent:** B (Mobile)  
**Duration:** 2 hours  
**Depends on:** 4.2, 4.4  
**Output:** Local countdown timer, state persistence

```
Steps:
1. Implement round timer logic (uses local state, not backend)
2. Save timer state to SQLite periodically
3. Restore timer on app restart
4. Test: Timer counts down locally (no backend required)
5. Test: Close app → reopen → timer continues
6. Commit: "feat: implement offline-capable local round timer"
```

---

### PHASE 5: DESKTOP AGENT (Week 2-3)

#### Task 5.1: Go Project Setup
**Subagent:** C (Systems)  
**Duration:** 2 hours  
**Output:** Go project structure, basic main

```
Steps:
1. Create Go project (go.mod, go.sum)
2. Add dependencies (gRPC, protobuf, SQLite)
3. Create folder structure (cmd, internal/collectors, internal/classifier, etc)
4. Implement main.go (startup, flag parsing)
5. Test: go run . --help works
6. Commit: "chore: initialize Go desktop agent project"
```

#### Task 5.2: Activity Collectors
**Subagent:** C (Systems)  
**Duration:** 4 hours  
**Depends on:** 5.1  
**Output:** App switcher, idle detector, git hook integration

```
Steps:
1. Implement app switcher (macOS: CGWindowListCopyWindowInfo)
2. Implement idle detector (macOS: IOKit idle time)
3. Implement terminal activity monitor (process tracking)
4. Implement git hook integration (post-commit hook in user repos)
5. Test: Monitor app switches → logged
6. Test: Detect idle > 5 min → logged
7. Test: Git commit detected → logged
8. Commit: "feat: implement activity collectors for desktop agent"
```

#### Task 5.3: Local Classification Engine
**Subagent:** C (Systems)  
**Duration:** 2 hours  
**Depends on:** 5.2  
**Output:** Productivity classifier

```
Steps:
1. Implement productivity scorer (app name → productive/distraction)
2. Implement confidence scoring
3. Implement anomaly flags (20 commits/min, etc)
4. Test: VSCode → productive
5. Test: Instagram → distraction
6. Commit: "feat: implement local event classification"
```

#### Task 5.4: Local SQLite Buffer
**Subagent:** C (Systems)  
**Duration:** 2 hours  
**Depends on:** 5.1  
**Output:** SQLite schema, buffering logic

```
Steps:
1. Implement SQLite schema (raw_events, classified_events, batch_queue)
2. Implement event insertion (append-only)
3. Implement 1-hour retention + compression
4. Test: Insert events → persisted across agent restart
5. Commit: "feat: implement local SQLite telemetry buffer"
```

#### Task 5.5: Aggregation & Batching
**Subagent:** C (Systems)  
**Duration:** 2 hours  
**Depends on:** 5.3, 5.4  
**Output:** Aggregator service, batch formatter

```
Steps:
1. Implement 5-minute window aggregation
2. Implement batch creator (100 events or 10 min window)
3. Add device metadata (OS version, agent version)
4. Add batch signing (HMAC for verification)
5. Test: Aggregate events → proper metrics calculated
6. Commit: "feat: implement event aggregation and batching"
```

#### Task 5.6: HTTP Uploader with Retry
**Subagent:** C (Systems)  
**Duration:** 2 hours  
**Depends on:** 5.5  
**Output:** Uploader service, retry logic

```
Steps:
1. Implement HTTP batch upload (POST /api/telemetry/batch)
2. Implement retry logic (exponential backoff, max 5 retries)
3. Implement offline queue (if upload fails, queue locally)
4. Test: Upload batch → received by backend
5. Test: Simulate network failure → queued locally
6. Test: Network restored → upload resumes
7. Commit: "feat: implement uploader with exponential backoff"
```

#### Task 5.7: System Tray UI
**Subagent:** C (Systems)  
**Duration:** 2 hours  
**Depends on:** 5.1  
**Output:** System tray integration, status icon

```
Steps:
1. Implement system tray icon (menu bar macOS)
2. Add status indicator (online/offline, collecting/paused)
3. Add pause/resume option
4. Add settings quick access
5. Test: Click tray icon → menu opens
6. Commit: "feat: implement system tray UI and status indicator"
```

---

### PHASE 6: BROWSER EXTENSION (Week 2)

#### Task 6.1: Manifest V3 Project Setup
**Subagent:** D (Systems)  
**Duration:** 1 hour  
**Output:** Extension project, Manifest V3 config

```
Steps:
1. Create extension folder structure
2. Create manifest.json (Manifest V3)
3. Create background.js (service worker)
4. Create content.js (content script)
5. Create popup.html/popup.js (UI)
6. Test: Load unpacked extension in Chrome
7. Commit: "chore: initialize Manifest V3 browser extension"
```

#### Task 6.2: Tab Tracking
**Subagent:** D (Systems)  
**Duration:** 2 hours  
**Depends on:** 6.1  
**Output:** Tab activity monitor, domain extraction

```
Steps:
1. Implement chrome.tabs.onActivated listener
2. Extract domain from tab URL
3. Classify domain (productive, distraction, neutral)
4. Emit event on tab change
5. Test: Switch tabs → domain logged
6. Test: Instagram tab → classified as distraction
7. Commit: "feat: implement tab tracking and domain classification"
```

#### Task 6.3: Distraction Overlay
**Subagent:** D (Systems)  
**Duration:** 2 hours  
**Depends on:** 6.1  
**Output:** Content script, overlay injection

```
Steps:
1. Implement overlay creation (fixed positioning, centered)
2. Implement message text (sanitized, safe DOM methods)
3. Inject overlay on distraction site detection
4. Auto-remove after 5 seconds
5. Use textContent (not innerHTML) for security
6. Test: Visit distraction site → overlay appears
7. Test: Overlay disappears after timer
8. Commit: "feat: implement distraction warning overlay"
```

#### Task 6.4: Telemetry Relay
**Subagent:** D (Systems)  
**Duration:** 2 hours  
**Depends on:** 6.2  
**Output:** API communication, batch sending

```
Steps:
1. Implement batch queue (in-memory)
2. Implement batch creation (30 sec or 20 events)
3. Implement POST to /api/telemetry/batch
4. Test: Emit events → batched → sent to backend
5. Commit: "feat: implement telemetry relay to backend"
```

---

### PHASE 7: AI & IMMERSION (Week 3-4)

#### Task 7.1: ElevenLabs Integration
**Subagent:** E (AI)  
**Duration:** 2 hours  
**Depends on:** A backend API skeleton  
**Output:** TTS service, voice synthesis

```
Steps:
1. Add ElevenLabs API client
2. Implement text-to-speech method
3. Implement voice ID selection
4. Test: Send text → receive audio URL
5. Commit: "feat: integrate ElevenLabs TTS API"
```

#### Task 7.2: Ollama Local Fallback
**Subagent:** E (AI)  
**Duration:** 2 hours  
**Depends on:** 7.1  
**Output:** Ollama integration, fallback system

```
Steps:
1. Set up Ollama locally (Mistral 7B or Llama 2)
2. Implement Ollama client connection
3. Implement fallback logic (ElevenLabs fails → Ollama)
4. Test: ElevenLabs working → use ElevenLabs
5. Test: ElevenLabs times out → use Ollama
6. Commit: "feat: implement Ollama local fallback for offline TTS"
```

#### Task 7.3: Announcement Generation Service
**Subagent:** E (AI)  
**Duration:** 3 hours  
**Depends on:** 7.1  
**Output:** AI narration service, template system

```
Steps:
1. Create announcement generation service
2. Implement template system (status, analysis, pressure, recovery, etc)
3. Implement AI context builder (gather round state, player patterns)
4. Call Claude/Ollama with context
5. Test: Generate announcement → reasonable output
6. Commit: "feat: implement AI-powered announcement generation"
```

#### Task 7.4: Quality Gates
**Subagent:** E (AI)  
**Duration:** 2 hours  
**Depends on:** 7.3  
**Output:** Output validation, quality checks

```
Steps:
1. Implement quality checks (thematic consistency, accuracy, length, clarity)
2. Implement fallback announcement system
3. Test: Generated announcement → passes quality check
4. Test: Bad generation → use fallback
5. Commit: "feat: implement quality gates for AI output"
```

#### Task 7.5: Behavioral Analysis Engine
**Subagent:** E (AI)  
**Duration:** 2 hours  
**Depends on:** A (telemetry data available)  
**Output:** Pattern analysis service

```
Steps:
1. Implement pattern analysis (peak productivity times, common distractions, recovery speed)
2. Implement trend analysis (improving? deteriorating?)
3. Call AI to summarize findings
4. Test: Analyze synthetic player history → get insights
5. Commit: "feat: implement behavioral analysis engine"
```

---

### PHASE 8: INFRASTRUCTURE & DEPLOYMENT (Week 1-7)

#### Task 8.1: Docker Setup
**Subagent:** F (DevOps)  
**Duration:** 2 hours  
**Output:** Dockerfile, docker-compose

```
Steps:
1. Create Dockerfile for NestJS backend
2. Create docker-compose.yml (backend, PostgreSQL, Redis)
3. Test: docker-compose up → all services running
4. Commit: "chore: add Docker setup for local development"
```

#### Task 8.2: PostgreSQL & Redis Setup
**Subagent:** F (DevOps)  
**Duration:** 2 hours  
**Depends on:** 8.1  
**Output:** Persistent volumes, initialization scripts

```
Steps:
1. Configure PostgreSQL container with volume
2. Configure Redis container with persistence
3. Add initialization script (schema loading)
4. Test: Stop/restart → data persists
5. Commit: "chore: configure PostgreSQL and Redis persistence"
```

#### Task 8.3: GitHub Actions CI Pipeline
**Subagent:** F (DevOps)  
**Duration:** 3 hours  
**Depends on:** A (backend has tests)  
**Output:** .github/workflows/ci.yml

```
Steps:
1. Create test workflow (npm test)
2. Add linting step (eslint)
3. Add build step (npm build)
4. Add Docker build step
5. Test: Push code → CI runs
6. Commit: "chore: add GitHub Actions CI pipeline"
```

#### Task 8.4: Production Kubernetes Manifests
**Subagent:** F (DevOps)  
**Duration:** 4 hours  
**Depends on:** 8.1, 8.3  
**Output:** k8s manifests (deployment, service, ingress, config)

```
Steps:
1. Create backend Deployment (3+ replicas, auto-scaling)
2. Create backend Service (LoadBalancer or ClusterIP)
3. Create Ingress (TLS, routing)
4. Create ConfigMaps (environment config)
5. Create Secrets (sensitive data: API keys)
6. Create PersistentVolumeClaims (for PostgreSQL, Redis)
7. Test: kubectl apply → resources created
8. Commit: "chore: add Kubernetes production manifests"
```

#### Task 8.5: Monitoring & Logging
**Subagent:** F (DevOps)  
**Duration:** 3 hours  
**Depends on:** 8.4  
**Output:** Prometheus metrics, ELK stack setup (or similar)

```
Steps:
1. Add Prometheus metrics to NestJS (@nestjs/metrics)
2. Implement custom metrics (round completions, consequences, errors)
3. Add structured logging (Winston)
4. Configure log aggregation (ELK or Datadog)
5. Test: Metrics exported → visible in Prometheus
6. Commit: "chore: add observability (metrics, logging)"
```

#### Task 8.6: Backup & Disaster Recovery
**Subagent:** F (DevOps)  
**Duration:** 2 hours  
**Depends on:** 8.2, 8.4  
**Output:** Backup scripts, recovery procedures

```
Steps:
1. Configure PostgreSQL automated backups
2. Configure backup retention (30 days)
3. Document restore procedure
4. Test: Simulate restore from backup
5. Commit: "chore: configure PostgreSQL backups and disaster recovery"
```

---

## INTEGRATION CHECKPOINTS

### Checkpoint 1 (End of Week 2)
- [ ] A: Backend APIs (auth, users, missions) functional
- [ ] B: Mobile app structure with navigation
- [ ] C: Desktop agent collecting data
- [ ] D: Extension tracking tabs
- [ ] E: TTS integration working
- [ ] F: Local Docker setup, CI pipeline

**Review:** API contracts finalized, all teams can proceed independently

### Checkpoint 2 (End of Week 3)
- [ ] A: Round state machine, event sourcing, scoring, consequences, difficulty
- [ ] B: Dashboard UI, local SQLite, WebSocket client
- [ ] C: Telemetry buffering, batching, uploader
- [ ] D: Distraction overlay, telemetry relay
- [ ] E: Announcement generation, quality gates
- [ ] F: Kubernetes setup, monitoring

**Review:** Core systems integrated, ready for end-to-end testing

### Checkpoint 3 (End of Week 4)
- [ ] A: Real-time Socket.io sync, full API coverage
- [ ] B: Offline operation, round timer, announcements
- [ ] C: Integration with backend, telemetry validation
- [ ] D: Extension fully functional
- [ ] E: AI analysis engine, behavioral insights
- [ ] F: Production environment ready

**Review:** All subsystems working independently and together

### Checkpoint 4 (End of Week 5)
- [ ] All: E2E testing (full operational rounds)
- [ ] All: Performance testing (load, latency)
- [ ] All: Security review (pen testing, credential handling)
- [ ] All: Cross-subsystem integration validated

**Review:** System ready for soft launch

### Checkpoint 5 (End of Week 6)
- [ ] All: Bug fixes from testing
- [ ] All: Documentation complete
- [ ] All: Alert setup and monitoring operational

**Review:** Ready for production deployment

### Checkpoint 6 (End of Week 7)
- [ ] F: Staged rollout to production (10% → 50% → 100%)
- [ ] All: Production monitoring active
- [ ] All: Support playbook ready

**Review:** System live, monitoring, stable

---

## TESTING STRATEGY

### Unit Tests (Per Subagent)
- Service logic (scoring, state transitions, classification)
- API endpoints (CRUD, validation)
- Utilities (timers, formatters)

### Integration Tests
- Backend ↔ Mobile (API calls, WebSocket)
- Backend ↔ Desktop Agent (telemetry ingestion)
- Backend ↔ Extension (event relay)
- Mobile ↔ Backend (offline/online sync)

### End-to-End Tests
- Full operational round: start → monitor → complete
- Offline scenario: backend down, round continues
- Multi-device: desktop monitoring + mobile UI + extension tracking all sync

### Performance Tests
- Telemetry throughput: 10000 events/min
- WebSocket broadcast: 1000 connected users
- Database queries: < 100ms for common queries

### Security Tests
- JWT token validation
- SQLi injection prevention
- XSS prevention (extension overlays)
- Unauthorized access prevention

---

## RISK MITIGATION

### Risk 1: Backend API Changes Blocking Other Teams
**Mitigation:** Lock API contracts by end of Week 1. Only additive changes allowed.

### Risk 2: Desktop Agent Permissions Issues (macOS)
**Mitigation:** Start early, document setup, provide signed binary for distribution.

### Risk 3: Socket.io Scalability Under Load
**Mitigation:** Use Redis adapter from day 1. Test with 1000+ concurrent connections.

### Risk 4: Local SQLite Corruption
**Mitigation:** Implement backups, validation on read, migration system.

### Risk 5: AI Generated Announcements Being Bad
**Mitigation:** Quality gates mandatory. Extensive fallback templates.

---

## DELIVERABLES BY PHASE

| Phase | Deliverable | Owner | Status |
|-------|-----------|-------|--------|
| 1 | Operational Backend API | A | Week 2 |
| 2 | Mission Engine & Scoring | A | Week 3 |
| 3 | Real-Time Sync | A | Week 4 |
| 4 | Mobile App (MVP) | B | Week 4 |
| 5 | Desktop Agent | C | Week 3 |
| 6 | Browser Extension | D | Week 2 |
| 7 | AI/Immersion Systems | E | Week 4 |
| 8 | Infrastructure & Deploy | F | Week 7 |
| 9 | E2E Testing & Launch | All | Week 5-7 |

---

## SUCCESS CRITERIA

- [ ] Backend operational and serving 100+ req/sec
- [ ] Mobile app fully offline-capable, round timer accurate
- [ ] Desktop agent collecting 100+ events/min with < 5% CPU
- [ ] Extension tracking domains with zero false positives
- [ ] AI announcements quality-gated (95%+ pass rate)
- [ ] Multi-device sync accurate (< 5 sec latency)
- [ ] System survives 2-hour backend outage with mobile continuing
- [ ] E2E round: start → monitor → complete → score (all systems integrated)
- [ ] Load test: 10000 telemetry events/min processed in < 2 sec
- [ ] Security audit: zero critical findings

---

**This roadmap enables 6 teams to work in parallel with minimal blocking dependencies.**

**Next Step:** Begin subagent execution. Each subagent starts Task 1 of their phase immediately, following this roadmap precisely.
