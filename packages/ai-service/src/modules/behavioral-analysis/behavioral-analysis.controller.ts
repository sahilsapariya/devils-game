import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { InternalTokenGuard } from '../common/internal-token.guard';
import { AnalyzerService, BehaviorAnalysisResult } from './analyzer.service';
import { AnalyzeBehaviorDto } from './dto/analyze-behavior.dto';

@UseGuards(InternalTokenGuard)
@Controller('internal')
export class BehavioralAnalysisController {
  constructor(private readonly analyzer: AnalyzerService) {}

  @Post('analyze-behavior')
  async analyze(@Body() body: AnalyzeBehaviorDto): Promise<BehaviorAnalysisResult> {
    return this.analyzer.analyze(
      body.userId,
      body.events,
      body.windowDays ?? 14,
      body.includeAiInsights ?? true,
    );
  }
}
