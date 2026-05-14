# PROJECT EXTRACTION: Survival Operating System - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dystopian cross-device survival/execution ecosystem that monitors behavioral patterns, orchestrates psychological pressure through adaptive operational rounds, and maintains persistent immersive presence across mobile, desktop, and browser—driving extreme execution focus on defined objectives.

**Architecture:** Event-driven backend (NestJS) orchestrates mission state, round progression, and behavioral analysis. PostgreSQL stores normalized mission/round/telemetry data; Redis provides real-time operational state and event streaming. Mobile app (React Native + Expo) serves as primary command center with persistent background service for monitoring. Browser extension (Manifest V3) and desktop agent (native macOS daemon) feed behavioral telemetry via gRPC/WebSocket into backend. AI layer (ElevenLabs + local Ollama fallback) generates dynamic procedural announcements. All systems sync via Socket.io for real-time operational events.

**Tech Stack:**
- **Backend:** NestJS 10+, TypeScript, PostgreSQL 15+, Redis 7+, Bull (job queue), Socket.io, gRPC
- **Mobile:** React Native 0.73+, Expo, SQLite (local), Reanimated
- **Extension:** Manifest V3, Chrome/Brave API
- **Desktop:** Go (preferred) or Electron, gRPC client, system tray
- **AI/Voice:** ElevenLabs API (cloud) + Ollama (local fallback), Whisper API
- **Infrastructure:** Docker, docker-compose (dev), PostgreSQL migrations
- **Deployment:** GitHub Actions CI, Railway/Render (staging), production TBD

---

## Phase 0: Architecture Foundation & Setup

This phase establishes the monorepo structure, database schema, API contracts, and shared infrastructure that all subsystems depend on.

### Task 0.1: Initialize Monorepo Structure

**Files:**
- Create: `package.json` (root workspace)
- Create: `turbo.json`
- Create: `.gitignore`
- Create: `docker-compose.yml` (local development)
- Create: `packages/backend/package.json`
- Create: `packages/mobile/package.json`
- Create: `packages/extension/package.json`
- Create: `packages/shared/package.json`
- Create: `docs/ARCHITECTURE.md`

**Context:** This is a monorepo with shared TypeScript types, backend API, and separate client implementations. Root uses Turborepo for task orchestration.

- [ ] **Step 1: Initialize root package.json with workspace configuration**

```json
{
  "name": "project-extraction",
  "version": "0.0.1",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "devDependencies": {
    "turbo": "^1.10.0"
  },
  "scripts": {
    "dev": "turbo run dev --parallel",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint"
  }
}
```

- [ ] **Step 2: Create turbo.json for pipeline orchestration**

```json
{
  "globalDependencies": ["**/.env"],
  "pipeline": {
    "dev": {
      "cache": false,
      "persistent": true
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "build/**"]
    },
    "test": {
      "outputs": ["coverage/**"]
    },
    "lint": {}
  }
}
```

- [ ] **Step 3: Create .gitignore at root**

```
node_modules/
dist/
.env
.env.local
.DS_Store
*.log
.turbo/
```

- [ ] **Step 4: Create docker-compose.yml for local PostgreSQL + Redis**

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: extraction
      POSTGRES_PASSWORD: development
      POSTGRES_DB: extraction_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

- [ ] **Step 5: Create folder structure for all packages**

```bash
mkdir -p packages/backend/src/{modules,common,config,database}
mkdir -p packages/mobile/src/{screens,components,services,hooks}
mkdir -p packages/extension/src/{background,content,popup}
mkdir -p packages/shared/src/{types,constants,utils}
mkdir -p docs/architecture
```

- [ ] **Step 6: Create docs/ARCHITECTURE.md overview**

