import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { SYSTEM_PROMPT } from './prompt-templates';
import { OpenAIClient } from './openai.client';

export type Provider = 'openai' | 'claude' | 'ollama';

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  /** preferred provider; falls back through the chain on failure */
  prefer?: Provider;
  timeoutMs?: number;
  /** If set, providers that support structured output will constrain to this schema. */
  jsonSchema?: {
    name: string;
    schema: Record<string, unknown>;
    strict?: boolean;
  };
}

export interface GenerateResult {
  text: string;
  providerUsed: Provider;
  latencyMs: number;
  tokensUsed: { input: number; output: number };
}

const PROVIDER_CHAIN: Provider[] = ['openai', 'claude', 'ollama'];

@Injectable()
export class TextGenerationService {
  private readonly logger = new Logger(TextGenerationService.name);
  private anthropic: Anthropic | null = null;
  private openaiClient: OpenAIClient | null = null;

  constructor(private readonly config: ConfigService) {}

  private getAnthropic(): Anthropic | null {
    if (this.anthropic) return this.anthropic;
    const key = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!key) return null;
    this.anthropic = new Anthropic({ apiKey: key });
    return this.anthropic;
  }

  private getOpenAI(): OpenAIClient | null {
    if (this.openaiClient) return this.openaiClient;
    const key = this.config.get<string>('OPENAI_API_KEY');
    if (!key) return null;
    const model = this.config.get<string>('OPENAI_MODEL') ?? 'gpt-5.4-nano';
    this.openaiClient = new OpenAIClient({ apiKey: key, model });
    return this.openaiClient;
  }

  /**
   * Build a fallback chain: configured primary -> openai -> claude -> ollama
   * (deduplicated, primary first).
   */
  private buildChain(primary: Provider): Provider[] {
    const seen = new Set<Provider>();
    const chain: Provider[] = [];
    for (const p of [primary, ...PROVIDER_CHAIN]) {
      if (!seen.has(p)) {
        seen.add(p);
        chain.push(p);
      }
    }
    return chain;
  }

  async generate(userPrompt: string, options: GenerateOptions = {}): Promise<GenerateResult> {
    // Support both new AI_PROVIDER and legacy USE_PROVIDER for back-compat
    const envProvider =
      (this.config.get<string>('AI_PROVIDER') as Provider | undefined) ??
      (this.config.get<string>('USE_PROVIDER') as Provider | undefined);
    const defaultPref: Provider = envProvider ?? 'openai';
    const primary: Provider = options.prefer ?? defaultPref;
    const timeoutMs = options.timeoutMs ?? 8000;

    const chain = this.buildChain(primary);
    let lastErr: unknown;
    for (const provider of chain) {
      try {
        const result = await this.callProvider(provider, userPrompt, options, timeoutMs);
        this.logger.log(
          `gen ok provider=${provider} input_tokens=${result.tokensUsed.input} output_tokens=${result.tokensUsed.output} latency_ms=${result.latencyMs}`,
        );
        return result;
      } catch (err) {
        lastErr = err;
        this.logger.warn(
          `Provider '${provider}' failed: ${(err as Error).message}. Trying next in chain.`,
        );
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error('All providers failed and no underlying error captured');
  }

  private async callProvider(
    provider: Provider,
    userPrompt: string,
    options: GenerateOptions,
    timeoutMs: number,
  ): Promise<GenerateResult> {
    const start = Date.now();
    if (provider === 'openai') {
      const client = this.getOpenAI();
      if (!client) throw new Error('OpenAI provider unconfigured (OPENAI_API_KEY missing)');
      const r = await client.generate({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        maxTokens: options.maxTokens ?? 200,
        temperature: options.temperature ?? 0.65,
        jsonSchema: options.jsonSchema,
        timeoutMs,
      });
      return {
        text: r.text,
        providerUsed: 'openai',
        latencyMs: r.latencyMs,
        tokensUsed: r.tokensUsed,
      };
    }
    if (provider === 'claude') {
      const { text, tokensUsed } = await this.callClaude(userPrompt, options, timeoutMs);
      return { text, providerUsed: 'claude', latencyMs: Date.now() - start, tokensUsed };
    }
    const text = await this.callOllama(userPrompt, options, timeoutMs);
    return {
      text,
      providerUsed: 'ollama',
      latencyMs: Date.now() - start,
      // ollama doesn't return tokens; approximate from text length
      tokensUsed: { input: Math.ceil(userPrompt.length / 4), output: Math.ceil(text.length / 4) },
    };
  }

  private async callClaude(
    userPrompt: string,
    options: GenerateOptions,
    timeoutMs: number,
  ): Promise<{ text: string; tokensUsed: { input: number; output: number } }> {
    const client = this.getAnthropic();
    if (!client) throw new Error('Claude provider unconfigured (ANTHROPIC_API_KEY missing)');
    const model =
      this.config.get<string>('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5-20251001';

    // If JSON schema was requested, instruct the model to emit JSON matching it.
    // Claude doesn't have native json_schema response_format but JSON-only mode
    // is achieved via explicit instructions.
    let finalUserPrompt = userPrompt;
    if (options.jsonSchema) {
      finalUserPrompt = [
        userPrompt,
        '',
        `Respond with ONLY a single JSON object matching this schema (no markdown, no prose):`,
        JSON.stringify(options.jsonSchema.schema),
      ].join('\n');
    }

    const response = await this.withRetry(async () => {
      return client.messages.create(
        {
          model,
          max_tokens: options.maxTokens ?? 200,
          temperature: options.temperature ?? 0.65,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: finalUserPrompt }],
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
    let text = parts.join('').trim();
    if (!text) throw new Error('Claude returned empty response');

    // If JSON schema was requested, try to extract "message" field
    if (options.jsonSchema) {
      const stripped = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      try {
        const parsed = JSON.parse(stripped) as Record<string, unknown>;
        if (typeof parsed.message === 'string') {
          text = parsed.message.trim();
        }
      } catch {
        // Leave text as-is if parsing fails; quality gates will catch obvious failure
      }
    }

    const tokensUsed = {
      input: response.usage?.input_tokens ?? 0,
      output: response.usage?.output_tokens ?? 0,
    };
    return { text, tokensUsed };
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
            temperature: options.temperature ?? 0.65,
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
