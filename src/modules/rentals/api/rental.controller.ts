import { toRentalResponse, toRentalSummary } from './rental.response';
import { PERMISSIONS } from '@common/constants/permissions';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RentalService } from '../application/rental.service';
import {
  AddRentalChargeReqDto,
  CreateRentalOrderReqDto,
  RentalListQueryDto,
  RentalOrderPageResDto,
  RentalOrderResDto,
  RescheduleRentalReqDto,
  TransitionRentalReqDto,
} from './rental.dto';
import {
  toAddRentalChargeInput,
  toCreateRentalOrderInput,
  toRentalListQuery,
  toRescheduleRentalInput,
  toTransitionRentalInput,
} from './rental.mapper';

@ApiTags('Rental Orders')
@ApiBearerAuth('access-token')
@Controller('rental-orders')
export class RentalController {
  constructor(private readonly service: RentalService) {}

  @Get()
  @Permissions(PERMISSIONS.RENTALS_VIEW)
  @ApiOperation({ summary: 'List/search orders; use from/until for calendar overlap queries' })
  @ApiOkResponse({ type: RentalOrderPageResDto })
  async list(@CurrentUser() user: CurrentUserType, @Query() query: RentalListQueryDto) {
    const page = await this.service.list(user, toRentalListQuery(query));
    return { items: page.items.map(toRentalSummary), meta: page.meta };
  }

  @Get(':id')
  @Permissions(PERMISSIONS.RENTALS_VIEW)
  @ApiOkResponse({ type: RentalOrderResDto })
  get(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.get(user, id).then(toRentalResponse);
  }

  @Post()
  @Permissions(PERMISSIONS.RENTALS_CREATE)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Recommended for retries from admin/FE.',
  })
  @ApiOperation({ summary: 'Create order + price snapshots + physical allocations atomically' })
  @ApiCreatedResponse({ type: RentalOrderResDto })
  create(
    @CurrentUser() user: CurrentUserType,
    @Body() body: CreateRentalOrderReqDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service
      .create(user, toCreateRentalOrderInput(body), idempotencyKey)
      .then(toRentalResponse);
  }

  @Patch(':id/schedule')
  @Permissions(PERMISSIONS.RENTALS_UPDATE)
  @ApiOperation({
    summary:
      'Reschedule within the policy window from original booking; preserve duration and recheck overlap',
  })
  @ApiOkResponse({ type: RentalOrderResDto })
  reschedule(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: RescheduleRentalReqDto,
  ) {
    return this.service.reschedule(user, id, toRescheduleRentalInput(body)).then(toRentalResponse);
  }

  @Post(':id/confirm')
  @Permissions(PERMISSIONS.RENTALS_UPDATE)
  @ApiOkResponse({ type: RentalOrderResDto })
  confirm(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: TransitionRentalReqDto,
  ) {
    return this.service.confirm(user, id, toTransitionRentalInput(body)).then(toRentalResponse);
  }

  @Post(':id/start')
  @Permissions(PERMISSIONS.RENTALS_UPDATE)
  @ApiOkResponse({ type: RentalOrderResDto })
  start(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: TransitionRentalReqDto,
  ) {
    return this.service.start(user, id, toTransitionRentalInput(body)).then(toRentalResponse);
  }

  @Post(':id/complete')
  @Permissions(PERMISSIONS.RENTALS_UPDATE)
  @ApiOperation({ summary: 'Complete order; returned inventory moves to CLEANING by default' })
  @ApiOkResponse({ type: RentalOrderResDto })
  complete(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: TransitionRentalReqDto,
  ) {
    return this.service.complete(user, id, toTransitionRentalInput(body)).then(toRentalResponse);
  }

  @Post(':id/cancel')
  @Permissions(PERMISSIONS.RENTALS_CANCEL)
  @ApiOperation({
    summary: 'Cancel a RESERVED order; confirmed and active orders cannot be cancelled',
  })
  @ApiOkResponse({ type: RentalOrderResDto })
  cancel(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: TransitionRentalReqDto,
  ) {
    return this.service.cancel(user, id, toTransitionRentalInput(body)).then(toRentalResponse);
  }

  @Post(':id/charges')
  @Permissions(PERMISSIONS.RENTALS_UPDATE)
  @ApiOkResponse({ type: RentalOrderResDto })
  addCharge(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: AddRentalChargeReqDto,
  ) {
    return this.service.addCharge(user, id, toAddRentalChargeInput(body)).then(toRentalResponse);
  }
}
