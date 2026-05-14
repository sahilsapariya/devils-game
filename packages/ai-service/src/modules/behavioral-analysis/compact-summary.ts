/**
 * Token-efficient context compaction helpers.
 * Used by announcement generation and behavioral analysis pipelines to keep
 * AI prompts small (< 1000 input tokens for announcements,
 * < 2000 for behavioral analysis).
 */

const ALLOWED_TOP_LEVEL_FIELDS = new Set([
  'state',
  'timeRemainingSec',
  'violations',
  'focusMinutes',
  'consecutiveFailures',
  'streak',
  'reputation',
  'recentPattern',
  'recommendation',
  'recoveryOpportunity',
  'peakProductivityHours',
  'commonDistractions',
  'avgFocusSessionMinutes',
  'recoverySpeedDays',
  'sustainableCeiling',
]);

const MAX_STRING_LEN = 200;
const MAX_ARRAY_LEN = 8;

export interface CompactContext {
  [key: string]: unknown;
}

/**
 * Strip unused fields, truncate long strings, cap array length, and convert
 * sequential numeric arrays (e.g. hours) to compact range strings.
 */
export function compactifyContext(raw: unknown): CompactContext {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const out: CompactContext = {};

  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_TOP_LEVEL_FIELDS.has(key)) continue;
    out[key] = compactValue(key, value);
  }
  return out;
}

function compactValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LEN ? `${value.slice(0, MAX_STRING_LEN)}...` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    // Format known hour arrays as range strings when contiguous
    if (
      key === 'peakProductivityHours' &&
      value.every((v) => typeof v === 'number')
    ) {
      return formatHourRange(value as number[]);
    }
    return value
      .slice(0, MAX_ARRAY_LEN)
      .map((item) =>
        typeof item === 'string' && item.length > MAX_STRING_LEN
          ? `${item.slice(0, MAX_STRING_LEN)}...`
          : item,
      );
  }
  if (typeof value === 'object') {
    // Shallow compact: keep object as-is but truncate any string children
    const obj = value as Record<string, unknown>;
    const inner: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && v.length > MAX_STRING_LEN) {
        inner[k] = `${v.slice(0, MAX_STRING_LEN)}...`;
      } else {
        inner[k] = v;
      }
    }
    return inner;
  }
  return value;
}

/**
 * Convert [9,10,11] -> "9-11am"; [9,10,11,14,15,16] -> "9-11am, 2-4pm".
 * Non-contiguous numbers become comma-separated.
 */
export function formatHourRange(hours: number[]): string {
  if (hours.length === 0) return '';
  const sorted = [...hours].sort((a, b) => a - b);
  const ranges: Array<[number, number]> = [];
  let curStart = sorted[0]!;
  let curEnd = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    const h = sorted[i]!;
    if (h === curEnd + 1) {
      curEnd = h;
    } else {
      ranges.push([curStart, curEnd]);
      curStart = h;
      curEnd = h;
    }
  }
  ranges.push([curStart, curEnd]);

  return ranges.map(([s, e]) => formatRange(s, e)).join(', ');
}

function formatRange(start: number, end: number): string {
  if (start === end) return formatHour(start);
  const s = formatHour(start);
  const eRaw = formatHour(end);
  // If both end with same suffix, drop suffix from start
  const sufStart = s.match(/(am|pm)$/i)?.[0];
  const sufEnd = eRaw.match(/(am|pm)$/i)?.[0];
  if (sufStart && sufEnd && sufStart.toLowerCase() === sufEnd.toLowerCase()) {
    return `${s.replace(/(am|pm)$/i, '')}-${eRaw}`;
  }
  return `${s}-${eRaw}`;
}

function formatHour(h: number): string {
  const norm = ((h % 24) + 24) % 24;
  if (norm === 0) return '12am';
  if (norm === 12) return '12pm';
  return norm < 12 ? `${norm}am` : `${norm - 12}pm`;
}
