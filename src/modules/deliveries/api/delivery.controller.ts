import { PERMISSIONS } from '@common/constants/permissions';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { DeliveryService } from '../application/delivery.service';
import { CreateDeliveryReqDto, UpdateDeliveryStatusReqDto } from './delivery.dto';
import { toCreateDeliveryInput, toUpdateDeliveryStatusInput } from './delivery.mapper';

class DeliveryListQueryDto {
  @IsUUID(undefined, { message: 'Mã đơn thuê phải là UUID hợp lệ.' })
  @IsOptional()
  orderId?: string;
}

@ApiTags('Delivery')
@ApiBearerAuth('access-token')
@Controller('deliveries')
export class DeliveryController {
  constructor(private readonly service: DeliveryService) {}

  @Get()
  @Permissions(PERMISSIONS.DELIVERIES_VIEW)
  list(@CurrentUser() user: CurrentUserType, @Query() query: DeliveryListQueryDto) {
    return this.service.list(user, query.orderId);
  }

  @Post('orders/:orderId')
  @Permissions(PERMISSIONS.DELIVERIES_MANAGE)
  create(
    @CurrentUser() user: CurrentUserType,
    @Param('orderId') orderId: string,
    @Body() body: CreateDeliveryReqDto,
  ) {
    return this.service.create(user, orderId, toCreateDeliveryInput(body));
  }

  @Patch(':id/status')
  @Permissions(PERMISSIONS.DELIVERIES_MANAGE)
  updateStatus(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: UpdateDeliveryStatusReqDto,
  ) {
    return this.service.updateStatus(user, id, toUpdateDeliveryStatusInput(body));
  }
}
