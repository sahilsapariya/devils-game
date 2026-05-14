/**
 * Telemetry classification constants shared across the desktop agent,
 * browser extension, and backend inference engine.
 *
 * Lists are intentionally curated and conservative. Additions require
 * review — false positives erode user trust in the verification layer.
 */
/** Domains classified as distractions (lowercase, no protocol, no path). */
export declare const DISTRACTION_DOMAINS: ReadonlyArray<string>;
/** Domains classified as productive. */
export declare const PRODUCTIVE_DOMAINS: ReadonlyArray<string>;
/** Application process names classified as productive (case-insensitive substring match). */
export declare const PRODUCTIVE_APPS: ReadonlyArray<string>;
/** Application process names classified as distractions. */
export declare const DISTRACTION_APPS: ReadonlyArray<string>;
/** Idle threshold (seconds of no input) before classifying user as idle. */
export declare const IDLE_THRESHOLD_SECONDS = 300;
/** Telemetry batch upload limits. */
export declare const TELEMETRY_BATCH: Readonly<{
    MAX_EVENTS_PER_BATCH: 100;
    MAX_BATCH_AGE_MS: number;
    MOBILE_FLUSH_INTERVAL_MS: number;
    EXTENSION_FLUSH_INTERVAL_MS: number;
    DESKTOP_FLUSH_INTERVAL_MS: number;
    MAX_RETRY_ATTEMPTS: 5;
    RETRY_BASE_DELAY_MS: 1000;
}>;
/** Anomaly thresholds for behavioral inference. */
export declare const ANOMALY_THRESHOLDS: Readonly<{
    /** More than N git commits within MIN_INTERVAL_MS is suspicious. */
    GIT_COMMITS_PER_MINUTE_MAX: 20;
    /** IDE session length without any commit suggests passive presence. */
    IDLE_IDE_SESSION_MAX_HOURS: 12;
    /** Fraction of round time spent idle that flags abandonment. */
    IDLE_ROUND_FRACTION_MAX: 0.9;
    /** Git commits with zero file changes are suspicious. */
    ZERO_CHANGE_COMMIT_FLAG: true;
}>;
/** Scoring weights for the multi-signal productivity score. Must sum to 1.0. */
export declare const PRODUCTIVITY_WEIGHTS: Readonly<{
    IDE_ACTIVITY: 0.3;
    GIT_ACTIVITY: 0.3;
    FOCUS_DURATION: 0.2;
    DISTRACTION_ABSENCE: 0.1;
    MANUAL_CHECKIN: 0.1;
}>;
/** Round difficulty bounds. */
export declare const DIFFICULTY_BOUNDS: Readonly<{
    DIMENSION_MIN: 1;
    DIMENSION_MAX: 10;
    MULTIPLIER_MIN: 0.5;
    MULTIPLIER_MAX: 2;
    TARGET_SUCCESS_RATE: 0.7;
    CEILING_USAGE_RATIO: 0.85;
    RECOVERY_DIFFICULTY_RATIO: 0.6;
}>;
/** Operational state transition thresholds. */
export declare const STATE_TRANSITION: Readonly<{
    /** Fraction of round time remaining at which OPERATIONAL → CRITICAL. */
    CRITICAL_TIME_REMAINING_RATIO: 0.2;
    /** Number of behavioral violations that force OPERATIONAL → CRITICAL. */
    CRITICAL_VIOLATIONS_THRESHOLD: 2;
    /** Days in RECOVERY before reverting to DORMANT. */
    RECOVERY_TIMEOUT_DAYS: 7;
}>;
/** Offline grace periods (mobile authority window). */
export declare const OFFLINE_GRACE: Readonly<{
    TRANSPARENT_MAX_MINUTES: 10;
    WARNING_MAX_MINUTES: 30;
    ESCALATION_MAX_MINUTES: 120;
}>;
/** Default difficulty starting point for new players. */
export declare const DEFAULT_DIFFICULTY: Readonly<{
    timePressure: number;
    distractionSensitivity: number;
    verificationStrictness: number;
    announcementFrequency: number;
    environmentalPressure: number;
    pointsMultiplier: number;
}>;
//# sourceMappingURL=telemetry.d.ts.map