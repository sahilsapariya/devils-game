import { Injectable } from '@nestjs/common';
import type { AnnouncementContext, AnnouncementType } from '../text-generation/prompt-templates';

/**
 * Static fallback templates used when AI generation fails or quality gates reject.
 * Templates are mapped 1:1 to spec section 7 announcement categories.
 */
@Injectable()
export class FallbackTemplatesService {
  private readonly templates: Record<AnnouncementType, string[]> = {
    status_report: [
      '{timeRemaining} remaining. {violations} violations recorded. Focus duration {focusMinutes} minutes in current session.',
      'Operational check. {timeRemaining} until extraction. Violation count: {violations}.',
      'Status update. Focus integrity maintained for {focusMinutes} minutes. {violations} infractions logged.',
    ],
    pressure_escalation: [
      'Operational status critical. {violations} violations on record. Consequence cascade is imminent.',
      'Threshold breach detected. {timeRemaining} remain before consequence assessment.',
      'Critical operational state. Continued deviation will trigger consequence layer.',
    ],
    behavioral_analysis: [
      'Pattern detected: {recentPattern}. Recommendation noted in operational log.',
      'Behavioral signature analyzed. {recentPattern}.',
      'Operator profile updated. Observation: {recentPattern}.',
    ],
    recovery_offer: [
      'Recovery channel open. {recoveryOpportunity} available to restore standing.',
      'Recovery path identified. {recoveryOpportunity}. Standing by.',
      'Round terminated. Recovery opportunity: {recoveryOpportunity}.',
    ],
    ambient_presence: [
      'System ready. Operational status: nominal. Stand by for mission assignment.',
      'Monitoring active. No deviations detected.',
      'System online. Awaiting operator action.',
    ],
    operational_update: [
      'System operational update. State transition to {state}.',
      'Operational layer reconfigured. New state: {state}.',
      'State boundary crossed. Operational mode is now {state}.',
    ],
  };

  build(type: AnnouncementType, ctx: AnnouncementContext): string {
    const list = this.templates[type] ?? this.templates.ambient_presence;
    const idx = Math.floor(Math.random() * list.length);
    const template = list[idx] ?? list[0];
    return this.interpolate(template, ctx);
  }

  private interpolate(template: string, ctx: AnnouncementContext): string {
    const substitutions: Record<string, string> = {
      timeRemaining: this.fmtTime(ctx.timeRemainingSec),
      violations: String(ctx.violations ?? 0),
      focusMinutes: String(ctx.focusMinutes ?? 0),
      state: String(ctx.state ?? 'OPERATIONAL'),
      recentPattern: String(ctx.recentPattern ?? 'no pattern noted'),
      recommendation: String(ctx.recommendation ?? 'continue current operational pace'),
      recoveryOpportunity: String(ctx.recoveryOpportunity ?? 'next round'),
    };
    return template.replace(/\{(\w+)\}/g, (_, k) => substitutions[k] ?? '');
  }

  private fmtTime(sec?: number): string {
    if (sec === undefined || sec === null) return 'unknown duration';
    if (sec < 60) return `${Math.max(0, Math.floor(sec))} seconds`;
    const m = Math.floor(sec / 60);
    return `${m} minute${m === 1 ? '' : 's'}`;
  }
}
