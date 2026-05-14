import { Injectable, Logger } from '@nestjs/common';
import { TextGenerationService } from '../text-generation/text-generation.service';
import { SYSTEM_PROMPT } from '../text-generation/prompt-templates';
import { compactifyContext } from './compact-summary';
import type { BehaviorEventDto } from './dto/analyze-behavior.dto';

export interface BehaviorAnalysisResult {
  peakProductivityHours: number[];
  commonDistractions: { domain: string; count: number }[];
  avgFocusSessionMinutes: number;
  recoverySpeedDays: number | null;
  sustainableCeiling: number;
  insights: string[];
  meta: {
    eventCount: number;
    windowDays: number;
    aiInsightsAttempted: boolean;
  };
}

/** Event-type identifiers expected from desktop/extension/mobile agents. */
const FOCUS_START = 'focus_session_started';
const FOCUS_END = 'focus_session_ended';
const DISTRACTION = 'distraction_detected';
const ROUND_FAILED = 'round_failed';
const ROUND_SUCCEEDED = 'round_succeeded';

@Injectable()
export class AnalyzerService {
  private readonly logger = new Logger(AnalyzerService.name);

  constructor(private readonly text: TextGenerationService) {}

  async analyze(
    userId: string,
    events: BehaviorEventDto[],
    windowDays = 14,
    includeAiInsights = true,
  ): Promise<BehaviorAnalysisResult> {
    const stats = this.computeStats(events);
    const meta = {
      eventCount: events.length,
      windowDays,
      aiInsightsAttempted: false,
    };

    let insights: string[] = this.deterministicInsights(stats);

    if (includeAiInsights && events.length >= 10) {
      meta.aiInsightsAttempted = true;
      try {
        const aiInsights = await this.generateAiInsights(userId, stats);
        if (aiInsights.length > 0) insights = aiInsights;
      } catch (err) {
        this.logger.warn(`AI insight generation failed: ${(err as Error).message}`);
      }
    }

    return { ...stats, insights, meta };
  }

  // --- deterministic statistics ---------------------------------------------

  private computeStats(events: BehaviorEventDto[]): Omit<BehaviorAnalysisResult, 'insights' | 'meta'> {
    const hourCounts = new Array(24).fill(0) as number[];
    const domainCounts = new Map<string, number>();
    const focusDurations: number[] = [];
    const focusStartsByKey = new Map<string, number>();
    const recoveryGaps: number[] = [];
    let pendingFailureAt: number | null = null;
    let successCount = 0;
    let failCount = 0;

    for (const ev of events) {
      const ts = this.toMillis(ev.timestamp);
      if (ts === null) continue;
      const hour = new Date(ts).getUTCHours();
      hourCounts[hour] = (hourCounts[hour] ?? 0) + 1;

      if (ev.type === DISTRACTION && ev.domain) {
        domainCounts.set(ev.domain, (domainCounts.get(ev.domain) ?? 0) + 1);
      }

      if (ev.type === FOCUS_START) {
        focusStartsByKey.set('latest', ts);
      } else if (ev.type === FOCUS_END) {
        const startedAt = focusStartsByKey.get('latest');
        if (startedAt && ts > startedAt) {
          focusDurations.push((ts - startedAt) / 60_000);
          focusStartsByKey.delete('latest');
        } else if (typeof ev.durationSec === 'number') {
          focusDurations.push(ev.durationSec / 60);
        }
      }

      if (ev.type === ROUND_FAILED) {
        pendingFailureAt = ts;
        failCount++;
      }
      if (ev.type === ROUND_SUCCEEDED) {
        successCount++;
        if (pendingFailureAt) {
          recoveryGaps.push((ts - pendingFailureAt) / 86_400_000);
          pendingFailureAt = null;
        }
      }
    }

    const peakProductivityHours = this.topHours(hourCounts, 3);
    const commonDistractions = [...domainCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([domain, count]) => ({ domain, count }));

    const avgFocus =
      focusDurations.length > 0
        ? Number(
            (focusDurations.reduce((a, b) => a + b, 0) / focusDurations.length).toFixed(2),
          )
        : 0;

    const recoverySpeedDays =
      recoveryGaps.length > 0
        ? Number(
            (recoveryGaps.reduce((a, b) => a + b, 0) / recoveryGaps.length).toFixed(2),
          )
        : null;

    // Sustainable ceiling: 1-10 scale derived from success rate (target 70%).
    const totalRounds = successCount + failCount;
    const successRate = totalRounds === 0 ? 0.5 : successCount / totalRounds;
    // map success rate (0..1) to 1..10 with anchor at 0.7 -> 7
    const sustainableCeiling = Math.max(1, Math.min(10, Math.round(successRate * 10)));

    return {
      peakProductivityHours,
      commonDistractions,
      avgFocusSessionMinutes: avgFocus,
      recoverySpeedDays,
      sustainableCeiling,
    };
  }

