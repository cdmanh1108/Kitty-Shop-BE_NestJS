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
import { SettlementUploadInterceptor } from './settlement-upload.interceptor';
import {
  RentalConfirmationService,
  type ConfirmationImage,
} from '../application/rental-confirmation.service';
import {
  RentalSettlementService,
  type SettlementImage,
} from '../application/rental-settlement.service';
import { ConfirmRentalReqDto, ConfirmationOptionsResDto } from './rental-confirmation.dto';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiConsumes,
  ApiQuery,
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
  ReturnPreviewResDto,
  ReturnRentalOrderReqDto,
  SettleRentalOrderReqDto,
  TransitionRentalReqDto,
} from './rental.dto';
import {
  toAddRentalChargeInput,
  toCreateRentalOrderInput,
  toRentalListQuery,
  toRescheduleRentalInput,
  toReturnRentalOrderInput,
  toTransitionRentalInput,
} from './rental.mapper';

@ApiTags('Rental Orders')
@ApiBearerAuth('access-token')
@Controller('rental-orders')
export class RentalController {
  constructor(
    private readonly service: RentalService,
    private readonly confirmations: RentalConfirmationService,
    private readonly settlements: RentalSettlementService,
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
          paymentMethod: body.paymentMethod,
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

  @Get(':id/return-preview')
  @Permissions(PERMISSIONS.RENTALS_RETURN)
  @ApiOperation({
    summary: 'Preview return details, calculate late fees and list items for inspection',
  })
  @ApiQuery({
    name: 'returnedAt',
    required: false,
    type: String,
    description: 'ISO-8601 string of actual return timestamp',
  })
  @ApiOkResponse({ type: ReturnPreviewResDto })
  returnPreview(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Query('returnedAt') returnedAt?: string,
  ) {
    return this.service.getReturnPreview(user, id, returnedAt ? new Date(returnedAt) : undefined);
  }

  @Post(':id/return')
  @Permissions(PERMISSIONS.RENTALS_RETURN)
  @HttpCode(200)
  @ApiOperation({
    summary: 'Receive rental return with per-item inspection and optional manual charges',
  })
  @ApiOkResponse({ type: RentalOrderResDto })
  receiveReturn(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: ReturnRentalOrderReqDto,
  ) {
    return this.service
      .receiveReturn(user, id, toReturnRentalOrderInput(body))
      .then(toRentalResponse);
  }

  @Post(':id/settle')
  @Permissions(PERMISSIONS.RENTALS_SETTLE)
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Settle returned rental order; offsets charges against cash deposit, releases document collateral if requested, and completes order',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(SettlementUploadInterceptor)
  @ApiOkResponse({ type: RentalOrderResDto })
  settle(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: SettleRentalOrderReqDto,
    @UploadedFile() file?: SettlementImage,
  ) {
    return this.settlements.settle(user, id, body, file).then(toRentalResponse);
  }

  @Get(':id/settlement/evidence')
  @Permissions(PERMISSIONS.RENTALS_SETTLE)
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({
    schema: { type: 'string', format: 'binary' },
    description: 'Settlement evidence image; requires rentals.settle. Private, no-store.',
  })
  async settlementEvidence(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    const image = await this.settlements.evidence(user, id);
    return new StreamableFile(image.body, {
      type: image.mimeType,
      disposition: 'attachment; filename="settlement-evidence"',
    });
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
