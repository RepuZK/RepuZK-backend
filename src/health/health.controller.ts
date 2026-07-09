import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';

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
