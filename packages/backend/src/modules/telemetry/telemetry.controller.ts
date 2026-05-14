import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedPrincipal } from '../auth/jwt.strategy';
import { TelemetryBatchDto } from './dto/telemetry-batch.dto';
import { TelemetryService, type IngestResult } from './telemetry.service';

@Controller('telemetry')
@UseGuards(JwtAuthGuard)
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Post('batch')
  @HttpCode(HttpStatus.ACCEPTED)
  async ingest(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() dto: TelemetryBatchDto,
  ): Promise<IngestResult> {
    return this.telemetry.ingestBatch(principal.userId, dto);
  }
}
