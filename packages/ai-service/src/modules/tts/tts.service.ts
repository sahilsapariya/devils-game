import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ElevenLabsClient } from './elevenlabs.client';
import { VoiceStorageService } from './voice-storage.service';

export type TtsProvider = 'elevenlabs' | 'ollama-tts';

export interface SynthesizeOptions {
  voiceId?: string;
  /** Rough words-per-second used to estimate duration (default 2.5 wps). */
  wordsPerSecond?: number;
}

export interface TtsResult {
  voiceUrl: string;
  durationSec: number;
  providerUsed: TtsProvider;
  cacheHit: boolean;
}

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly storage: VoiceStorageService,
    private readonly elevenlabs: ElevenLabsClient,
  ) {}

  /** Returns synthesized audio result, or null if every provider failed. */
  async synthesize(text: string, options: SynthesizeOptions = {}): Promise<TtsResult | null> {
    const voiceId = options.voiceId ?? this.config.get<string>('ELEVENLABS_VOICE_ID');
    const hash = this.storage.hashKey(text, voiceId);
    const cached = await this.storage.lookup(hash);
    const duration = this.estimateDurationSec(text, options.wordsPerSecond);

    if (cached) {
      return {
        voiceUrl: cached,
        durationSec: duration,
        providerUsed: 'elevenlabs',
        cacheHit: true,
      };
    }

    // Try ElevenLabs first
    if (this.elevenlabs.isConfigured()) {
      try {
        const bytes = await this.withRetry(() =>
          this.elevenlabs.synthesize({ text, voiceId }),
        );
        const url = await this.storage.store(hash, bytes);
        return { voiceUrl: url, durationSec: duration, providerUsed: 'elevenlabs', cacheHit: false };
      } catch (err) {
        this.logger.warn(`ElevenLabs synthesis failed: ${(err as Error).message}`);
      }
    }

    // Fallback: Ollama TTS (if configured)
    const ollamaModel = this.config.get<string>('OLLAMA_TTS_MODEL');
    const ollamaBase = this.config.get<string>('OLLAMA_BASE_URL');
    if (ollamaModel && ollamaBase) {
      try {
        const bytes = await this.synthesizeOllama(text, ollamaBase, ollamaModel);
        const url = await this.storage.store(hash, bytes);
        return { voiceUrl: url, durationSec: duration, providerUsed: 'ollama-tts', cacheHit: false };
      } catch (err) {
        this.logger.warn(`Ollama TTS synthesis failed: ${(err as Error).message}`);
      }
    }

    return null;
  }

  private async synthesizeOllama(
    text: string,
    baseUrl: string,
    model: string,
  ): Promise<Buffer> {
    // Most Ollama-compatible TTS plugins expose POST /api/tts returning audio bytes.
    // Endpoint shape varies — this is a conservative attempt that callers can override
    // by self-hosting a different endpoint at OLLAMA_BASE_URL.
    const res = await axios.post(
      `${baseUrl.replace(/\/$/, '')}/api/tts`,
      { model, prompt: text },
      { responseType: 'arraybuffer', timeout: 15_000 },
    );
    if (res.status !== 200) throw new Error(`Ollama TTS status ${res.status}`);
    return Buffer.from(res.data as ArrayBuffer);
  }

  private estimateDurationSec(text: string, wps?: number): number {
    const words = text.split(/\s+/).filter(Boolean).length;
    const rate = wps && wps > 0 ? wps : 2.5;
    return Math.max(1, Math.round(words / rate));
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Unknown retry failure');
  }
}