```markdown
# PROJECT EXTRACTION - System Architecture

## Overview
Cross-device survival ecosystem for behavioral monitoring and execution pressure.

## Core Subsystems

### 1. Backend (NestJS + PostgreSQL)
- Mission orchestration engine
- Round state machine
- Telemetry ingestion
- User/player management
- Real-time event streaming (Socket.io)
- API gateway for all clients

### 2. Mobile App (React Native)
- Primary command center UI
- Background service (native module)
- Local SQLite for offline state
- Announcements and overlays
- Mission dashboard
- Behavioral logging

### 3. Browser Extension (Manifest V3)
- Tab/site tracking
- Distraction detection (Instagram, YouTube, Netflix)
- Telemetry relay to backend
- Operational overlays/warnings

### 4. Desktop Agent (macOS)
- App activity monitoring
- Idle detection
- Terminal/IDE activity tracking
- Git monitoring
- Background system service

### 5. AI/Voice Layer
- ElevenLabs for dynamic TTS
- Ollama local fallback
- Procedural announcement generation
- Tone: calm, authoritative, detached

### 6. Data Layer
- PostgreSQL for persistent state
- Redis for real-time operations + event streaming
- SQLite on clients for offline sync

## Real-Time Event Flow
```
[Desktop Agent] --gRPC--> [Backend Socket.io Relay]
[Extension] --HTTP--> [Backend Socket.io Relay]
[Mobile App] --WebSocket--> [Backend Socket.io Relay]
                               |
                               v
                    [Redis Event Stream]
                    [Mission Engine updates]
                    [Broadcasts back to all clients]
```

## Database Entities (Summary)
- User/Player
- Mission (long-term objectives)
- Round (operational cycle)
- Telemetry Event
- Behavioral Record
- Consequence Log
- Streak/Reputation

See schema in Task 0.2.
```

- [ ] **Step 7: Initialize git and commit**

```bash
git init
git add -A
git commit -m "chore: initialize monorepo structure and docker-compose"
```

---

### Task 0.2: Design & Document Database Schema

**Files:**
- Create: `packages/backend/src/database/schema.sql`
- Create: `packages/shared/src/types/models.ts`
- Create: `docs/DATABASE_SCHEMA.md`

**Context:** All backend models, API types, and client caching derive from this schema. Design for future extensibility but keep it minimal initially.

- [ ] **Step 1: Write comprehensive database schema documentation**

```markdown
# DATABASE SCHEMA

## Tables (MVP)

### users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Operational state
  current_round_id UUID REFERENCES rounds(id),
  player_status VARCHAR(50) DEFAULT 'inactive', -- inactive, active, extraction
  operational_state JSONB DEFAULT '{}', -- arbitrary operational metadata
  
  -- Statistics
  total_rounds_completed INT DEFAULT 0,
  current_streak INT DEFAULT 0,
  total_missions_completed INT DEFAULT 0
);

### missions
```sql
CREATE TABLE missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'pending', -- pending, active, completed, failed, abandoned
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  target_completion_date TIMESTAMP,
  completed_at TIMESTAMP,
  
  -- Verification
  github_repo_url VARCHAR(512),
  github_issue_id VARCHAR(255),
  verification_method VARCHAR(50) DEFAULT 'manual', -- manual, github, git, ci
  
  -- Operational metadata
  priority INT DEFAULT 0,
  operational_metadata JSONB DEFAULT '{}'
);

### rounds
```sql
CREATE TABLE rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id UUID REFERENCES missions(id),
  
  round_number INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Round lifecycle
  status VARCHAR(50) DEFAULT 'scheduled', -- scheduled, active, completed, failed, abandoned
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Objectives & restrictions
  objectives TEXT NOT NULL, -- JSON-serialized array
  restrictions JSONB DEFAULT '{}', -- blocked sites, max idle time, etc
  
  -- Verification & scoring
  completion_verification JSONB DEFAULT '{}', -- how to verify success
  points_possible INT DEFAULT 100,
  points_earned INT DEFAULT 0,
  
  -- Adaptive difficulty
  difficulty_level INT DEFAULT 1,
  base_difficulty_multiplier FLOAT DEFAULT 1.0,
  
  -- Results
  completed_at TIMESTAMP,
  abandoned_at TIMESTAMP,
  completion_notes TEXT,
  operational_state JSONB DEFAULT '{}'
);

### telemetry_events
```sql
CREATE TABLE telemetry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round_id UUID REFERENCES rounds(id),
  
  event_type VARCHAR(100) NOT NULL, -- app_switched, idle_detected, distraction_detected, github_commit, etc
  source VARCHAR(50) NOT NULL, -- mobile, desktop, extension, manual
  
  -- Event data
  event_data JSONB NOT NULL, -- varies by type
  
  -- Timestamps
  occurred_at TIMESTAMP NOT NULL,
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexing
  is_distraction BOOLEAN DEFAULT FALSE,
  is_productive BOOLEAN DEFAULT FALSE,
  
  INDEX idx_user_round_time (user_id, round_id, occurred_at DESC)
);

