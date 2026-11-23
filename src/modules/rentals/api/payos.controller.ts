import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { Public } from '@common/decorators/public.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import { PERMISSIONS } from '@common/constants/permissions';
import { ShopResolver } from '@common/shop-context/shop-resolver';
import { PaginationQueryDto } from '@common/dto/pagination.query.dto';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentWebUser,
  WebAuthOriginGuard,
  WebJwtAuthGuard,
  type WebAuthPrincipal,
} from '@modules/web-auth/public';
import { PaymentService } from '@modules/payments/public/payment-service';
import { WebAccountRentalOrderParamsDto } from './web/dto/web-account-rental-orders.dto';
import {
  PayosCapabilityDto,
  PayosPaymentDto,
  PayosRefundReqDto,
  PayosReviewDto,
  PayosReviewQueueDto,
  toPayosPayment,
} from './payos.dto';

@Public()
@ApiSurface('web')
@ApiTags('Web - Payments')
@Controller('web')
export class WebPayosController {
  constructor(
    private readonly service: PaymentService,
    private readonly shops: ShopResolver,
  ) {}

  @Get('payments/payos')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'getWebPayosCapability' })
  @ApiOkResponse({ type: PayosCapabilityDto })
  capability(): PayosCapabilityDto {
    return { enabled: this.service.checkoutEnabled() };
  }

  @Get('account/rental-orders/:orderCode/payos')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(WebJwtAuthGuard, WebAuthOriginGuard)
  @ApiCookieAuth('web-access')
  @ApiOperation({ operationId: 'getWebPayosPayment' })
  @ApiOkResponse({ type: PayosPaymentDto })
  async get(
    @CurrentWebUser() user: WebAuthPrincipal,
    @Param() params: WebAccountRentalOrderParamsDto,
  ) {
    return toPayosPayment(
      await this.service.get({
        shopId: await this.shops.resolveShopId(),
        webAccountId: user.id,
        orderCode: params.orderCode,
      }),
    );
  }

  @Post('account/rental-orders/:orderCode/payos')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(WebJwtAuthGuard, WebAuthOriginGuard)
  @ApiCookieAuth('web-access')
  @ApiOperation({ operationId: 'openWebPayosPayment' })
  @ApiOkResponse({ type: PayosPaymentDto })
  async open(
    @CurrentWebUser() user: WebAuthPrincipal,
    @Param() params: WebAccountRentalOrderParamsDto,
  ) {
    return toPayosPayment(
      await this.service.open({
        shopId: await this.shops.resolveShopId(),
        webAccountId: user.id,
        orderCode: params.orderCode,
      }),
    );
  }
}

@ApiSurface('admin')
@ApiTags('Admin - payOS')
@Controller('admin/payments/payos')
export class AdminPayosController {
  constructor(private readonly service: PaymentService) {}

  @Get('orders/:id')
  @Permissions(PERMISSIONS.PAYMENTS_VIEW)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ operationId: 'getAdminPayosPayment' })
  @ApiOkResponse({ type: PayosPaymentDto })
  async get(@CurrentUser() user: CurrentUserType, @Param('id', ParseUUIDPipe) orderId: string) {
    return toPayosPayment(await this.service.get({ shopId: user.shopId, orderId }));
  }

  @Post('orders/:id/reconcile')
  @HttpCode(200)
  @Permissions(PERMISSIONS.PAYMENTS_CREATE)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ operationId: 'reconcileAdminPayosPayment' })
  @ApiOkResponse({ type: PayosPaymentDto })
  async reconcile(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseUUIDPipe) orderId: string,
  ) {
    const scope = { shopId: user.shopId, orderId };
    await this.service.sync(scope, 'reconcile');
    return toPayosPayment(await this.service.get(scope));
  }

  @Post('orders/:id/refund-and-cancel')
  @HttpCode(204)
  @Permissions(PERMISSIONS.PAYMENTS_CREATE, PERMISSIONS.RENTALS_CANCEL)
  @ApiOperation({ operationId: 'recordAdminPayosReservationRefund' })
  @ApiNoContentResponse()
  async refundAndCancel(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PayosRefundReqDto,
  ) {
    await this.service.refundPaidReservation(user, id, body.refundReference);
  }

  @Get('review')
  @Permissions(PERMISSIONS.PAYMENTS_VIEW)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ operationId: 'listAdminPayosReview' })
  @ApiOkResponse({ type: [PayosReviewDto] })
  async list(@CurrentUser() user: CurrentUserType) {
    return (await this.service.listReview(user.shopId)).map((item) => ({
      ...item,
      paidAt: item.paidAt.toISOString(),
    }));
  }

  @Get('review-queue')
  @Permissions(PERMISSIONS.PAYMENTS_VIEW)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ operationId: 'listAdminPayosReviewQueue' })
  @ApiOkResponse({ type: PayosReviewQueueDto })
  reviewQueue(@CurrentUser() user: CurrentUserType, @Query() query: PaginationQueryDto) {
    return this.service.reviewQueue(user.shopId, { page: query.page, limit: query.limit });
  }

  @Post('review/:id/refund')
  @HttpCode(204)
  @Permissions(PERMISSIONS.PAYMENTS_CREATE)
  @ApiOperation({ operationId: 'recordAdminPayosRefund' })
  @ApiNoContentResponse()
  async refund(
    @CurrentUser() user: CurrentUserType,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PayosRefundReqDto,
  ) {
    await this.service.recordRefund(user, id, body.refundReference);
  }
}
