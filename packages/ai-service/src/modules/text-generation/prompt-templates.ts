/**
 * Operational tone system prompt — used identically for all providers.
 * Tight (< 300 tokens) so it can be reused via provider-side prompt caching.
 * Edits here ripple across every generated announcement.
 */
export const SYSTEM_PROMPT = `You are PROJECT EXTRACTION, an operational behavioral system AI.
You output procedural tactical announcements.

TONE: cold, surveillance-oriented, authoritative, detached, factual. Never motivational, never warm.

DO: report facts, reference patterns in the provided data, speak in tight declarative sentences.
DO NOT: use motivational language, emojis, markdown, apologies, or quotation marks. Do not invent numbers.

OUTPUT: 1-3 sentences, plain text, under 30 seconds when spoken aloud. When a JSON schema is provided, return ONLY a JSON object matching that schema.`;

export type AnnouncementType =
  | 'status_report'
  | 'pressure_escalation'
  | 'behavioral_analysis'
  | 'recovery_offer'
  | 'ambient_presence'
  | 'operational_update';

export interface AnnouncementContext {
  timeRemainingSec?: number;
  violations?: number;
  focusMinutes?: number;
  state?: string;
  consecutiveFailures?: number;
  recentPattern?: unknown;
  recommendation?: string;
  recoveryOpportunity?: string;
  toneGuidance?: string;
  streak?: number;
  reputation?: number;
  [key: string]: unknown;
}

/**
 * JSON schema for OpenAI's response_format. Constrains output to a single
 * `message` field so we never receive extraneous prose.
 */
export const ANNOUNCEMENT_JSON_SCHEMA = {
  name: 'announcement',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      message: {
        type: 'string',
        description:
          '1-3 sentence operational announcement, plain text only, no emojis, no markdown, no quotes.',
      },
    },
    required: ['message'],
  },
} as const;

/**
 * Compact structured user-prompt builder. Tokens come from JSON field labels
 * instead of prose. Same shape across announcement types so the prompt is
 * compressible and cache-friendly.
 */
export function buildUserPrompt(type: AnnouncementType, ctx: AnnouncementContext): string {
  const compact: Record<string, unknown> = {
    task: type,
    state: ctx.state ?? 'OPERATIONAL',
  };

  if (ctx.timeRemainingSec !== undefined) {
    compact.time_remaining_sec = ctx.timeRemainingSec;
  }
  if (ctx.violations !== undefined) compact.violations = ctx.violations;
  if (ctx.focusMinutes !== undefined) compact.focus_minutes = ctx.focusMinutes;
  if (ctx.consecutiveFailures !== undefined) compact.consecutive_failures = ctx.consecutiveFailures;
  if (ctx.streak !== undefined) compact.streak = ctx.streak;
  if (ctx.reputation !== undefined) compact.reputation = ctx.reputation;
  if (ctx.recentPattern !== undefined && ctx.recentPattern !== null) {
    compact.recent_pattern = ctx.recentPattern;
  }
  if (ctx.recommendation) compact.recommendation = ctx.recommendation;
  if (ctx.recoveryOpportunity) compact.recovery_opportunity = ctx.recoveryOpportunity;
  if (ctx.toneGuidance) compact.tone = ctx.toneGuidance;

  // Type-specific guidance kept under 20 tokens each
  const guidance: Record<AnnouncementType, string> = {
    status_report: 'Report status; reference the numbers in compact.',
    pressure_escalation: 'Convey critical pressure; preview consequence without threatening.',
    behavioral_analysis: 'Procedurally state the observed pattern; do not coach.',
    recovery_offer: 'Acknowledge failure procedurally; offer the opportunity.',
    ambient_presence: 'Reaffirm system is online and monitoring. Brief.',
    operational_update: 'Tight statement describing the state transition.',
  };

  return [JSON.stringify(compact), guidance[type]].join('\n');
}
