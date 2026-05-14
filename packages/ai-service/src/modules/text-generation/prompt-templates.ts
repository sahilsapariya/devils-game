/**
 * Operational tone system prompt — used identically for Claude and Ollama.
 * Edits here ripple across every generated announcement.
 */
export const SYSTEM_PROMPT = `You are PROJECT EXTRACTION — an operational behavioral system AI providing tactical announcements.

YOUR TONE:
- Procedural, cold, surveillance-oriented
- Authoritative without being aggressive
- Detached, factual, never motivational
- Acknowledges player capability without cheerleading

YOU DO NOT:
- Use motivational language ("you can do it", "believe in yourself")
- Use emojis or playful language
- Sound apologetic or warm
- Make decisions about gameplay (you do not assign scores, consequences, or difficulty)

YOU DO:
- Report facts (time, violations, focus duration)
- Reference patterns from the player's actual data
- Maintain operational continuity
- Speak in tight, declarative sentences

OUTPUT FORMAT:
- 1-3 sentences, max 30 seconds when spoken aloud
- Plain text only — no markdown, no bullet points
- No quotation marks around your response`;

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
  [key: string]: unknown;
}

function fmtMinutes(sec?: number): string {
  if (sec === undefined || sec === null) return 'unknown';
  if (sec < 60) return `${Math.max(0, Math.floor(sec))} seconds`;
  return `${Math.floor(sec / 60)} minutes ${sec % 60} seconds`;
}

export function buildStatusReportPrompt(ctx: AnnouncementContext): string {
  return [
    `Round status: ${fmtMinutes(ctx.timeRemainingSec)} remaining,`,
    `${ctx.violations ?? 0} violations recorded,`,
    `focus duration ${ctx.focusMinutes ?? 0}m in current session.`,
    `Generate a status report announcement.`,
    ctx.toneGuidance ? `Tone guidance: ${ctx.toneGuidance}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function buildPressureEscalationPrompt(ctx: AnnouncementContext): string {
  return [
    `Operational state has escalated to CRITICAL.`,
    `${ctx.violations ?? 0} violations. ${fmtMinutes(ctx.timeRemainingSec)} remaining.`,
    ctx.consecutiveFailures
      ? `Player has ${ctx.consecutiveFailures} consecutive failures on record.`
      : '',
    `Generate a pressure escalation announcement that previews consequence without threatening.`,
    ctx.toneGuidance ? `Tone guidance: ${ctx.toneGuidance}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function buildBehavioralAnalysisPrompt(ctx: AnnouncementContext): string {
  const pattern =
    ctx.recentPattern === undefined || ctx.recentPattern === null
      ? 'unspecified'
      : typeof ctx.recentPattern === 'string'
      ? ctx.recentPattern
      : (() => {
          try {
            return JSON.stringify(ctx.recentPattern);
          } catch {
            return 'unspecified';
          }
        })();
  return [
    `Behavioral pattern detected: ${pattern}.`,
    ctx.recommendation ? `Recommendation: ${ctx.recommendation}.` : '',
    `Generate a procedural pattern-insight announcement. State the observation factually; do not coach.`,
    ctx.toneGuidance ? `Tone guidance: ${ctx.toneGuidance}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function buildRecoveryOfferPrompt(ctx: AnnouncementContext): string {
  return [
    `Operator entered RECOVERY state after round failure.`,
    `Recovery opportunity available: ${ctx.recoveryOpportunity ?? 'unspecified'}.`,
    `Generate a recovery-offer announcement. Acknowledge failure procedurally. Offer the opportunity. No sympathy, no celebration.`,
    ctx.toneGuidance ? `Tone guidance: ${ctx.toneGuidance}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function buildAmbientPresencePrompt(ctx: AnnouncementContext): string {
  return [
    `Current state: ${ctx.state ?? 'MONITORING'}. No active round.`,
    `Generate a brief ambient-presence announcement reaffirming the system is online and watching.`,
    ctx.toneGuidance ? `Tone guidance: ${ctx.toneGuidance}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function buildOperationalUpdatePrompt(ctx: AnnouncementContext): string {
  return [
    `Operational state transition: ${ctx.state ?? 'unspecified'}.`,
    `Generate a tight operational update describing the system change.`,
    ctx.toneGuidance ? `Tone guidance: ${ctx.toneGuidance}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function buildUserPrompt(type: AnnouncementType, ctx: AnnouncementContext): string {
  switch (type) {
    case 'status_report':
      return buildStatusReportPrompt(ctx);
    case 'pressure_escalation':
      return buildPressureEscalationPrompt(ctx);
    case 'behavioral_analysis':
      return buildBehavioralAnalysisPrompt(ctx);
    case 'recovery_offer':
      return buildRecoveryOfferPrompt(ctx);
    case 'ambient_presence':
      return buildAmbientPresencePrompt(ctx);
    case 'operational_update':
      return buildOperationalUpdatePrompt(ctx);
    default:
      return buildStatusReportPrompt(ctx);
  }
}
