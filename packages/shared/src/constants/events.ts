/**
 * Operational event type identifiers — the canonical taxonomy used by
 * the event sourcing layer across all subsystems.
 *
 * Naming convention: `<domain>.<verb>` (lowercase, dot-separated).
 * Once published these strings are append-only: never rename, only add.
 */

export const OPERATIONAL_EVENTS = {
  // Round lifecycle
  ROUND_SCHEDULED: 'round.scheduled',
  ROUND_STARTED: 'round.started',
  ROUND_PAUSED: 'round.paused',
  ROUND_RESUMED: 'round.resumed',
  ROUND_COMPLETED: 'round.completed',
  ROUND_FAILED: 'round.failed',
  ROUND_ABANDONED: 'round.abandoned',

  // State machine
  STATE_TRANSITION: 'state.transition',

  // Announcements
  ANNOUNCEMENT_GENERATED: 'announcement.generated',
  ANNOUNCEMENT_PLAYED: 'announcement.played',
  ANNOUNCEMENT_ACKNOWLEDGED: 'announcement.acknowledged',

  // Consequences
  CONSEQUENCE_ISSUED: 'consequence.issued',
  CONSEQUENCE_ACKNOWLEDGED: 'consequence.acknowledged',

  // Difficulty
  DIFFICULTY_ADJUSTED: 'difficulty.adjusted',
  DIFFICULTY_CEILING_UPDATED: 'difficulty.ceiling_updated',
} as const;

export const BEHAVIORAL_EVENTS = {
  FOCUS_SESSION_STARTED: 'behavior.focus_session_started',
  FOCUS_SESSION_ENDED: 'behavior.focus_session_ended',
  APP_SWITCHED: 'behavior.app_switched',
  IDLE_DETECTED: 'behavior.idle_detected',
  IDLE_ENDED: 'behavior.idle_ended',
  DISTRACTION_DETECTED: 'behavior.distraction_detected',
  RECOVERY_ACTION: 'behavior.recovery_action',
  GIT_COMMIT: 'telemetry.git_commit',
  TERMINAL_ACTIVITY: 'telemetry.terminal_activity',
  CODE_REVIEW: 'telemetry.code_review',
} as const;

export const AUTH_EVENTS = {
  USER_REGISTERED: 'auth.user_registered',
  USER_LOGGED_IN: 'auth.user_logged_in',
  USER_LOGGED_OUT: 'auth.user_logged_out',
  PASSWORD_CHANGED: 'auth.password_changed',
} as const;

/** Socket.io channel namespaces. */
export const SOCKET_NAMESPACES = {
  OPERATIONAL: '/operational',
} as const;

/** Client → server socket events. */
export const SOCKET_CLIENT_EVENTS = {
  TELEMETRY_BATCH: 'telemetry:batch',
  ROUND_STATUS: 'round:status',
  USER_CHECK_IN: 'user:check-in',
} as const;

/** Server → client socket events. */
export const SOCKET_SERVER_EVENTS = {
  ROUND_STARTED: 'round:started',
  ROUND_UPDATED: 'round:updated',
  ROUND_ENDED: 'round:ended',
  BEHAVIORAL_VIOLATION: 'behavioral:violation-detected',
  ANNOUNCEMENT_INCOMING: 'announcement:incoming',
  CONSEQUENCE_ISSUED: 'consequence:issued',
  STATS_UPDATE: 'stats:update',
  STATE_TRANSITIONED: 'state:transitioned',
} as const;

/** Redis pub/sub channel names. */
export const REDIS_CHANNELS = {
  EVENT_BROADCAST: 'extraction:events:broadcast',
  ANNOUNCEMENT_QUEUE: 'extraction:announcements:queue',
  TELEMETRY_INGESTED: 'extraction:telemetry:ingested',
} as const;

export type OperationalEventType =
  (typeof OPERATIONAL_EVENTS)[keyof typeof OPERATIONAL_EVENTS];
export type BehavioralEventType =
  (typeof BEHAVIORAL_EVENTS)[keyof typeof BEHAVIORAL_EVENTS];
export type AuthEventType = (typeof AUTH_EVENTS)[keyof typeof AUTH_EVENTS];

export type AnyEventType =
  | OperationalEventType
  | BehavioralEventType
  | AuthEventType;
