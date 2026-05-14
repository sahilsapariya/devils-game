/**
 * Operational event type identifiers — the canonical taxonomy used by
 * the event sourcing layer across all subsystems.
 *
 * Naming convention: `<domain>.<verb>` (lowercase, dot-separated).
 * Once published these strings are append-only: never rename, only add.
 */
export declare const OPERATIONAL_EVENTS: {
    readonly ROUND_SCHEDULED: "round.scheduled";
    readonly ROUND_STARTED: "round.started";
    readonly ROUND_PAUSED: "round.paused";
    readonly ROUND_RESUMED: "round.resumed";
    readonly ROUND_COMPLETED: "round.completed";
    readonly ROUND_FAILED: "round.failed";
    readonly ROUND_ABANDONED: "round.abandoned";
    readonly STATE_TRANSITION: "state.transition";
    readonly ANNOUNCEMENT_GENERATED: "announcement.generated";
    readonly ANNOUNCEMENT_PLAYED: "announcement.played";
    readonly ANNOUNCEMENT_ACKNOWLEDGED: "announcement.acknowledged";
    readonly CONSEQUENCE_ISSUED: "consequence.issued";
    readonly CONSEQUENCE_ACKNOWLEDGED: "consequence.acknowledged";
    readonly DIFFICULTY_ADJUSTED: "difficulty.adjusted";
    readonly DIFFICULTY_CEILING_UPDATED: "difficulty.ceiling_updated";
};
export declare const BEHAVIORAL_EVENTS: {
    readonly FOCUS_SESSION_STARTED: "behavior.focus_session_started";
    readonly FOCUS_SESSION_ENDED: "behavior.focus_session_ended";
    readonly APP_SWITCHED: "behavior.app_switched";
    readonly IDLE_DETECTED: "behavior.idle_detected";
    readonly IDLE_ENDED: "behavior.idle_ended";
    readonly DISTRACTION_DETECTED: "behavior.distraction_detected";
    readonly RECOVERY_ACTION: "behavior.recovery_action";
    readonly GIT_COMMIT: "telemetry.git_commit";
    readonly TERMINAL_ACTIVITY: "telemetry.terminal_activity";
    readonly CODE_REVIEW: "telemetry.code_review";
};
export declare const AUTH_EVENTS: {
    readonly USER_REGISTERED: "auth.user_registered";
    readonly USER_LOGGED_IN: "auth.user_logged_in";
    readonly USER_LOGGED_OUT: "auth.user_logged_out";
    readonly PASSWORD_CHANGED: "auth.password_changed";
};
/** Socket.io channel namespaces. */
export declare const SOCKET_NAMESPACES: {
    readonly OPERATIONAL: "/operational";
};
/** Client → server socket events. */
export declare const SOCKET_CLIENT_EVENTS: {
    readonly TELEMETRY_BATCH: "telemetry:batch";
    readonly ROUND_STATUS: "round:status";
    readonly USER_CHECK_IN: "user:check-in";
};
/** Server → client socket events. */
export declare const SOCKET_SERVER_EVENTS: {
    readonly ROUND_STARTED: "round:started";
    readonly ROUND_UPDATED: "round:updated";
    readonly ROUND_ENDED: "round:ended";
    readonly BEHAVIORAL_VIOLATION: "behavioral:violation-detected";
    readonly ANNOUNCEMENT_INCOMING: "announcement:incoming";
    readonly CONSEQUENCE_ISSUED: "consequence:issued";
    readonly STATS_UPDATE: "stats:update";
    readonly STATE_TRANSITIONED: "state:transitioned";
};
/** Redis pub/sub channel names. */
export declare const REDIS_CHANNELS: {
    readonly EVENT_BROADCAST: "extraction:events:broadcast";
    readonly ANNOUNCEMENT_QUEUE: "extraction:announcements:queue";
    readonly TELEMETRY_INGESTED: "extraction:telemetry:ingested";
};
export type OperationalEventType = (typeof OPERATIONAL_EVENTS)[keyof typeof OPERATIONAL_EVENTS];
export type BehavioralEventType = (typeof BEHAVIORAL_EVENTS)[keyof typeof BEHAVIORAL_EVENTS];
export type AuthEventType = (typeof AUTH_EVENTS)[keyof typeof AUTH_EVENTS];
export type AnyEventType = OperationalEventType | BehavioralEventType | AuthEventType;
//# sourceMappingURL=events.d.ts.map