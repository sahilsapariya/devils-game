import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { SYSTEM_PROMPT } from './prompt-templates';

export type Provider = 'claude' | 'ollama';

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  /** preferred provider; falls back to the other on failure */
  prefer?: Provider;
  timeoutMs?: number;
}

export interface GenerateResult {
  text: string;
  providerUsed: Provider;
  latencyMs: number;
}

@Injectable()
export class TextGenerationService {
  private readonly logger = new Logger(TextGenerationService.name);
  private anthropic: Anthropic | null = null;

  constructor(private readonly config: ConfigService) {}

  private getAnthropic(): Anthropic | null {
    if (this.anthropic) return this.anthropic;
    const key = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!key) return null;
    this.anthropic = new Anthropic({ apiKey: key });
    return this.anthropic;
  }

  async generate(userPrompt: string, options: GenerateOptions = {}): Promise<GenerateResult> {
    const defaultPref = (this.config.get<string>('USE_PROVIDER') as Provider) ?? 'claude';
    const primary: Provider = options.prefer ?? defaultPref;
    const secondary: Provider = primary === 'claude' ? 'ollama' : 'claude';
    const timeoutMs = options.timeoutMs ?? 8000;

    try {
      return await this.callProvider(primary, userPrompt, options, timeoutMs);
    } catch (err) {
      this.logger.warn(
        `Primary provider '${primary}' failed: ${(err as Error).message}. Falling back to '${secondary}'.`,
      );
      return this.callProvider(secondary, userPrompt, options, timeoutMs);
    }
  }

  private async callProvider(
    provider: Provider,
    userPrompt: string,
    options: GenerateOptions,
    timeoutMs: number,
  ): Promise<GenerateResult> {
    const start = Date.now();
    if (provider === 'claude') {
      const text = await this.callClaude(userPrompt, options, timeoutMs);
      return { text, providerUsed: 'claude', latencyMs: Date.now() - start };
    }
    const text = await this.callOllama(userPrompt, options, timeoutMs);
    return { text, providerUsed: 'ollama', latencyMs: Date.now() - start };
  }

  private async callClaude(
    userPrompt: string,
    options: GenerateOptions,
    timeoutMs: number,
  ): Promise<string> {
    const client = this.getAnthropic();
    if (!client) throw new Error('Claude provider unconfigured (ANTHROPIC_API_KEY missing)');
    const model =
      this.config.get<string>('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5-20251001';

    const response = await this.withRetry(async () => {
      return client.messages.create(
        {
          model,
          max_tokens: options.maxTokens ?? 200,
          temperature: options.temperature ?? 0.7,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        },
        { timeout: timeoutMs },
      );
    });

    const parts: string[] = [];
    for (const block of response.content) {
      if (block.type === 'text' && typeof (block as { text?: unknown }).text === 'string') {
        parts.push((block as { text: string }).text);
      }
    }
    const text = parts.join('').trim();
    if (!text) throw new Error('Claude returned empty response');
    return text;
  }

  private async callOllama(
    userPrompt: string,
    options: GenerateOptions,
    timeoutMs: number,
  ): Promise<string> {
    const baseUrl = this.config.get<string>('OLLAMA_BASE_URL') ?? 'http://localhost:11434';
    const model = this.config.get<string>('OLLAMA_TEXT_MODEL') ?? 'llama3.1:8b';
    const res = await this.withRetry(async () =>
      axios.post(
        `${baseUrl.replace(/\/$/, '')}/api/generate`,
        {
          model,
          system: SYSTEM_PROMPT,
          prompt: userPrompt,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.maxTokens ?? 200,
          },
        },
        { timeout: timeoutMs },
      ),
    );
    const text = String(res.data?.response ?? '').trim();
    if (!text) throw new Error('Ollama returned empty response');
    return text;
  }

  /** simple 2-retry exponential backoff */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (attempt < 2) {
          const backoff = 200 * 2 ** attempt;
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Unknown retry failure');
  }
}
