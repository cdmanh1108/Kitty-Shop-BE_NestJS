import { toRentalResponse, toRentalSummary } from './rental.response';
import { PERMISSIONS } from '@common/constants/permissions';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  HttpCode,
  Header,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfirmationUploadInterceptor } from './confirmation-upload.interceptor';
import {
  RentalConfirmationService,
  type ConfirmationImage,
} from '../application/rental-confirmation.service';
import { ConfirmRentalReqDto, ConfirmationOptionsResDto } from './rental-confirmation.dto';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiConsumes,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
  ApiPayloadTooLargeResponse,
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
  constructor(
    private readonly service: RentalService,
    private readonly confirmations: RentalConfirmationService,
  ) {}

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
  @Permissions(PERMISSIONS.RENTALS_CONFIRM)
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Manually acknowledge receipt and collateral; atomically confirm without Payment API. Requires rentals.confirm.',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(ConfirmationUploadInterceptor)
  @ApiBadRequestResponse({
    description: 'Invalid collateral, evidence, or order state (including repeated confirmation).',
  })
  @ApiForbiddenResponse({ description: 'Requires rentals.confirm.' })
  @ApiUnauthorizedResponse({ description: 'Authentication required.' })
  @ApiPayloadTooLargeResponse({ description: 'Evidence exceeds 15 MiB.' })
  @ApiNotFoundResponse({ description: 'Order does not exist in authenticated shop.' })
  @ApiOkResponse({ type: RentalOrderResDto })
  confirm(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: ConfirmRentalReqDto,
    @UploadedFile() file?: ConfirmationImage,
  ) {
    return this.confirmations
      .confirm(
        user,
        id,
        {
          collateralMethod: body.collateralMethod,
          collateralAmount: body.collateralAmount,
          documentType: body.documentType,
          note: body.note?.trim(),
        },
        file,
      )
      .then(toRentalResponse);
  }

  @Get(':id/confirmation-options')
  @Permissions(PERMISSIONS.RENTALS_CONFIRM)
  @ApiForbiddenResponse({ description: 'Requires rentals.confirm.' })
  @ApiNotFoundResponse({ description: 'Order does not exist in authenticated shop.' })
  @ApiUnauthorizedResponse({ description: 'Authentication required.' })
  @ApiOkResponse({ type: ConfirmationOptionsResDto })
  confirmationOptions(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.confirmations.options(user, id);
  }

  @Get(':id/confirmation/evidence')
  @ApiForbiddenResponse({ description: 'Requires rentals.confirm.' })
  @ApiNotFoundResponse({ description: 'Order or evidence does not exist in authenticated shop.' })
  @ApiUnauthorizedResponse({ description: 'Authentication required.' })
  @Header('Cache-Control', 'private, no-store')
  @Permissions(PERMISSIONS.RENTALS_CONFIRM)
  @ApiOkResponse({
    schema: { type: 'string', format: 'binary' },
    description: 'Evidence image; requires rentals.confirm. Private, no-store.',
  })
  async evidence(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    const image = await this.confirmations.evidence(user, id);
    return new StreamableFile(image.body, {
      type: image.mimeType,
      disposition: 'attachment; filename="evidence"',
    });
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

  @Post(':id/collateral/return')
  @Permissions(PERMISSIONS.RENTALS_UPDATE)
  @ApiOkResponse({ type: RentalOrderResDto })
  returnCollateral(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.returnCollateral(user, id).then(toRentalResponse);
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
