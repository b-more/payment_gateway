import { Controller, Get } from '@nestjs/common';

// Liveness probe consumed by the container HEALTHCHECK (DEP-5). No business logic.
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok'; service: 'ic-api' } {
    return { status: 'ok', service: 'ic-api' };
  }
}
