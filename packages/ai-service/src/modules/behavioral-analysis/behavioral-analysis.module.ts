import { Module } from '@nestjs/common';
import { BehavioralAnalysisController } from './behavioral-analysis.controller';
import { AnalyzerService } from './analyzer.service';
import { TextGenerationModule } from '../text-generation/text-generation.module';

@Module({
  imports: [TextGenerationModule],
  controllers: [BehavioralAnalysisController],
  providers: [AnalyzerService],
})
export class BehavioralAnalysisModule {}