### behavioral_records
```sql
CREATE TABLE behavioral_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round_id UUID REFERENCES rounds(id),
  
  -- Aggregated metrics
  total_focus_minutes INT DEFAULT 0,
  distraction_count INT DEFAULT 0,
  app_switches INT DEFAULT 0,
  idle_minutes INT DEFAULT 0,
  recovery_actions INT DEFAULT 0, -- user recoveries after distraction
  
  -- Timestamps
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  
  -- Reputation impact
  reputation_delta INT DEFAULT 0
);

### consequences
```sql
CREATE TABLE consequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round_id UUID REFERENCES rounds(id),
  
  consequence_type VARCHAR(100) NOT NULL, -- streak_break, round_failure, distraction_violation, etc
  severity VARCHAR(50) NOT NULL, -- low, medium, high, critical
  
  description TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Acknowledgment
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

### announcements
```sql
CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  round_id UUID REFERENCES rounds(id),
  
  -- Content
  announcement_type VARCHAR(100) NOT NULL, -- round_start, violation, deadline, recovery_opportunity, etc
  title VARCHAR(255),
  message TEXT NOT NULL,
  
  -- Audio
  voice_file_url VARCHAR(512),
  is_generated BOOLEAN DEFAULT FALSE,
  
  -- Delivery
  status VARCHAR(50) DEFAULT 'pending', -- pending, scheduled, delivered, acknowledged
  scheduled_for TIMESTAMP,
  delivered_at TIMESTAMP,
  
  -- Display
  requires_fullscreen BOOLEAN DEFAULT FALSE,
  priority INT DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

### operational_log
```sql
CREATE TABLE operational_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  event_description TEXT NOT NULL,
  event_category VARCHAR(100), -- system, mission, round, consequence, announcement, etc
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_user_created (user_id, created_at DESC)
);
```

## Data Access Patterns

1. **Real-time round state** → Redis cache, expires on round end
2. **Telemetry aggregation** → Batch write to PostgreSQL, read from telemetry_events
3. **User operational state** → Redis + PostgreSQL with sync on shutdown
4. **Mission progression** → PostgreSQL, cached in memory

## Normalization Notes

- Denormalized operational_state (JSONB) columns for fast operational metadata lookups
- Telemetry events stored row-by-row for time-series queries
- Behavioral records aggregated periodically (batch job)
- Foreign keys enforce referential integrity
```

- [ ] **Step 2: Write schema.sql file**

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  current_round_id UUID,
  player_status VARCHAR(50) DEFAULT 'inactive',
  operational_state JSONB DEFAULT '{}',
  total_rounds_completed INT DEFAULT 0,
  current_streak INT DEFAULT 0,
  total_missions_completed INT DEFAULT 0
);

-- Missions table
CREATE TABLE missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  target_completion_date TIMESTAMP,
  completed_at TIMESTAMP,
  github_repo_url VARCHAR(512),
  github_issue_id VARCHAR(255),
  verification_method VARCHAR(50) DEFAULT 'manual',
  priority INT DEFAULT 0,
  operational_metadata JSONB DEFAULT '{}'
);

-- Rounds table
CREATE TABLE rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id UUID REFERENCES missions(id),
  round_number INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'scheduled',
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  objectives TEXT NOT NULL,
  restrictions JSONB DEFAULT '{}',
  completion_verification JSONB DEFAULT '{}',
  points_possible INT DEFAULT 100,
  points_earned INT DEFAULT 0,
  difficulty_level INT DEFAULT 1,
  base_difficulty_multiplier FLOAT DEFAULT 1.0,
  completed_at TIMESTAMP,
  abandoned_at TIMESTAMP,
  completion_notes TEXT,
  operational_state JSONB DEFAULT '{}'
);

-- Telemetry events table
CREATE TABLE telemetry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round_id UUID REFERENCES rounds(id),
  event_type VARCHAR(100) NOT NULL,
  source VARCHAR(50) NOT NULL,
  event_data JSONB NOT NULL,
  occurred_at TIMESTAMP NOT NULL,
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_distraction BOOLEAN DEFAULT FALSE,
  is_productive BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_telemetry_user_round_time ON telemetry_events(user_id, round_id, occurred_at DESC);