  private topHours(hourCounts: number[], n: number): number[] {
    return hourCounts
      .map((count, hour) => ({ hour, count }))
      .filter((e) => e.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, n)
      .map((e) => e.hour);
  }

  private toMillis(ts: string): number | null {
    const asInt = Number(ts);
    if (Number.isFinite(asInt) && asInt > 0) return asInt;
    const parsed = Date.parse(ts);
    return Number.isFinite(parsed) ? parsed : null;
  }

  // --- insight narration ----------------------------------------------------

  private deterministicInsights(
    stats: Omit<BehaviorAnalysisResult, 'insights' | 'meta'>,
  ): string[] {
    const out: string[] = [];
    if (stats.peakProductivityHours.length > 0) {
      out.push(
        `Peak productivity window observed at hours ${stats.peakProductivityHours
          .map((h) => `${h}:00 UTC`)
          .join(', ')}.`,
      );
    }
    if (stats.commonDistractions.length > 0) {
      const top = stats.commonDistractions[0];
      if (top) out.push(`Primary distraction source: ${top.domain} (${top.count} events).`);
    }
    if (stats.avgFocusSessionMinutes > 0) {
      out.push(`Average focus session duration: ${stats.avgFocusSessionMinutes} minutes.`);
    }
    if (stats.recoverySpeedDays !== null) {
      out.push(`Average recovery interval after failure: ${stats.recoverySpeedDays} days.`);
    }
    if (out.length === 0) {
      out.push('Insufficient telemetry. Continue collection.');
    }
    return out;
  }

  private async generateAiInsights(
    userId: string,
    stats: Omit<BehaviorAnalysisResult, 'insights' | 'meta'>,
  ): Promise<string[]> {
    // Compactify before sending: drops unused fields, formats hour ranges.
    const compact = compactifyContext(stats);
    const factSheet = JSON.stringify(compact);
    const prompt = [
      `op=${userId}`,
      `facts=${factSheet}`,
      `Produce 2-4 procedural observations as a JSON array of strings.`,
      `Each <25 words, declarative, factual, no advice. Output ONLY the JSON array.`,
    ].join('\n');

    const result = await this.text.generate(prompt, {
      maxTokens: 260,
      temperature: 0.4,
      timeoutMs: 8000,
    });
    this.logger.log(
      `behavioral_analysis provider=${result.providerUsed} tokens_in=${result.tokensUsed.input} tokens_out=${result.tokensUsed.output}`,
    );
    return this.parseInsightArray(result.text);
  }

  private parseInsightArray(text: string): string[] {
    const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((x): x is string => typeof x === 'string')
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && s.length <= 200)
          .slice(0, 4);
      }
    } catch {
      // fall through
    }
    // last-ditch: split by newlines
    return trimmed
      .split('\n')
      .map((line) => line.replace(/^[-*0-9.\s]+/, '').trim())
      .filter((line) => line.length > 0 && line.length <= 200)
      .slice(0, 4);
  }

  // SYSTEM_PROMPT export referenced so prompt tone stays aligned even if we
  // later switch to direct provider calls here.
  // (compile-time only; remove if unused refactor.)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private readonly _systemPromptRef = SYSTEM_PROMPT;
}
