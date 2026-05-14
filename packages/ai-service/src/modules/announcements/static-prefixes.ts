import type { AnnouncementType } from '../text-generation/prompt-templates';

/**
 * Static prefix phrases per announcement type.
 * The AI is asked to generate only the variable tail; the server prepends the
 * prefix before responding. This shaves output tokens off every call.
 */
export const STATIC_PREFIXES: Record<AnnouncementType, string[]> = {
  status_report: [
    'Operational check.',
    'Round status.',
    'Status update.',
  ],
  pressure_escalation: [
    'Critical window.',
    'Threshold breach detected.',
    'Operational status critical.',
  ],
  behavioral_analysis: [
    'Pattern observed.',
    'Behavioral signature analyzed.',
    'Operator profile updated.',
  ],
  recovery_offer: [
    'Recovery channel open.',
    'Round terminated.',
    'Recovery path identified.',
  ],
  ambient_presence: [
    'System online.',
    'Monitoring active.',
    'Standing by.',
  ],
  operational_update: [
    'Operational layer reconfigured.',
    'State transition logged.',
    'System operational update.',
  ],
};

/**
 * Deterministic prefix selection based on a stable hash of the cache key.
 * Same context => same prefix => same cached response.
 */
export function pickPrefix(type: AnnouncementType, cacheKey: string): string {
  const list = STATIC_PREFIXES[type] ?? STATIC_PREFIXES.ambient_presence;
  if (list.length === 0) return '';
  let hash = 0;
  for (let i = 0; i < cacheKey.length; i++) {
    hash = (hash * 31 + cacheKey.charCodeAt(i)) >>> 0;
  }
  return list[hash % list.length] ?? list[0]!;
}

/**
 * Strip a leading prefix from AI output if the model echoed it.
 * Case-insensitive, allows for trailing whitespace.
 */
export function stripLeadingPrefix(text: string, prefix: string): string {
  if (!prefix) return text;
  const trimmedText = text.trimStart();
  const normalizedPrefix = prefix.trim();
  if (trimmedText.toLowerCase().startsWith(normalizedPrefix.toLowerCase())) {
    return trimmedText.slice(normalizedPrefix.length).trimStart();
  }
  return text;
}