-- Behavioral records table
CREATE TABLE behavioral_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round_id UUID REFERENCES rounds(id),
  total_focus_minutes INT DEFAULT 0,
  distraction_count INT DEFAULT 0,
  app_switches INT DEFAULT 0,
  idle_minutes INT DEFAULT 0,
  recovery_actions INT DEFAULT 0,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  reputation_delta INT DEFAULT 0
);

-- Consequences table
CREATE TABLE consequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round_id UUID REFERENCES rounds(id),
  consequence_type VARCHAR(100) NOT NULL,
  severity VARCHAR(50) NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Announcements table
CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  round_id UUID REFERENCES rounds(id),
  announcement_type VARCHAR(100) NOT NULL,
  title VARCHAR(255),
  message TEXT NOT NULL,
  voice_file_url VARCHAR(512),
  is_generated BOOLEAN DEFAULT FALSE,
  status VARCHAR(50) DEFAULT 'pending',
  scheduled_for TIMESTAMP,
  delivered_at TIMESTAMP,
  requires_fullscreen BOOLEAN DEFAULT FALSE,
  priority INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Operational log table
CREATE TABLE operational_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_description TEXT NOT NULL,
  event_category VARCHAR(100),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_operational_log_user_created ON operational_log(user_id, created_at DESC);

-- Add foreign key for current_round_id after rounds table exists
ALTER TABLE users ADD CONSTRAINT fk_users_current_round
  FOREIGN KEY (current_round_id) REFERENCES rounds(id) ON DELETE SET NULL;
```

- [ ] **Step 3: Create shared types file**

```typescript
// packages/shared/src/types/models.ts

export type PlayerStatus = 'inactive' | 'active' | 'extraction';
export type MissionStatus = 'pending' | 'active' | 'completed' | 'failed' | 'abandoned';
export type RoundStatus = 'scheduled' | 'active' | 'completed' | 'failed' | 'abandoned';
export type TelemetryEventType =
  | 'app_switched'
  | 'idle_detected'
  | 'distraction_detected'
  | 'focus_resumed'
  | 'github_commit'
  | 'manual_check_in'
  | 'terminal_activity'
  | 'code_review_completed';

export interface User {
  id: string;
  email: string;
  playerStatus: PlayerStatus;
  currentRoundId?: string;
  totalRoundsCompleted: number;
  currentStreak: number;
  totalMissionsCompleted: number;
  operationalState: Record<string, any>;
  createdAt: Date;
}

export interface Mission {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status: MissionStatus;
  targetCompletionDate?: Date;
  completedAt?: Date;
  verificationMethod: 'manual' | 'github' | 'git' | 'ci';
  priority: number;
  operationalMetadata: Record<string, any>;
}

export interface Round {
  id: string;
  userId: string;
  missionId?: string;
  roundNumber: number;
  title: string;
  description?: string;
  status: RoundStatus;
  startsAt: Date;
  endsAt: Date;
  objectives: string[];
  restrictions: Record<string, any>;
  difficultyLevel: number;
  pointsPossible: number;
  pointsEarned: number;
  completedAt?: Date;
  operationalState: Record<string, any>;
}

export interface TelemetryEvent {
  id: string;
  userId: string;
  roundId?: string;
  eventType: TelemetryEventType;
  source: 'mobile' | 'desktop' | 'extension' | 'manual';
  eventData: Record<string, any>;
  occurredAt: Date;
  isDistraction: boolean;
  isProductive: boolean;
}

export interface BehavioralRecord {
  id: string;
  userId: string;
  roundId?: string;
  totalFocusMinutes: number;
  distractionCount: number;
  appSwitches: number;
  idleMinutes: number;
  recoveryActions: number;
  reputationDelta: number;
  periodStart: Date;
  periodEnd: Date;
}

export interface Consequence {
  id: string;
  userId: string;
  roundId?: string;
  consequenceType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  acknowledged: boolean;
  createdAt: Date;
}

export interface Announcement {
  id: string;
  userId: string;
  roundId?: string;
  announcementType: string;
  message: string;
  voiceFileUrl?: string;
  requiresFullscreen: boolean;
  priority: number;
  status: 'pending' | 'scheduled' | 'delivered' | 'acknowledged';
}
```

- [ ] **Step 4: Commit schema**

```bash
git add packages/backend/src/database/schema.sql packages/shared/src/types/models.ts docs/DATABASE_SCHEMA.md
git commit -m "docs: define database schema and shared TypeScript models"
```

---

### Task 0.3: Design API Contract & Event Schema

**Files:**
- Create: `docs/API_SPECIFICATION.md`
- Create: `docs/EVENT_SCHEMA.md`

**Context:** Backend APIs and real-time events are the contracts between all subsystems. Define them explicitly before implementation.

- [ ] **Step 1: Document REST API endpoints**

```markdown
# API SPECIFICATION

