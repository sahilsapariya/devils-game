import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

/** Voice config tuned for calm, detached, procedural operator. */
export const VOICE_SETTINGS = {
  stability: 0.6,
  similarity_boost: 0.75,
  style: 0.0,
  use_speaker_boost: true,
} as const;

export interface SynthesisInput {
  text: string;
  voiceId?: string;
  modelId?: string;
}

@Injectable()
export class ElevenLabsClient {
  private readonly logger = new Logger(ElevenLabsClient.name);
  private http: AxiosInstance | null = null;

  constructor(private readonly config: ConfigService) {}

  private getClient(): AxiosInstance | null {
    if (this.http) return this.http;
    const key = this.config.get<string>('ELEVENLABS_API_KEY');
    if (!key) return null;
    this.http = axios.create({
      baseURL: 'https://api.elevenlabs.io',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      timeout: 15_000,
    });
    return this.http;
  }

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('ELEVENLABS_API_KEY') &&
        this.config.get<string>('ELEVENLABS_VOICE_ID'),
    );
  }

  /** Synthesize MP3 bytes from text. Returns Buffer or throws. */
  async synthesize(input: SynthesisInput): Promise<Buffer> {
    const client = this.getClient();
    if (!client) throw new Error('ElevenLabs unconfigured');
    const voiceId = input.voiceId ?? this.config.get<string>('ELEVENLABS_VOICE_ID');
    const model = input.modelId ?? this.config.get<string>('ELEVENLABS_MODEL') ?? 'eleven_turbo_v2_5';
    if (!voiceId) throw new Error('ELEVENLABS_VOICE_ID is required');

    const res = await client.post(
      `/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        text: input.text,
        model_id: model,
        voice_settings: VOICE_SETTINGS,
      },
      { responseType: 'arraybuffer' },
    );

    if (res.status !== 200) {
      throw new Error(`ElevenLabs returned status ${res.status}`);
    }
    return Buffer.from(res.data as ArrayBuffer);
  }
}
