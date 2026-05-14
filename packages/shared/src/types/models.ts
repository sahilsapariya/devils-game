/**
 * Core domain model types for PROJECT EXTRACTION.
 *
 * These interfaces represent the canonical shape of entities exchanged
 * between subsystems (backend, mobile, desktop agent, browser extension).
 *
 * All timestamps are ISO-8601 strings when transmitted across the wire.
 */

// ============================================================================
// Operational States
// ============================================================================

export type OperationalState =
  | 'DORMANT'
  | 'MONITORING'
  | 'OPERATIONAL'
  | 'CRITICAL'
  | 'RECOVERY'
  | 'EXTRACTION'
  | 'SILENCE';

export type RoundStatus =
  | 'scheduled'
  | 'active'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'abandoned';

export type MissionStatus = 'draft' | 'active' | 'completed' | 'archived';

export type ConsequenceType =
  | 'streak_break'
  | 'reputation_penalty'
  | 'recovery_required'
  | 'difficulty_reset'
  | 'cooldown_imposed';

export type ConsequenceSeverity = 'low' | 'medium' | 'high' | 'critical';

export type AnnouncementCategory =
  | 'status_report'
  | 'behavioral_analysis'
  | 'pressure_escalation'
  | 'recovery_offer'
  | 'operational_update'
  | 'ambient_presence'
  | 'final_message';

export type AnnouncementTone =
  | 'calm'
  | 'procedural'
  | 'authoritative'
  | 'urgent'
  | 'supportive'
  | 'celebratory'
  | 'farewell';

// ============================================================================
// User
// ============================================================================

export interface UserPreferences {
  voiceId?: string;
  announcementVolume?: number;
  preferredAnnouncementTimes?: ReadonlyArray<string>;
  notificationChannels?: ReadonlyArray<'push' | 'email'>;
}

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  reputationScore: number;
  currentStreak: number;
  longestStreak: number;
  difficultyCeiling: number;
  preferences: UserPreferences;
  isActive: boolean;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Mission
// ============================================================================

export interface MissionObjective {
  id: string;
  description: string;
  successCriteria: string;
  completed: boolean;
}

export interface Mission {
  id: string;
  userId: string;
  title: string;
  description: string;
  objectives: ReadonlyArray<MissionObjective>;
  status: MissionStatus;
  priority: number;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  totalRounds: number;
  completedRounds: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Round
// ============================================================================

export interface RoundDifficulty {
  timePressure: number;
  distractionSensitivity: number;
  verificationStrictness: number;
  announcementFrequency: number;
  environmentalPressure: number;
  pointsMultiplier: number;
}

export interface RoundStats {
  totalFocusMinutes: number;
  totalIdleMinutes: number;
  appSwitches: number;
  distractionsDetected: number;
  violationsCount: number;
  gitCommitsCount: number;
  productivityScore: number | null;
}

export interface Round {
  id: string;
  userId: string;
  missionId: string;
  status: RoundStatus;
  operationalState: OperationalState;
  difficulty: RoundDifficulty;
  scheduledStart: string;
  scheduledEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  durationMinutes: number;
  stats: RoundStats;
  pointsEarned: number;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Telemetry
// ============================================================================

export type TelemetryEventType =
  | 'app_switched'
  | 'idle_detected'
  | 'idle_ended'
  | 'terminal_activity'
  | 'git_commit'
  | 'ide_activity'
  | 'browser_tab_changed'
  | 'distraction_detected'
  | 'focus_session_started'
  | 'focus_session_ended'
  | 'manual_checkin';

export type TelemetrySource = 'mobile' | 'desktop_agent' | 'extension' | 'backend';

export interface TelemetryEventPayload {
  [key: string]: unknown;
}

export interface TelemetryEvent {
  id: string;
  userId: string;
  roundId: string | null;
  source: TelemetrySource;
  deviceId: string;
  eventType: TelemetryEventType;
  payload: TelemetryEventPayload;
  isProductive: boolean | null;
  confidenceScore: number | null;
  occurredAt: string;
  receivedAt: string;
}

export interface TelemetryBatch {
  deviceId: string;
  source: TelemetrySource;
  signature: string;
  events: ReadonlyArray<Omit<TelemetryEvent, 'id' | 'receivedAt'>>;
  batchedAt: string;
}

// ============================================================================
// Behavioral Record (aggregated)
// ============================================================================

export interface BehavioralRecord {
  id: string;
  userId: string;
  roundId: string | null;
  periodStart: string;
  periodEnd: string;
  totalFocusMinutes: number;
  totalIdleMinutes: number;
  appSwitches: number;
  productiveAppsActive: number;
  distractionsDetected: number;
  gitCommits: number;
  ideActivityMinutes: number;
  terminalCommands: number;
  productivityScore: number;
  anomalyFlags: ReadonlyArray<string>;
  eventCount: number;
  createdAt: string;
}

// ============================================================================
// Consequence
// ============================================================================

export interface Consequence {
  id: string;
  userId: string;
  roundId: string | null;
  consequenceType: ConsequenceType;
  severity: ConsequenceSeverity;
  description: string;
  reputationDelta: number;
  metadata: Record<string, unknown>;
  acknowledgedAt: string | null;
  issuedAt: string;
  createdAt: string;
}

// ============================================================================
// Announcement
// ============================================================================

export interface Announcement {
  id: string;
  userId: string;
  roundId: string | null;
  category: AnnouncementCategory;
  tone: AnnouncementTone;
  content: string;
  voiceUrl: string | null;
  audioDurationSeconds: number | null;
  aiGenerated: boolean;
  qualityGatePassed: boolean;
  metadata: Record<string, unknown>;
  scheduledFor: string;
  deliveredAt: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

// ============================================================================
// Operational Event (Event Sourcing)
// ============================================================================

export interface OperationalEvent<TData = Record<string, unknown>> {
  id: string;
  userId: string;
  roundId: string | null;
  eventType: string;
  eventData: TData;
  occurredAt: string;
  receivedAt: string;
  isProcessed: boolean;
  processedAt: string | null;
}

export interface EventSnapshot {
  id: string;
  userId: string;
  roundId: string | null;
  snapshotAt: string;
  eventCount: number;
  stateData: Record<string, unknown>;
}

// ============================================================================
// Operational Log
// ============================================================================

export interface OperationalLog {
  id: string;
  userId: string;
  roundId: string | null;
  level: 'info' | 'warning' | 'critical';
  message: string;
  context: Record<string, unknown>;
  createdAt: string;
}

// ============================================================================
// Auth payloads
// ============================================================================

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JwtPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}
