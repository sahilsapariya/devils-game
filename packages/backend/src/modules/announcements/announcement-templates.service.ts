import { Injectable } from '@nestjs/common';
import type {
  AnnouncementCategory,
  AnnouncementTone,
} from '@extraction/shared';

export interface TemplateContext {
  timeRemainingSec?: number;
  violations?: number;
  streak?: number;
  reputation?: number;
  recentPattern?: string;
  userName?: string;
}

interface TemplateDefinition {
  category: AnnouncementCategory;
  tone: AnnouncementTone;
  body: string;
}

/**
 * Hardcoded fallback templates used when the AI service is unavailable.
 *
 * Each `body` may reference `{{placeholders}}` from TemplateContext. Tokens
 * with no value are substituted with sensible defaults.
 */
const TEMPLATES: Record<string, TemplateDefinition> = {
  status_report: {
    category: 'status_report',
    tone: 'procedural',
    body:
      'Status check: {{timeRemainingMin}} minutes remain. Current violations: {{violations}}. Maintain focus.',
  },
  behavioral_analysis: {
    category: 'behavioral_analysis',
    tone: 'calm',
    body:
      'Behavioral pattern logged. Streak: {{streak}}. Continue current discipline.',
  },
  pressure_escalation: {
    category: 'pressure_escalation',
    tone: 'urgent',
    body:
      'Critical state engaged. {{violations}} violations recorded with {{timeRemainingMin}} minutes left. Recover focus now.',
  },
  recovery_offer: {
    category: 'recovery_offer',
    tone: 'supportive',
    body:
      'Recovery window available. Reset and resume when ready. Reputation: {{reputation}}.',
  },
  ambient_presence: {
    category: 'ambient_presence',
    tone: 'calm',
    body: 'Monitoring active. No action required.',
  },
  state_transition: {
    category: 'operational_update',
    tone: 'procedural',
    body: 'State change registered. Adjust pacing accordingly.',
  },
};

const substitute = (body: string, ctx: TemplateContext): string => {
  const replacements: Record<string, string> = {
    timeRemainingMin: ctx.timeRemainingSec
      ? Math.max(0, Math.round(ctx.timeRemainingSec / 60)).toString()
      : '0',
    violations: (ctx.violations ?? 0).toString(),
    streak: (ctx.streak ?? 0).toString(),
    reputation: (ctx.reputation ?? 0).toString(),
    recentPattern: ctx.recentPattern ?? 'stable',
    userName: ctx.userName ?? 'Operator',
  };
  return body.replace(/{{\s*(\w+)\s*}}/g, (_, key) => replacements[key] ?? '');
};

export interface RenderedTemplate {
  category: AnnouncementCategory;
  tone: AnnouncementTone;
  content: string;
}

@Injectable()
export class AnnouncementTemplatesService {
  render(type: string, context: TemplateContext): RenderedTemplate {
    const template = TEMPLATES[type] ?? TEMPLATES.ambient_presence;
    if (!template) {
      // Defensive — TEMPLATES.ambient_presence is always defined.
      return {
        category: 'ambient_presence',
        tone: 'calm',
        content: 'Monitoring active.',
      };
    }
    return {
      category: template.category,
      tone: template.tone,
      content: substitute(template.body, context),
    };
  }
}
