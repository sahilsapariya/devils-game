import { Module } from '@nestjs/common';
import { TextGenerationService } from './text-generation.service';

@Module({
  providers: [TextGenerationService],
  exports: [TextGenerationService],
})
export class TextGenerationModule {}
