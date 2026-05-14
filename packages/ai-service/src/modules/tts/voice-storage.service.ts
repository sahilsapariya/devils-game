import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class VoiceStorageService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(VoiceStorageService.name);
  private cacheDir!: string;
  private ttlMs!: number;
  private cleanupHandle: NodeJS.Timeout | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.cacheDir = path.resolve(
      this.config.get<string>('VOICE_CACHE_DIR') ?? './voice-cache',
    );
    const ttlHours = Number(this.config.get<string>('VOICE_CACHE_TTL_HOURS') ?? '24');
    this.ttlMs = ttlHours * HOUR_MS;
    await fs.mkdir(this.cacheDir, { recursive: true });
    // periodic cleanup every 30 min
    this.cleanupHandle = setInterval(() => {
      this.cleanup().catch((err) =>
        this.logger.warn(`Voice cache cleanup failed: ${(err as Error).message}`),
      );
    }, 30 * 60 * 1000);
    this.cleanupHandle.unref?.();
    this.logger.log(`Voice cache directory: ${this.cacheDir} (TTL ${ttlHours}h)`);
  }

  onApplicationShutdown(): void {
    if (this.cleanupHandle) clearInterval(this.cleanupHandle);
  }

  hashKey(text: string, voiceId?: string): string {
    return createHash('sha256')
      .update(`${voiceId ?? 'default'}::${text}`)
      .digest('hex')
      .slice(0, 32);
  }

  filePath(hash: string): string {
    return path.join(this.cacheDir, `${hash}.mp3`);
  }

  /** Returns a public-ish URL/path the caller can stream. */
  publicUrl(hash: string): string {
    const base = this.config.get<string>('VOICE_PUBLIC_BASE_URL');
    if (base) return `${base.replace(/\/$/, '')}/${hash}.mp3`;
    return `file://${this.filePath(hash)}`;
  }

  async lookup(hash: string): Promise<string | null> {
    try {
      await fs.access(this.filePath(hash));
      return this.publicUrl(hash);
    } catch {
      return null;
    }
  }

  async store(hash: string, bytes: Buffer): Promise<string> {
    await fs.writeFile(this.filePath(hash), bytes);
    return this.publicUrl(hash);
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();
    const entries = await fs.readdir(this.cacheDir).catch(() => [] as string[]);
    let removed = 0;
    for (const file of entries) {
      if (!file.endsWith('.mp3')) continue;
      const full = path.join(this.cacheDir, file);
      try {
        const stat = await fs.stat(full);
        if (now - stat.mtimeMs > this.ttlMs) {
          await fs.unlink(full);
          removed++;
        }
      } catch {
        // ignore
      }
    }
    if (removed > 0) this.logger.log(`Voice cache cleanup removed ${removed} expired files`);
  }
}
