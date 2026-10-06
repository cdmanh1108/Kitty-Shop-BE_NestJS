import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaResDto } from '@common/dto/response.dto';
import type { JsonValue } from '@common/types/json';

export class AuditLogResDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) shopId!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) actorUserId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) actorMemberId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) actorWebAccountId!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Tên hiển thị hiện tại của nhân viên trong cửa hàng, không phải tên lưu tại thời điểm thao tác.',
  })
  actorDisplayName!: string | null;
  @ApiProperty() action!: string;
  @ApiProperty() entityType!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) entityId!: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  oldValues!: JsonValue | null;
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  newValues!: JsonValue | null;
  @ApiProperty({ type: String, nullable: true }) ipAddress!: string | null;
  @ApiProperty({ type: String, nullable: true }) userAgent!: string | null;
  @ApiProperty({ type: String, nullable: true }) requestId!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}

export class AuditLogPageResDto {
  @ApiProperty({ type: [AuditLogResDto] }) items!: AuditLogResDto[];
  @ApiProperty({ type: PaginationMetaResDto }) meta!: PaginationMetaResDto;
}
