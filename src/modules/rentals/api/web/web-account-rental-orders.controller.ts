import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { Public } from '@common/decorators/public.decorator';
import { ErrorResDto } from '@common/dto/response.dto';
import { Controller, Get, Header, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentWebUser, WebJwtAuthGuard } from '@modules/web-auth/api/web-jwt-auth';
import type { WebProfile } from '@modules/web-auth/domain/web-auth.repository';
import { WebAccountRentalOrdersService } from '../../application/web-account-rental-orders.service';
import {
  WebAccountRentalOrderDetailResDto,
  WebAccountRentalOrderParamsDto,
  WebAccountRentalOrdersListResDto,
  WebAccountRentalOrdersQueryDto,
} from './dto/web-account-rental-orders.dto';
import {
  toWebAccountRentalOrderDetailResponse,
  toWebAccountRentalOrdersListResponse,
} from './web-account-rental-orders.response';

@Public()
@ApiTags('Web - Account Rental Orders')
@ApiSurface('web')
@Controller('web/account/rental-orders')
@UseGuards(WebJwtAuthGuard)
export class WebAccountRentalOrdersController {
  constructor(private readonly orders: WebAccountRentalOrdersService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiCookieAuth('web-access')
  @ApiOperation({
    operationId: 'listWebAccountRentalOrders',
    summary: 'Lấy lịch sử đơn thuê của tài khoản đang đăng nhập',
  })
  @ApiOkResponse({ type: WebAccountRentalOrdersListResDto })
  @ApiBadRequestResponse({ type: ErrorResDto })
  @ApiUnauthorizedResponse({ type: ErrorResDto })
  async list(
    @CurrentWebUser() user: WebProfile,
    @Query() query: WebAccountRentalOrdersQueryDto,
  ): Promise<WebAccountRentalOrdersListResDto> {
    return toWebAccountRentalOrdersListResponse(
      await this.orders.list(user.id, {
        page: query.page,
        limit: query.limit,
        ...(query.status ? { status: query.status } : {}),
      }),
    );
  }

  @Get(':orderCode')
  @Header('Cache-Control', 'private, no-store')
  @ApiCookieAuth('web-access')
  @ApiOperation({
    operationId: 'getWebAccountRentalOrder',
    summary: 'Lấy chi tiết đơn thuê của tài khoản đang đăng nhập',
  })
  @ApiOkResponse({ type: WebAccountRentalOrderDetailResDto })
  @ApiBadRequestResponse({ type: ErrorResDto })
  @ApiNotFoundResponse({ type: ErrorResDto })
  @ApiUnauthorizedResponse({ type: ErrorResDto })
  async get(
    @CurrentWebUser() user: WebProfile,
    @Param() params: WebAccountRentalOrderParamsDto,
  ): Promise<WebAccountRentalOrderDetailResDto> {
    return toWebAccountRentalOrderDetailResponse(await this.orders.get(user.id, params.orderCode));
  }
}
