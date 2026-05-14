import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GenerateAnnouncementInput {
  type: string;
  context: Record<string, unknown>;
  toneGuidance?: string;
}

export interface GenerateAnnouncementResult {
  message: string;
  voiceUrl?: string;
  durationSec: number;
  fallbackUsed: boolean;
}

export interface AnalyzeBehaviorInput {
  userId: string;
  events: ReadonlyArray<Record<string, unknown>>;
  windowDays: number;
}

export interface AnalyzeBehaviorResult {
  peakProductivityHours: number[];
  commonDistractions: string[];
  avgFocusSessionMinutes: number;
  recoverySpeedDays: number;
  sustainableCeiling: number;
  insights: ReadonlyArray<string>;
}

export interface AiHealthResult {
  ok: boolean;
  providers: {
    elevenlabs: boolean;
    ollama: boolean;
  };
}

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class AiClientService {
  private readonly logger = new Logger(AiClientService.name);
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl =
      this.config.get<string>('AI_SERVICE_URL') ?? 'http://localhost:4001';
  }

  async generateAnnouncement(
    input: GenerateAnnouncementInput,
  ): Promise<GenerateAnnouncementResult | null> {
    return this.requestWithRetry<GenerateAnnouncementResult>(
      'POST',
      '/internal/generate-announcement',
      input,
    );
  }

  async analyzeBehavior(
    input: AnalyzeBehaviorInput,
  ): Promise<AnalyzeBehaviorResult | null> {
    return this.requestWithRetry<AnalyzeBehaviorResult>(
      'POST',
      '/internal/analyze-behavior',
      input,
    );
  }

  async pingHealth(): Promise<AiHealthResult | null> {
    return this.requestWithRetry<AiHealthResult>('GET', '/health', undefined);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async requestWithRetry<T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
  ): Promise<T | null> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      try {
        const result = await this.requestOnce<T>(method, path, body);
        return result;
      } catch (error) {
        lastError = error;
        const delay = RETRY_DELAYS_MS[attempt];
        if (attempt < MAX_RETRIES - 1 && delay !== undefined) {
          await sleep(delay);
        }
      }
    }
    this.logger.warn(
      `AI service ${method} ${path} failed after ${MAX_RETRIES} retries: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    );
    return null;
  }

  private async requestOnce<T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`AI service ${method} ${path} returned ${response.status}`);
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
