import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import { PERMISSIONS } from '@common/constants/permissions';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { PaginationQueryDto } from '@common/dto/pagination.query.dto';
import { AuditService } from '../application/audit.service';

class AuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsString() @IsOptional() entityType?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() entityId?: string;
}

@ApiTags('Audit')
@ApiBearerAuth('access-token')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Permissions(PERMISSIONS.AUDIT_VIEW)
  @ApiOperation({ summary: 'List audit logs' })
  list(@CurrentUser() user: CurrentUserType, @Query() query: AuditQueryDto) {
    return this.audit.list({
      shopId: user.shopId,
      page: query.page,
      limit: query.limit,
      entityType: query.entityType,
      entityId: query.entityId,
    });
  }

}
