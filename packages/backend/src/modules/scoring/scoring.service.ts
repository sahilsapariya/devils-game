import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ANOMALY_THRESHOLDS,
  PRODUCTIVITY_WEIGHTS,
  type TelemetryEventType,
} from '@extraction/shared';

import { BehavioralRecordEntity } from '../../database/entities/behavioral-record.entity';
import { RoundEntity } from '../../database/entities/round.entity';
import { TelemetryEventEntity } from '../../database/entities/telemetry-event.entity';

export interface ScoreBreakdown {
  ideActivityScore: number;
  gitActivityScore: number;
  focusDurationScore: number;
  distractionAbsenceScore: number;
  manualCheckinScore: number;
  total: number;
}

export interface PlayerPattern {
  windowDays: number;
  averageFocusSessionMinutes: number;
  averageProductivityScore: number;
  peakProductivityHours: ReadonlyArray<number>;
  commonDistractions: ReadonlyArray<string>;
  recoverySpeedDays: number;
  sampleSize: number;
}

const clamp01 = (value: number): number => {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
};

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    @InjectRepository(TelemetryEventEntity)
    private readonly telemetry: Repository<TelemetryEventEntity>,
    @InjectRepository(RoundEntity)
    private readonly rounds: Repository<RoundEntity>,
    @InjectRepository(BehavioralRecordEntity)
    private readonly behavioralRecords: Repository<BehavioralRecordEntity>,
  ) {}

  /**
   * Compute a productivity score for the round using telemetry events.
   * Persists a `behavioral_records` row summarizing the round.
   */
  async scoreRound(
    roundId: string,
  ): Promise<{ score: number; breakdown: ScoreBreakdown; recordId: string }> {
    const round = await this.rounds.findOne({ where: { id: roundId } });
    if (!round) {
      throw new NotFoundException('Round not found');
    }

    const periodStart = round.actualStart ?? round.scheduledStart;
    const periodEnd = round.actualEnd ?? new Date();

    const events = await this.telemetry
      .createQueryBuilder('te')
      .where('te.round_id = :roundId', { roundId })
      .orderBy('te.occurred_at', 'ASC')
      .getMany();

    const aggregates = this.aggregateEvents(events);
    const durationMinutes = Math.max(
      1,
      (periodEnd.getTime() - periodStart.getTime()) / 60_000,
    );

    const breakdown = this.computeBreakdown(aggregates, durationMinutes, round.difficulty?.timePressure ?? 3);
    const anomalies = this.detectAnomaliesInternal(aggregates, durationMinutes);

    const record = this.behavioralRecords.create({
      userId: round.userId,
      roundId,
      periodStart,
      periodEnd,
      totalFocusMinutes: aggregates.focusMinutes,
      totalIdleMinutes: aggregates.idleMinutes,
      appSwitches: aggregates.appSwitches,
      productiveAppsActive: aggregates.productiveAppEvents,
      distractionsDetected: aggregates.distractionEvents,
      gitCommits: aggregates.gitCommits,
      ideActivityMinutes: aggregates.ideMinutes,
      terminalCommands: aggregates.terminalActivity,
      productivityScore: Number(breakdown.total.toFixed(4)),
      anomalyFlags: anomalies,
      eventCount: events.length,
    });
    const savedRecord = await this.behavioralRecords.save(record);

    // Mirror the score on the round itself for fast reads.
    round.stats = {
      ...round.stats,
      totalFocusMinutes: aggregates.focusMinutes,
      totalIdleMinutes: aggregates.idleMinutes,
      appSwitches: aggregates.appSwitches,
      distractionsDetected: aggregates.distractionEvents,
      violationsCount: round.stats?.violationsCount ?? 0,
      gitCommitsCount: aggregates.gitCommits,
      productivityScore: breakdown.total,
    };
    await this.rounds.save(round);

    return { score: breakdown.total, breakdown, recordId: savedRecord.id };
  }

  /**
   * Detect behavioral anomalies for a single round.
   */
  async detectAnomalies(roundId: string): Promise<ReadonlyArray<string>> {
    const round = await this.rounds.findOne({ where: { id: roundId } });
    if (!round) {
      return [];
    }
    const events = await this.telemetry.find({ where: { roundId } });
    const aggregates = this.aggregateEvents(events);
    const periodStart = round.actualStart ?? round.scheduledStart;
    const periodEnd = round.actualEnd ?? new Date();
    const duration = Math.max(
      1,
      (periodEnd.getTime() - periodStart.getTime()) / 60_000,
    );
    return this.detectAnomaliesInternal(aggregates, duration);
  }

  /**
   * Aggregate behavioral records for the user to compute baseline pattern.
   */
  async getPlayerPattern(
    userId: string,
    windowDays = 30,
  ): Promise<PlayerPattern> {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const records = await this.behavioralRecords
      .createQueryBuilder('br')
      .where('br.user_id = :userId', { userId })
      .andWhere('br.period_start >= :since', { since })
      .orderBy('br.period_start', 'ASC')
      .getMany();

    if (records.length === 0) {
      return {
        windowDays,
        averageFocusSessionMinutes: 0,
        averageProductivityScore: 0,
        peakProductivityHours: [],
        commonDistractions: [],
        recoverySpeedDays: 0,
        sampleSize: 0,
      };
    }

    const avgFocus =
      records.reduce((sum, r) => sum + r.totalFocusMinutes, 0) / records.length;
    const avgScore =
      records.reduce((sum, r) => sum + Number(r.productivityScore), 0) /
      records.length;

    // Peak hours: bucket records by hour of period_start, find top 3.
    const hourCounts = new Map<number, number>();
    for (const r of records) {
      const hour = r.periodStart.getHours();
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
    }
    const peakHours = Array.from(hourCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour]) => hour);

    // Common distractions — sourced from telemetry distraction events.
    const distractionRows = await this.telemetry
      .createQueryBuilder('te')
      .where('te.user_id = :userId', { userId })
      .andWhere('te.event_type = :type', { type: 'distraction_detected' as TelemetryEventType })
      .andWhere('te.occurred_at >= :since', { since })
      .getMany();
    const distractionCounts = new Map<string, number>();
    for (const row of distractionRows) {
      const target =
        typeof row.payload?.app === 'string'
          ? row.payload.app
          : typeof row.payload?.domain === 'string'
            ? row.payload.domain
            : 'unknown';
      distractionCounts.set(target, (distractionCounts.get(target) ?? 0) + 1);
    }
    const commonDistractions = Array.from(distractionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key]) => key);

    // Recovery speed heuristic: number of days between a low-score record (<0.4)
    // and the next record with score >= 0.6.
    const sortedScores = records.map((r) => ({
      time: r.periodStart.getTime(),
      score: Number(r.productivityScore),
    }));
    const recoveryDays: number[] = [];
    for (let i = 0; i < sortedScores.length - 1; i += 1) {
      const cur = sortedScores[i];
      if (cur && cur.score < 0.4) {
        for (let j = i + 1; j < sortedScores.length; j += 1) {
          const next = sortedScores[j];
          if (next && next.score >= 0.6) {
            recoveryDays.push(
              (next.time - cur.time) / (24 * 60 * 60 * 1000),
            );
            break;
          }
        }
      }
    }
    const recoverySpeedDays =
      recoveryDays.length === 0
        ? 0
        : recoveryDays.reduce((a, b) => a + b, 0) / recoveryDays.length;

    return {
      windowDays,
      averageFocusSessionMinutes: avgFocus,
      averageProductivityScore: avgScore,
      peakProductivityHours: peakHours,
      commonDistractions,
      recoverySpeedDays,
      sampleSize: records.length,
    };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private aggregateEvents(events: TelemetryEventEntity[]): {
    focusMinutes: number;
    idleMinutes: number;
    appSwitches: number;
    productiveAppEvents: number;
    distractionEvents: number;
    gitCommits: number;
    ideMinutes: number;
    terminalActivity: number;
    zeroDiffCommits: number;
    manualCheckins: number;
  } {
    let focusMinutes = 0;
    let idleMinutes = 0;
    let appSwitches = 0;
    let productiveAppEvents = 0;
    let distractionEvents = 0;
    let gitCommits = 0;
    let ideMinutes = 0;
    let terminalActivity = 0;
    let zeroDiffCommits = 0;
    let manualCheckins = 0;

    for (const event of events) {
      const payload = event.payload ?? {};
      const durationMin =
        typeof payload.durationMinutes === 'number'
          ? payload.durationMinutes
          : 0;

      switch (event.eventType) {
        case 'focus_session_ended':
          focusMinutes += durationMin;
          break;
        case 'idle_detected':
          idleMinutes += durationMin || 5; // idle threshold default
          break;
        case 'app_switched':
          appSwitches += 1;
          if (event.isProductive === true) productiveAppEvents += 1;
          break;
        case 'distraction_detected':
          distractionEvents += 1;
          break;
        case 'git_commit':
          gitCommits += 1;
          if (
            typeof payload.changedFiles === 'number' &&
            payload.changedFiles === 0
          ) {
            zeroDiffCommits += 1;
          }
          break;
        case 'ide_activity':
          ideMinutes += durationMin || 1;
          break;
        case 'terminal_activity':
          terminalActivity += 1;
          break;
        case 'manual_checkin':
          manualCheckins += 1;
          break;
        default:
          break;
      }
    }

    return {
      focusMinutes,
      idleMinutes,
      appSwitches,
      productiveAppEvents,
      distractionEvents,
      gitCommits,
      ideMinutes,
      terminalActivity,
      zeroDiffCommits,
      manualCheckins,
    };
  }

  private computeBreakdown(
    a: ReturnType<typeof this.aggregateEvents>,
    durationMinutes: number,
    timePressure: number,
  ): ScoreBreakdown {
    // Each subscore normalized to 0..1.
    // IDE activity: ratio of IDE-active minutes to round duration; target 0.5.
    const ideActivityScore = clamp01(a.ideMinutes / (durationMinutes * 0.5));

    // Git activity: expects 1+ commit per 60 minutes at baseline; clamp to 1.
    const expectedCommits = Math.max(1, durationMinutes / 60);
    const gitActivityScore = clamp01(a.gitCommits / expectedCommits);

    // Focus duration: total focus minutes vs round duration target 0.7.
    const focusDurationScore = clamp01(a.focusMinutes / (durationMinutes * 0.7));

    // Distraction absence: 1.0 if zero distractions; degrades with each event.
    // Pressure-aware: higher timePressure shrinks the tolerance.
    const tolerance = Math.max(1, 6 - timePressure);
    const distractionAbsenceScore = clamp01(
      1 - a.distractionEvents / tolerance,
    );

    // Manual checkin: any check-in scores 1, none scores 0.
    const manualCheckinScore = a.manualCheckins > 0 ? 1 : 0;

    const total =
      PRODUCTIVITY_WEIGHTS.IDE_ACTIVITY * ideActivityScore +
      PRODUCTIVITY_WEIGHTS.GIT_ACTIVITY * gitActivityScore +
      PRODUCTIVITY_WEIGHTS.FOCUS_DURATION * focusDurationScore +
      PRODUCTIVITY_WEIGHTS.DISTRACTION_ABSENCE * distractionAbsenceScore +
      PRODUCTIVITY_WEIGHTS.MANUAL_CHECKIN * manualCheckinScore;

    return {
      ideActivityScore,
      gitActivityScore,
      focusDurationScore,
      distractionAbsenceScore,
      manualCheckinScore,
      total: clamp01(total),
    };
  }

  private detectAnomaliesInternal(
    a: ReturnType<typeof this.aggregateEvents>,
    durationMinutes: number,
  ): string[] {
    const anomalies: string[] = [];
    if (durationMinutes > 0) {
      const commitsPerMin = a.gitCommits / durationMinutes;
      if (commitsPerMin > ANOMALY_THRESHOLDS.GIT_COMMITS_PER_MINUTE_MAX / 60) {
        anomalies.push('git_commits_spike');
      }
    }
    if (
      a.ideMinutes >= ANOMALY_THRESHOLDS.IDLE_IDE_SESSION_MAX_HOURS * 60 &&
      a.gitCommits === 0
    ) {
      anomalies.push('ide_no_commits');
    }
    if (
      durationMinutes > 0 &&
      a.idleMinutes / durationMinutes >= ANOMALY_THRESHOLDS.IDLE_ROUND_FRACTION_MAX
    ) {
      anomalies.push('round_mostly_idle');
    }
    if (a.zeroDiffCommits > 0 && ANOMALY_THRESHOLDS.ZERO_CHANGE_COMMIT_FLAG) {
      anomalies.push('zero_diff_commits');
    }
    return anomalies;
  }
}
