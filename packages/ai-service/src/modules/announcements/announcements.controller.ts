import { Body, Controller, Get, Logger, Post, UseGuards } from '@nestjs/common';
import { InternalTokenGuard } from '../common/internal-token.guard';
import { TextGenerationService } from '../text-generation/text-generation.service';
import { TtsService } from '../tts/tts.service';
import {
  ANNOUNCEMENT_JSON_SCHEMA,
  AnnouncementContext,
  AnnouncementType,
  buildUserPrompt,
} from '../text-generation/prompt-templates';
import { QualityGatesService } from './quality-gates.service';
import { FallbackTemplatesService } from './fallback-templates.service';
import { GenerateAnnouncementDto } from './dto/generate-announcement.dto';
import { compactifyContext } from '../behavioral-analysis/compact-summary';
import { pickPrefix, stripLeadingPrefix } from './static-prefixes';
import { AnnouncementCacheService, CacheStats } from './announcement-cache.service';

export interface AnnouncementResponse {
  message: string;
  voiceUrl: string | null;
  durationSec: number;
  fallbackUsed: boolean;
  providerUsed: string | null;
  qualityReason?: string;
  [key: string]: unknown;
}

@UseGuards(InternalTokenGuard)
@Controller('internal')
export class AnnouncementsController {
  private readonly logger = new Logger(AnnouncementsController.name);

  constructor(
    private readonly text: TextGenerationService,
    private readonly tts: TtsService,
    private readonly gates: QualityGatesService,
    private readonly fallback: FallbackTemplatesService,
    private readonly cache: AnnouncementCacheService,
  ) {}

  @Get('cache/stats')
  cacheStats(): CacheStats {
    return this.cache.stats();
  }

  @Post('generate-announcement')
  async generate(@Body() body: GenerateAnnouncementDto): Promise<AnnouncementResponse> {
    const type = body.type as AnnouncementType;
    const context: AnnouncementContext = {
      ...body.context,
      toneGuidance: body.toneGuidance,
    };

    // Compact context for cache keying AND for the AI prompt
    const compact = compactifyContext(context);
    const cacheKey = this.cache.buildKey(type, { ...compact, tone: body.toneGuidance ?? null });
    const cached = this.cache.get<AnnouncementResponse>(cacheKey);
    if (cached) return cached;

    // Static prefix reuse: AI generates only the tail
    const prefix = pickPrefix(type, cacheKey);

    let message: string;
    let fallbackUsed = false;
    let providerUsed: string | null = null;
    let qualityReason: string | undefined;

    try {
      const compactCtx: AnnouncementContext = { ...compact, toneGuidance: body.toneGuidance };
      const basePrompt = buildUserPrompt(type, compactCtx);
      const prompt = prefix
        ? `${basePrompt}\nThe response will be prefixed server-side with "${prefix}". Generate ONLY the content that follows the prefix.`
        : basePrompt;

      const gen = await this.text.generate(prompt, {
        temperature: 0.65,
        maxTokens: 160,
        timeoutMs: 8000,
        jsonSchema: ANNOUNCEMENT_JSON_SCHEMA,
      });

      const tail = stripLeadingPrefix(this.cleanOutput(gen.text), prefix);
      const composed = prefix ? `${prefix} ${tail}`.trim() : tail;

      const gate = this.gates.check(composed);
      if (!gate.passed) {
        qualityReason = gate.reason;
        this.logger.warn(`Quality gate failed (${gate.reason}). Using template fallback.`);
        message = this.fallback.build(type, context);
        fallbackUsed = true;
      } else {
        message = composed;
        providerUsed = gen.providerUsed;
        this.logger.log(
          `announcement type=${type} provider=${gen.providerUsed} tokens_in=${gen.tokensUsed.input} tokens_out=${gen.tokensUsed.output}`,
        );
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
    this.cache.set(cacheKey, response, type);
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
}
