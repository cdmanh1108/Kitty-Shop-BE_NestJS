import { PERMISSIONS } from '@common/constants/permissions';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { ErrorResDto } from '@common/dto/response.dto';
import { DeliveryService } from '../application/delivery.service';
import {
  CreateDeliveryReqDto,
  DeliveryPageQueryDto,
  DeliveryPageResDto,
  DeliveryResDto,
  UpdateDeliveryStatusReqDto,
} from './delivery.dto';
import { toCreateDeliveryInput, toUpdateDeliveryStatusInput } from './delivery.mapper';

class DeliveryListQueryDto {
  @IsUUID(undefined, { message: 'Đơn thuê không hợp lệ. Vui lòng chọn lại.' })
  @IsOptional()
  orderId?: string;
}

@ApiSurface('admin')
@ApiTags('Delivery')
@ApiBearerAuth('access-token')
@Controller('admin/deliveries')
export class DeliveryController {
  constructor(private readonly service: DeliveryService) {}

  @Get()
  @Permissions(PERMISSIONS.DELIVERIES_VIEW)
  @ApiOkResponse({ type: [DeliveryResDto] })
  list(@CurrentUser() user: CurrentUserType, @Query() query: DeliveryListQueryDto) {
    return this.service.list(user, query.orderId);
  }

  @Get('page')
  @Permissions(PERMISSIONS.DELIVERIES_VIEW)
  @ApiOkResponse({ type: DeliveryPageResDto })
  @ApiBadRequestResponse({ type: ErrorResDto })
  page(@CurrentUser() user: CurrentUserType, @Query() query: DeliveryPageQueryDto) {
    return this.service.page(user, query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.DELIVERIES_VIEW)
  @ApiOkResponse({ type: DeliveryResDto })
  @ApiNotFoundResponse({ type: ErrorResDto })
  get(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(user, id);
  }

  @Post('orders/:orderId')
  @Permissions(PERMISSIONS.DELIVERIES_MANAGE)
  @ApiCreatedResponse({ type: DeliveryResDto })
  create(
    @CurrentUser() user: CurrentUserType,
    @Param('orderId') orderId: string,
    @Body() body: CreateDeliveryReqDto,
  ) {
    return this.service.create(user, orderId, toCreateDeliveryInput(body));
  }

  @Patch(':id/status')
  @Permissions(PERMISSIONS.DELIVERIES_MANAGE)
  @ApiOkResponse({ type: DeliveryResDto })
  @ApiBadRequestResponse({ type: ErrorResDto })
  @ApiConflictResponse({
    type: ErrorResDto,
    description:
      'Không thể thực hiện chuyển trạng thái giao hàng này hoặc trạng thái đã thay đổi đồng thời.',
  })
  @ApiNotFoundResponse({ type: ErrorResDto })
  updateStatus(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: UpdateDeliveryStatusReqDto,
  ) {
    return this.service.updateStatus(user, id, toUpdateDeliveryStatusInput(body));
  }
}