## Authentication
All endpoints require JWT Bearer token except /auth/register and /auth/login.

```
Authorization: Bearer <jwt_token>
```

## Endpoints

### Authentication
- POST /api/auth/register
  - Body: { email, password }
  - Response: { token, user }

- POST /api/auth/login
  - Body: { email, password }
  - Response: { token, user }

### Users
- GET /api/users/me
  - Response: User object

- PATCH /api/users/me
  - Body: Partial User
  - Response: Updated User

### Missions
- GET /api/missions
  - Query: ?status=active, ?skip=0, ?take=20
  - Response: Mission[]

- POST /api/missions
  - Body: { title, description, targetCompletionDate, verificationMethod }
  - Response: Mission

- GET /api/missions/:id
  - Response: Mission

- PATCH /api/missions/:id
  - Body: Partial Mission
  - Response: Updated Mission

### Rounds
- GET /api/rounds/current
  - Response: Round | null

- GET /api/rounds
  - Query: ?missionId=?, ?status=?, ?skip=0, ?take=20
  - Response: Round[]

- POST /api/rounds
  - Body: { missionId?, title, description, startsAt, endsAt, objectives[], restrictions, difficultyLevel }
  - Response: Round (with id)
  - Side effect: Starts background round lifecycle

- GET /api/rounds/:id
  - Response: Round

- PATCH /api/rounds/:id
  - Body: { status?, operationalState?, completionNotes? }
  - Response: Updated Round

### Telemetry
- POST /api/telemetry/events
  - Body: { eventType, source, eventData, occurredAt }
  - Response: { acknowledged: true }
  - Note: Bulk telemetry also accepted as array

- GET /api/telemetry/events
  - Query: ?roundId=?, ?eventType=?, ?skip=0, ?take=100
  - Response: TelemetryEvent[]

- GET /api/rounds/:id/behavioral-record
  - Response: BehavioralRecord

### Announcements
- GET /api/announcements
  - Query: ?status=pending, ?roundId=?
  - Response: Announcement[]

- PATCH /api/announcements/:id/acknowledge
  - Body: {}
  - Response: Updated Announcement

### Consequences
- GET /api/consequences
  - Query: ?roundId=?, ?skip=0, ?take=50
  - Response: Consequence[]

- PATCH /api/consequences/:id/acknowledge
  - Body: {}
  - Response: Updated Consequence

## Pagination
All list endpoints support:
- skip (default 0)
- take (default 20, max 100)

## Error Responses
```json
{
  "statusCode": 400,
  "message": "Human-readable error",
  "error": "BadRequest"
}
```
```

- [ ] **Step 2: Document real-time event schema (Socket.io)**

```markdown
# EVENT SCHEMA (Socket.io)

All events go through Socket.io namespace: /operational

## Client → Server Events

### telemetry:ingest
```json
{
  "eventType": "app_switched",
  "source": "desktop",
  "eventData": {
    "appName": "VSCode",
    "focusDuration": 1200,
    "previousApp": "Chrome"
  },
  "occurredAt": "2026-05-15T10:30:00Z"
}
```

### round:status-update
```json
{
  "roundId": "uuid",
  "status": "active|paused|completed|abandoned",
  "metadata": {}
}
```

### user:check-in
```json
{
  "roundId": "uuid",
  "message": "Started coding session"
}
```

## Server → Client Events (broadcast to specific user)

### round:started
```json
{
  "roundId": "uuid",
  "round": { /* Round object */ },
  "announcement": { /* Announcement to play */ }
}
```

### round:ended
```json
{
  "roundId": "uuid",
  "status": "completed|failed|abandoned",
  "summary": {
    "pointsEarned": 85,
    "focusMinutes": 120,
    "distractions": 3
  }
}
```

### announcement:incoming
```json
{
  "announcementId": "uuid",
  "type": "round_start|violation|deadline|recovery_opportunity",
  "message": "Critical deadline window approaching",
  "requiresFullscreen": true,
  "voiceUrl": "https://..."
}
```

