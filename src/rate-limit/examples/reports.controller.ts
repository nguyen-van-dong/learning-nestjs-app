import { Controller, Get, Post } from '@nestjs/common';
import { DynamicRateLimit } from '../decorators/dynamic-rate-limit.decorator';

@Controller('reports')
export class ReportsController {
  @Get()
  @DynamicRateLimit({
    key: 'reports.list',
    baseLimit: 300,
    ttlSeconds: 60,
    priority: 'normal',
  })
  findAll(): unknown[] {
    return [];
  }

  @Post('export')
  @DynamicRateLimit({
    key: 'reports.export',
    baseLimit: 20,
    ttlSeconds: 60,
    priority: 'low',
  })
  export(): { queued: boolean } {
    return { queued: true };
  }
}
