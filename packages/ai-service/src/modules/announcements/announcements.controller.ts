import { Body, Controller, Logger, Post, UseGuards } from '@nestjs/common';
import { LRUCache } from 'lru-cache';
import { InternalTokenGuard } from '../common/internal-token.guard';
import { TextGenerationService } from '../text-generation/text-generation.service';
import { TtsService } from '../tts/tts.service';
import {
  AnnouncementContext,
  AnnouncementType,
  buildUserPrompt,
} from '../text-generation/prompt-templates';
import { QualityGatesService } from './quality-gates.service';
import { FallbackTemplatesService } from './fallback-templates.service';
import { GenerateAnnouncementDto } from './dto/generate-announcement.dto';

export interface AnnouncementResponse {
  message: string;
  voiceUrl: string | null;
  durationSec: number;
  fallbackUsed: boolean;
  providerUsed: string | null;
  qualityReason?: string;
}

@UseGuards(InternalTokenGuard)
@Controller('internal')
export class AnnouncementsController {
  private readonly logger = new Logger(AnnouncementsController.name);
  // LRU: 100 entries, 1h TTL — keyed on (type + canonical context)
  private readonly cache = new LRUCache<string, AnnouncementResponse>({
    max: 100,
    ttl: 60 * 60 * 1000,
  });

  constructor(
    private readonly text: TextGenerationService,
    private readonly tts: TtsService,
    private readonly gates: QualityGatesService,
    private readonly fallback: FallbackTemplatesService,
  ) {}

  @Post('generate-announcement')
  async generate(@Body() body: GenerateAnnouncementDto): Promise<AnnouncementResponse> {
    const cacheKey = this.cacheKey(body);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const type = body.type as AnnouncementType;
    const context: AnnouncementContext = {
      ...body.context,
      toneGuidance: body.toneGuidance,
    };

    let message: string;
    let fallbackUsed = false;
    let providerUsed: string | null = null;
    let qualityReason: string | undefined;

    try {
      const prompt = buildUserPrompt(type, context);
      const gen = await this.text.generate(prompt, {
        temperature: 0.65,
        maxTokens: 220,
        timeoutMs: 8000,
      });
      const cleaned = this.cleanOutput(gen.text);
      const gate = this.gates.check(cleaned);
      if (!gate.passed) {
        qualityReason = gate.reason;
        this.logger.warn(`Quality gate failed (${gate.reason}). Using template fallback.`);
        message = this.fallback.build(type, context);
        fallbackUsed = true;
      } else {
        message = cleaned;
        providerUsed = gen.providerUsed;
      }
    } catch (err) {
      this.logger.warn(`AI generation failed: ${(err as Error).message}. Using template.`);
      message = this.fallback.build(type, context);
      fallbackUsed = true;
    }

    let voiceUrl: string | null = null;
    let durationSec = 0;
    if (!body.skipVoice) {
      const synth = await this.tts.synthesize(message);
      if (synth) {
        voiceUrl = synth.voiceUrl;
        durationSec = synth.durationSec;
      }
    }
    if (durationSec === 0) {
      // text-only fallback: approximate duration so client can pace UI
      durationSec = Math.max(1, Math.round(message.split(/\s+/).length / 2.5));
    }

    const response: AnnouncementResponse = {
      message,
      voiceUrl,
      durationSec,
      fallbackUsed,
      providerUsed,
      qualityReason,
    };
    this.cache.set(cacheKey, response);
    return response;
  }

  private cleanOutput(text: string): string {
    // Strip wrapping quotes the model may include despite instructions
    let t = text.trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      t = t.slice(1, -1).trim();
    }
    return t;
  }

  private cacheKey(body: GenerateAnnouncementDto): string {
    return JSON.stringify({ t: body.type, c: body.context, g: body.toneGuidance ?? null });
  }
}
