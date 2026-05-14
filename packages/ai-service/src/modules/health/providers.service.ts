import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface ProviderStatus {
  claude: boolean;
  ollama: boolean;
  elevenlabs: boolean;
}

interface CachedStatus {
  value: ProviderStatus;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;

@Injectable()
export class ProvidersService {
  private readonly logger = new Logger(ProvidersService.name);
  private cache: CachedStatus | null = null;

  constructor(private readonly config: ConfigService) {}

  async status(): Promise<ProviderStatus> {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.value;
    }
    const [claude, ollama, elevenlabs] = await Promise.all([
      this.pingClaude(),
      this.pingOllama(),
      this.pingElevenLabs(),
    ]);
    const value: ProviderStatus = { claude, ollama, elevenlabs };
    this.cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  }

  private async pingClaude(): Promise<boolean> {
    const key = this.config.get<string>('ANTHROPIC_API_KEY');
    // Presence-only check — actual /messages call would burn quota.
    return Boolean(key && key.length > 10);
  }

  private async pingOllama(): Promise<boolean> {
    const baseUrl = this.config.get<string>('OLLAMA_BASE_URL');
    if (!baseUrl) return false;
    try {
      const res = await axios.get(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
        timeout: 1500,
      });
      return res.status === 200;
    } catch (err) {
      this.logger.debug(`Ollama ping failed: ${(err as Error).message}`);
      return false;
    }
  }

  private async pingElevenLabs(): Promise<boolean> {
    const key = this.config.get<string>('ELEVENLABS_API_KEY');
    if (!key) return false;
    try {
      const res = await axios.get('https://api.elevenlabs.io/v1/voices', {
        timeout: 2000,
        headers: { 'xi-api-key': key },
      });
      return res.status === 200;
    } catch (err) {
      this.logger.debug(`ElevenLabs ping failed: ${(err as Error).message}`);
      return false;
    }
  }
}
