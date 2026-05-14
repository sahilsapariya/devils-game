import { Module } from '@nestjs/common';
import { TtsService } from './tts.service';
import { VoiceStorageService } from './voice-storage.service';
import { ElevenLabsClient } from './elevenlabs.client';

@Module({
  providers: [TtsService, VoiceStorageService, ElevenLabsClient],
  exports: [TtsService],
})
export class TtsModule {}
