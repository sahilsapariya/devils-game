import { Injectable } from '@nestjs/common';

export interface QualityCheckResult {
  passed: boolean;
  reason?: string;
}

const BANNED_PATTERNS: { rx: RegExp; label: string }[] = [
  { rx: /\byou can do it\b/i, label: 'motivational phrase: "you can do it"' },
  { rx: /\bbelieve in (yourself|you)\b/i, label: 'motivational phrase: "believe in yourself"' },
  { rx: /\bbelieve\b/i, label: 'motivational phrase: "believe"' },
  { rx: /\bgreat job\b/i, label: 'cheerful praise: "great job"' },
  { rx: /\bamazing\b/i, label: 'motivational adjective: "amazing"' },
  { rx: /\bawesome\b/i, label: 'motivational adjective: "awesome"' },
  { rx: /\bfantastic\b/i, label: 'motivational adjective: "fantastic"' },
  { rx: /\bgood luck\b/i, label: 'sentimental: "good luck"' },
  { rx: /\bsorry\b/i, label: 'apologetic: "sorry"' },
  { rx: /\bplease\b/i, label: 'soft request: "please"' },
  { rx: /\b(yay|woohoo|hooray)\b/i, label: 'playful exclamation' },
];

// Emoji + pictograph detection (covers extended unicode blocks).
const EMOJI_RX = /(?:[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{1F000}-\u{1F02F}])/u;

const MARKDOWN_RX = /(^|\s)([*_]{1,3}[^*_\s][^*_]*[^*_\s][*_]{1,3})|(^#{1,6}\s)|(^\s*[-*+]\s)|(`[^`]+`)/m;

@Injectable()
export class QualityGatesService {
  check(text: string): QualityCheckResult {
    const trimmed = (text ?? '').trim();
    if (trimmed.length < 5) {
      return { passed: false, reason: `too short (${trimmed.length} chars)` };
    }
    if (trimmed.length > 300) {
      return { passed: false, reason: `too long (${trimmed.length} chars)` };
    }
    if (EMOJI_RX.test(trimmed)) {
      return { passed: false, reason: 'contains emoji' };
    }
    if (MARKDOWN_RX.test(trimmed)) {
      return { passed: false, reason: 'contains markdown formatting' };
    }
    for (const { rx, label } of BANNED_PATTERNS) {
      if (rx.test(trimmed)) {
        return { passed: false, reason: `banned phrase — ${label}` };
      }
    }
    return { passed: true };
  }
}
