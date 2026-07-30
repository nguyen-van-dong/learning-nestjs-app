import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../admin/decorators/require-permissions.decorator';
import { AdminAuthGuard } from '../admin/guard/admin-auth.guard';
import { PermissionGuard } from '../admin/guard/permission.guard';
import { AuditLogService } from './audit-log.service';

@Controller('admin/audit-logs')
@UseGuards(AdminAuthGuard, PermissionGuard)
@RequirePermissions('audit-log.read')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  findAll(
    @Query('actorType') actorType?: string,
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('requestId') requestId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditLogService.findAll({
      actorType,
      actorId,
      action,
      entityType,
      entityId,
      requestId,
      page: this.toNumber(page),
      limit: this.toNumber(limit),
    });
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const auditLog = await this.auditLogService.findOne(id);
    if (!auditLog) {
      throw new NotFoundException('Audit log not found');
    }
    return auditLog;
  }

  private toNumber(value?: string): number | undefined {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