### behavioral:distraction-detected
```json
{
  "roundId": "uuid",
  "eventId": "uuid",
  "type": "instagram|youtube|netflix|random_browsing",
  "intensity": "low|medium|high",
  "timestamp": "2026-05-15T10:30:00Z"
}
```

### consequence:issued
```json
{
  "consequenceId": "uuid",
  "type": "streak_break|round_failure|violation_penalty",
  "severity": "low|medium|high|critical",
  "message": "Streak broken: Distraction violation during critical round"
}
```

### stats:update
```json
{
  "userId": "uuid",
  "stats": {
    "currentStreak": 5,
    "totalRoundsCompleted": 23,
    "reputation": 450
  }
}
```

## Backend → All Clients (broadcast)

### system:announcement
```json
{
  "message": "Server maintenance in 5 minutes",
  "severity": "info|warning|critical"
}
```
```

- [ ] **Step 3: Create API specification file**

```bash
cat > docs/API_SPECIFICATION.md << 'EOF'
# API SPECIFICATION

See steps above for full documentation.
This file is populated during implementation.
EOF
```

- [ ] **Step 4: Create event schema file**

```bash
cat > docs/EVENT_SCHEMA.md << 'EOF'
# EVENT SCHEMA

See steps above for full Socket.io event documentation.
EOF
```

- [ ] **Step 5: Commit**

```bash
git add docs/API_SPECIFICATION.md docs/EVENT_SCHEMA.md
git commit -m "docs: define REST API and real-time event contracts"
```

---

### Task 0.4: Initialize Backend Package with NestJS

**Files:**
- Create: `packages/backend/package.json`
- Create: `packages/backend/src/main.ts`
- Create: `packages/backend/.env.example`
- Create: `packages/backend/tsconfig.json`

**Context:** Backend is the operational hub. Initialize NestJS structure for mission orchestration.

- [ ] **Step 1: Create backend package.json**

```json
{
  "name": "@extraction/backend",
  "version": "0.0.1",
  "description": "Project Extraction backend - mission orchestration engine",
  "main": "dist/main.js",
  "scripts": {
    "dev": "nest start --watch",
    "build": "nest build",
    "start": "node dist/main.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "typeorm": "typeorm",
    "migration:generate": "typeorm migration:generate",
    "migration:run": "typeorm migration:run",
    "migration:revert": "typeorm migration:revert"
  },
  "dependencies": {
    "@nestjs/common": "^10.2.0",
    "@nestjs/core": "^10.2.0",
    "@nestjs/jwt": "^11.0.0",
    "@nestjs/passport": "^10.0.0",
    "@nestjs/platform-express": "^10.2.0",
    "@nestjs/typeorm": "^9.0.0",
    "@nestjs/websockets": "^10.2.0",
    "@nestjs/microservices": "^10.2.0",
    "@types/node": "^20.0.0",
    "bcrypt": "^5.1.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.0",
    "dotenv": "^16.3.1",
    "pg": "^8.11.0",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "reflect-metadata": "^0.1.13",
    "socket.io": "^4.6.0",
    "redis": "^4.6.0",
    "bull": "^4.11.0",
    "typeorm": "^0.3.16",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.2.0",
    "@nestjs/schematics": "^10.0.0",
    "@nestjs/testing": "^10.2.0",
    "@types/jest": "^29.5.0",
    "@types/bcrypt": "^5.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.40.0",
    "jest": "^29.5.0",
    "ts-jest": "^29.1.0",
    "ts-loader": "^9.4.0",
    "typescript": "^5.1.0"
  }
}
```

- [ ] **Step 2: Create main.ts entry point**

```typescript
// packages/backend/src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // WebSocket adapter
  app.useWebSocketAdapter(new IoAdapter(app));

  // CORS for mobile/extension
  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:8081'], // mobile dev
    credentials: true,
  });

  const PORT = process.env.PORT || 3001;
  await app.listen(PORT);
  console.log(`✓ Operational hub listening on port ${PORT}`);
}

bootstrap();
```

- [ ] **Step 3: Create .env.example**

```env
# Backend Configuration
NODE_ENV=development
PORT=3001
DEBUG=true

# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=extraction
DATABASE_PASSWORD=development
DATABASE_NAME=extraction_dev

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=extraction-development-secret-change-in-production
JWT_EXPIRES_IN=7d

