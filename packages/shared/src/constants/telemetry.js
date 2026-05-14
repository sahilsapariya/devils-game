"use strict";
/**
 * Telemetry classification constants shared across the desktop agent,
 * browser extension, and backend inference engine.
 *
 * Lists are intentionally curated and conservative. Additions require
 * review — false positives erode user trust in the verification layer.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_DIFFICULTY = exports.OFFLINE_GRACE = exports.STATE_TRANSITION = exports.DIFFICULTY_BOUNDS = exports.PRODUCTIVITY_WEIGHTS = exports.ANOMALY_THRESHOLDS = exports.TELEMETRY_BATCH = exports.IDLE_THRESHOLD_SECONDS = exports.DISTRACTION_APPS = exports.PRODUCTIVE_APPS = exports.PRODUCTIVE_DOMAINS = exports.DISTRACTION_DOMAINS = void 0;
/** Domains classified as distractions (lowercase, no protocol, no path). */
exports.DISTRACTION_DOMAINS = Object.freeze([
    'youtube.com',
    'm.youtube.com',
    'twitter.com',
    'x.com',
    'instagram.com',
    'reddit.com',
    'old.reddit.com',
    'tiktok.com',
    'facebook.com',
    'netflix.com',
    'hulu.com',
    'disneyplus.com',
    'twitch.tv',
    'pinterest.com',
    'tumblr.com',
    'snapchat.com',
    'linkedin.com',
    'discord.com',
    'whatsapp.com',
    'telegram.org',
    '9gag.com',
    'imgur.com',
    'buzzfeed.com',
    'quora.com',
    'medium.com',
]);
/** Domains classified as productive. */
exports.PRODUCTIVE_DOMAINS = Object.freeze([
    'github.com',
    'gitlab.com',
    'bitbucket.org',
    'stackoverflow.com',
    'developer.mozilla.org',
    'docs.python.org',
    'docs.djangoproject.com',
    'reactjs.org',
    'react.dev',
    'nestjs.com',
    'typescriptlang.org',
    'docs.npmjs.com',
    'kubernetes.io',
    'docker.com',
    'aws.amazon.com',
    'cloud.google.com',
    'azure.microsoft.com',
    'notion.so',
    'linear.app',
    'jira.atlassian.com',
    'confluence.atlassian.com',
    'figma.com',
    'localhost',
    '127.0.0.1',
]);
/** Application process names classified as productive (case-insensitive substring match). */
exports.PRODUCTIVE_APPS = Object.freeze([
    'code',
    'visual studio code',
    'cursor',
    'intellij',
    'pycharm',
    'webstorm',
    'goland',
    'rubymine',
    'phpstorm',
    'clion',
    'rider',
    'datagrip',
    'android studio',
    'xcode',
    'sublime text',
    'vim',
    'neovim',
    'emacs',
    'terminal',
    'iterm',
    'iterm2',
    'warp',
    'ghostty',
    'alacritty',
    'kitty',
    'tmux',
    'docker',
    'docker desktop',
    'postman',
    'insomnia',
    'tableplus',
    'dbeaver',
    'sequel pro',
    'pgadmin',
    'figma',
    'sketch',
    'notion',
    'obsidian',
    'linear',
]);
/** Application process names classified as distractions. */
exports.DISTRACTION_APPS = Object.freeze([
    'discord',
    'slack',
    'whatsapp',
    'telegram',
    'signal',
    'messages',
    'imessage',
    'spotify',
    'apple music',
    'steam',
    'epic games launcher',
    'battle.net',
    'twitch',
    'youtube',
    'netflix',
    'tiktok',
    'instagram',
    'facebook',
    'reddit',
]);
// ============================================================================
// Threshold constants
// ============================================================================
/** Idle threshold (seconds of no input) before classifying user as idle. */
exports.IDLE_THRESHOLD_SECONDS = 300; // 5 minutes
/** Telemetry batch upload limits. */
exports.TELEMETRY_BATCH = Object.freeze({
    MAX_EVENTS_PER_BATCH: 100,
    MAX_BATCH_AGE_MS: 10 * 60 * 1000, // 10 minutes
    MOBILE_FLUSH_INTERVAL_MS: 30 * 1000, // 30 seconds
    EXTENSION_FLUSH_INTERVAL_MS: 30 * 1000,
    DESKTOP_FLUSH_INTERVAL_MS: 5 * 60 * 1000,
    MAX_RETRY_ATTEMPTS: 5,
    RETRY_BASE_DELAY_MS: 1000,
});
/** Anomaly thresholds for behavioral inference. */
exports.ANOMALY_THRESHOLDS = Object.freeze({
    /** More than N git commits within MIN_INTERVAL_MS is suspicious. */
    GIT_COMMITS_PER_MINUTE_MAX: 20,
    /** IDE session length without any commit suggests passive presence. */
    IDLE_IDE_SESSION_MAX_HOURS: 12,
    /** Fraction of round time spent idle that flags abandonment. */
    IDLE_ROUND_FRACTION_MAX: 0.9,
    /** Git commits with zero file changes are suspicious. */
    ZERO_CHANGE_COMMIT_FLAG: true,
});
/** Scoring weights for the multi-signal productivity score. Must sum to 1.0. */
exports.PRODUCTIVITY_WEIGHTS = Object.freeze({
    IDE_ACTIVITY: 0.3,
    GIT_ACTIVITY: 0.3,
    FOCUS_DURATION: 0.2,
    DISTRACTION_ABSENCE: 0.1,
    MANUAL_CHECKIN: 0.1,
});
/** Round difficulty bounds. */
exports.DIFFICULTY_BOUNDS = Object.freeze({
    DIMENSION_MIN: 1,
    DIMENSION_MAX: 10,
    MULTIPLIER_MIN: 0.5,
    MULTIPLIER_MAX: 2.0,
    TARGET_SUCCESS_RATE: 0.7,
    CEILING_USAGE_RATIO: 0.85,
    RECOVERY_DIFFICULTY_RATIO: 0.6,
});
/** Operational state transition thresholds. */
exports.STATE_TRANSITION = Object.freeze({
    /** Fraction of round time remaining at which OPERATIONAL → CRITICAL. */
    CRITICAL_TIME_REMAINING_RATIO: 0.2,
    /** Number of behavioral violations that force OPERATIONAL → CRITICAL. */
    CRITICAL_VIOLATIONS_THRESHOLD: 2,
    /** Days in RECOVERY before reverting to DORMANT. */
    RECOVERY_TIMEOUT_DAYS: 7,
});
/** Offline grace periods (mobile authority window). */
exports.OFFLINE_GRACE = Object.freeze({
    TRANSPARENT_MAX_MINUTES: 10,
    WARNING_MAX_MINUTES: 30,
    ESCALATION_MAX_MINUTES: 120,
});
/** Default difficulty starting point for new players. */
exports.DEFAULT_DIFFICULTY = Object.freeze({
    timePressure: 3,
    distractionSensitivity: 3,
    verificationStrictness: 3,
    announcementFrequency: 3,
    environmentalPressure: 3,
    pointsMultiplier: 1.0,
});
//# sourceMappingURL=telemetry.js.map