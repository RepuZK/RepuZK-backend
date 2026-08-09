import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  /**
   * GET /health
   *
   * Simple liveness probe — no auth required.
   * Returns HTTP 200 with { status: "ok", timestamp }.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  check(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