# External APIs
ELEVENLABS_API_KEY=your-api-key
ELEVENLABS_VOICE_ID=default-voice-id

# Ollama (local)
OLLAMA_BASE_URL=http://localhost:11434

# GitHub (optional, for mission verification)
GITHUB_TOKEN=your-token

# Deployment
DEPLOYMENT_ENV=development
```

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "moduleResolution": "node",
    "baseUrl": "./src",
    "paths": {
      "@/*": ["./*"]
    },
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 5: Create empty app module (placeholder)**

```typescript
// packages/backend/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // TypeORM will be configured here in Task 1.1
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

- [ ] **Step 6: Commit backend setup**

```bash
git add packages/backend/
git commit -m "chore: initialize NestJS backend package"
```

---

### Task 0.5: Create Shared Package Structure

**Files:**
- Create: `packages/shared/src/types/index.ts`
- Create: `packages/shared/src/constants/events.ts`
- Create: `packages/shared/src/constants/telemetry.ts`
- Create: `packages/shared/package.json`

**Context:** Shared types and constants are imported by all clients to maintain consistency.

- [ ] **Step 1: Create shared package.json**

```json
{
  "name": "@extraction/shared",
  "version": "0.0.1",
  "description": "Shared types and constants",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc"
  },
  "devDependencies": {
    "typescript": "^5.1.0"
  }
}
```

- [ ] **Step 2: Create event constants**

```typescript
// packages/shared/src/constants/events.ts

export const OPERATIONAL_EVENTS = {
  // Round lifecycle
  ROUND_SCHEDULED: 'round:scheduled',
  ROUND_STARTED: 'round:started',
  ROUND_ENDED: 'round:ended',
  ROUND_ABANDONED: 'round:abandoned',
  ROUND_PAUSED: 'round:paused',
  ROUND_RESUMED: 'round:resumed',

  // Announcements
  ANNOUNCEMENT_INCOMING: 'announcement:incoming',
  ANNOUNCEMENT_ACKNOWLEDGED: 'announcement:acknowledged',
  ANNOUNCEMENT_PLAYED: 'announcement:played',

  // Behavioral
  DISTRACTION_DETECTED: 'behavioral:distraction-detected',
  FOCUS_SESSION_STARTED: 'behavioral:focus-started',
  FOCUS_SESSION_ENDED: 'behavioral:focus-ended',
  IDLE_DETECTED: 'behavioral:idle-detected',
  RECOVERY_ACTION: 'behavioral:recovery-action',

  // Consequences
  CONSEQUENCE_ISSUED: 'consequence:issued',
  CONSEQUENCE_ACKNOWLEDGED: 'consequence:acknowledged',

  // Stats
  STATS_UPDATE: 'stats:update',
  REPUTATION_CHANGE: 'reputation:change',
  STREAK_UPDATE: 'streak:update',

  // System
  OPERATIONAL_STATE_CHANGED: 'operational:state-changed',
  SYSTEM_ERROR: 'system:error',
  TELEMETRY_BATCH: 'telemetry:batch',
} as const;

export const TELEMETRY_EVENT_TYPES = {
  APP_SWITCHED: 'app_switched',
  IDLE_DETECTED: 'idle_detected',
  FOCUS_RESUMED: 'focus_resumed',
  DISTRACTION_DETECTED: 'distraction_detected',
  GITHUB_COMMIT: 'github_commit',
  TERMINAL_ACTIVITY: 'terminal_activity',
  CODE_REVIEW_COMPLETED: 'code_review_completed',
  MANUAL_CHECK_IN: 'manual_check_in',
  SITE_VISITED: 'site_visited',
  VIDEO_WATCHED: 'video_watched',
} as const;

export type OperationalEventType = typeof OPERATIONAL_EVENTS[keyof typeof OPERATIONAL_EVENTS];
export type TelemetryEventType = typeof TELEMETRY_EVENT_TYPES[keyof typeof TELEMETRY_EVENT_TYPES];
```

- [ ] **Step 3: Create telemetry constants**

