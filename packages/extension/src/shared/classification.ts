// Domain classification — metadata-only. We never inspect page contents.

import type { DomainClassification, DomainType } from './types';

/**
 * Domains classified as "distraction." Matching is done by hostname suffix
 * so both "instagram.com" and "www.instagram.com" hit the same rule.
 */
export const DISTRACTION_DOMAINS: readonly string[] = [
  'instagram.com',
  'www.instagram.com',
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'netflix.com',
  'www.netflix.com',
  'tiktok.com',
  'www.tiktok.com',
  'reddit.com',
  'www.reddit.com',
  'old.reddit.com',
  'twitter.com',
  'www.twitter.com',
  'x.com',
  'www.x.com',
  'facebook.com',
  'www.facebook.com',
  'twitch.tv',
  'www.twitch.tv',
];

/**
 * Domains classified as "productive."
 */
export const PRODUCTIVE_DOMAINS: readonly string[] = [
  'github.com',
  'www.github.com',
  'gist.github.com',
  'stackoverflow.com',
  'www.stackoverflow.com',
  'developer.mozilla.org',
  'docs.python.org',
  'nodejs.org',
  'docs.npmjs.com',
  'typescriptlang.org',
  'www.typescriptlang.org',
];

/**
 * Suffix patterns that indicate a productive site (e.g. "docs.*").
 */
const PRODUCTIVE_PREFIXES: readonly string[] = ['docs.', 'developer.'];

function normalizeHostname(hostname: string): string {
  // Lowercase and strip leading dots / trailing dots.
  return hostname.toLowerCase().replace(/^\.+|\.+$/g, '');
}

function matchesAny(hostname: string, list: readonly string[]): boolean {
  for (const candidate of list) {
    if (hostname === candidate) return true;
    if (hostname.endsWith('.' + candidate)) return true;
  }
  return false;
}

export function classifyDomain(hostname: string): DomainClassification {
  if (!hostname) {
    return { isDistraction: false, isProductive: false, type: 'neutral' };
  }
  const host = normalizeHostname(hostname);

  if (matchesAny(host, DISTRACTION_DOMAINS)) {
    return { isDistraction: true, isProductive: false, type: 'distraction' };
  }

  if (matchesAny(host, PRODUCTIVE_DOMAINS)) {
    return { isDistraction: false, isProductive: true, type: 'productive' };
  }

  for (const prefix of PRODUCTIVE_PREFIXES) {
    if (host.startsWith(prefix)) {
      return { isDistraction: false, isProductive: true, type: 'productive' };
    }
  }

  return { isDistraction: false, isProductive: false, type: 'neutral' };
}

/**
 * Extract a hostname from a tab URL. Returns null for chrome://, about:, file:,
 * extension pages, and any URL we cannot safely parse.
 */
export function extractHostname(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const scheme = parsed.protocol.toLowerCase();
    if (scheme !== 'http:' && scheme !== 'https:') return null;
    const host = parsed.hostname;
    if (!host) return null;
    return normalizeHostname(host);
  } catch {
    return null;
  }
}

export type { DomainType };
