import { Logger } from '@nestjs/common';
import OpenAI from 'openai';
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';

export interface OpenAIClientOptions {
  apiKey: string;
  model?: string;
}

export interface OpenAICallParams {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  /** When provided, sets response_format to json_schema with this schema. */
  jsonSchema?: {
    name: string;
    schema: Record<string, unknown>;
    strict?: boolean;
  };
  timeoutMs?: number;
}

export interface OpenAICallResult {
  text: string;
  latencyMs: number;
  tokensUsed: { input: number; output: number };
}

/**
 * Thin wrapper around the OpenAI SDK's chat.completions API.
 * - 8 second timeout, 2 retries with exponential backoff
 * - Supports JSON-schema constrained output for token-efficient structured
 *   responses (response_format: json_schema)
 */
export class OpenAIClient {
  private readonly logger = new Logger(OpenAIClient.name);
  private readonly client: OpenAI;
  private readonly defaultModel: string;

  constructor(options: OpenAIClientOptions) {
    this.client = new OpenAI({ apiKey: options.apiKey });
    this.defaultModel = options.model ?? 'gpt-5.4-nano';
  }

  async generate(params: OpenAICallParams): Promise<OpenAICallResult> {
    const timeoutMs = params.timeoutMs ?? 8000;
    const start = Date.now();

    const response = await this.withRetry<ChatCompletion>(async () => {
      const body: ChatCompletionCreateParamsNonStreaming = {
        model: this.defaultModel,
        max_tokens: params.maxTokens ?? 200,
        temperature: params.temperature ?? 0.65,
        messages: [
          { role: 'system', content: params.systemPrompt },
          { role: 'user', content: params.userPrompt },
        ],
      };

      if (params.jsonSchema) {
        body.response_format = {
          type: 'json_schema',
          json_schema: {
            name: params.jsonSchema.name,
            schema: params.jsonSchema.schema,
            strict: params.jsonSchema.strict ?? true,
          },
        };
      }

      return (await this.client.chat.completions.create(body, {
        timeout: timeoutMs,
      })) as ChatCompletion;
    });

    const choice = response.choices?.[0];
    const raw = choice?.message?.content?.trim() ?? '';
    if (!raw) throw new Error('OpenAI returned empty response');

    let text = raw;
    if (params.jsonSchema) {
      // structured JSON; pull out "message" field if present, else stringify
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (typeof parsed.message === 'string') {
          text = parsed.message.trim();
        } else {
          // If a different shape was requested, return whole JSON as-is
          text = raw;
        }
      } catch (err) {
        this.logger.warn(`OpenAI structured-output parse failed: ${(err as Error).message}`);
        text = raw;
      }
    }

    const tokensUsed = {
      input: response.usage?.prompt_tokens ?? 0,
      output: response.usage?.completion_tokens ?? 0,
    };

    return {
      text,
      latencyMs: Date.now() - start,
      tokensUsed,
    };
  }

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
    throw lastErr instanceof Error ? lastErr : new Error('Unknown OpenAI retry failure');
  }
}