```typescript
// packages/shared/src/constants/telemetry.ts

export const DISTRACTION_SITES = {
  INSTAGRAM: 'instagram.com',
  INSTAGRAM_WEB: 'www.instagram.com',
  YOUTUBE: 'youtube.com',
  YOUTUBE_WEB: 'www.youtube.com',
  NETFLIX: 'netflix.com',
  NETFLIX_WEB: 'www.netflix.com',
  TIKTOK: 'tiktok.com',
  TIKTOK_WEB: 'www.tiktok.com',
  REDDIT: 'reddit.com',
  REDDIT_WEB: 'www.reddit.com',
  TWITTER: 'twitter.com',
  X: 'x.com',
};

export const PRODUCTIVE_APPS = {
  VSCODE: 'Visual Studio Code',
  INTELLIJ: 'IntelliJ IDEA',
  CURSOR: 'Cursor',
  TERMINAL: 'Terminal',
  ITERM: 'iTerm2',
  GIT: 'git',
  GITHUB_CLI: 'gh',
};

export const IDLE_THRESHOLD_MINUTES = 5;
export const DISTRACTION_VIOLATION_COOLDOWN_SECONDS = 30;
export const FOCUS_SESSION_MIN_DURATION_MINUTES = 25;

export const TELEMETRY_SOURCE = {
  MOBILE: 'mobile',
  DESKTOP: 'desktop',
  EXTENSION: 'extension',
  MANUAL: 'manual',
} as const;

export const DISTRACTION_INTENSITY = {
  LOW: 'low', // scrolled past
  MEDIUM: 'medium', // spent 1-5 minutes
  HIGH: 'high', // spent 5+ minutes
} as const;
```

- [ ] **Step 4: Create shared index.ts**

```typescript
// packages/shared/src/index.ts
export * from './types/models';
export * from './constants/events';
export * from './constants/telemetry';
```

- [ ] **Step 5: Commit shared package**

```bash
git add packages/shared/
git commit -m "chore: initialize shared types and constants package"
```

---

## Phase 1: Backend Core Implementation

Subsequent phases will implement the actual mission engine, mobile app, extension, and desktop agent. Each major subsystem is broken into focused tasks.

**Note:** This plan provides the architectural foundation. Recommend splitting Phase 1-5 into separate focused implementation plans per subsystem for cleaner parallel execution.

---

## Implementation Roadmap Summary

| Phase | Components | Key Deliverable | Est. Duration |
|-------|-----------|-----------------|---|
| **Phase 0** (Complete) | Monorepo, DB Schema, API Contracts | Foundation ready | ✓ |
| **Phase 1** | Backend Core (Auth, Users, Missions) | REST API + Socket.io | 3-4 days |
| **Phase 2** | Mission Engine & Round System | Round orchestration, scoring | 4-5 days |
| **Phase 3** | Mobile App (Primary UI) | React Native dashboard, announcements | 5-6 days |
| **Phase 4** | Desktop Agent & Extension | Behavioral telemetry pipeline | 3-4 days |
| **Phase 5** | AI & Immersion Systems | TTS announcements, ambient effects | 2-3 days |
| **Phase 6** | Integration & Polish | E2E testing, deployment | 2-3 days |

---

## Architecture Decision Log

1. **NestJS as backend framework:** Mature, TypeScript-first, built-in WebSocket support, dependency injection for clean testability.

2. **PostgreSQL + Redis hybrid:** PostgreSQL for persistent operational state; Redis for real-time session data and event streaming.

3. **Socket.io for real-time events:** Simpler than gRPC for client-server updates. Desktop agent can use gRPC internally, but clients sync via Socket.io.

4. **React Native for mobile:** Cross-platform (iOS/Android), Expo for rapid dev iteration, native module bridge for background service.

5. **Manifest V3 for extension:** Future-proof, required by Chrome 2024+.

6. **Monorepo (Turborepo):** Shared types, unified CI/CD, easy client-server sync.

7. **ElevenLabs + Ollama:** Cloud TTS for quality, local fallback for offline operation.

---

## Critical Implementation Notes

- **Real-time immersion:** All clients must stay synced. Use Socket.io for low-latency operational state updates.
- **Behavioral verification:** Git commits, terminal activity, IDE metrics must flow into telemetry. Trust but verify.
- **Offline resilience:** Mobile and desktop agents must cache locally and sync on reconnect.
- **Performance:** Telemetry can be high-volume. Use Redis pub/sub for real-time events; batch write to PostgreSQL.
- **Security:** JWT tokens, HTTPS only, rate limit APIs, validate all telemetry inputs.
- **Gradual escalation:** Difficulty must increase beyond player capability to create psychological pressure. Monitor performance trends.
