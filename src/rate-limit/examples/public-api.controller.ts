import { Controller, Get } from '@nestjs/common';
import { DynamicRateLimit } from '../decorators/dynamic-rate-limit.decorator';

@Controller('public-api')
@DynamicRateLimit({
  key: 'public-api.default',
  baseLimit: 100,
  ttlSeconds: 60,
  priority: 'normal',
})
export class PublicApiController {
  @Get()
  index(): { available: boolean } {
    return { available: true };
  }

  @Get('status')
  @DynamicRateLimit({
    key: 'public-api.status',
    baseLimit: 300,
    ttlSeconds: 60,
    priority: 'high',
  })
  status(): { ok: boolean } {
    return { ok: true };
  }
}
