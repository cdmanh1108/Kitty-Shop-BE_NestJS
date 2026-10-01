import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { Public } from '@common/decorators/public.decorator';
import { ErrorResDto } from '@common/dto/response.dto';
import { ShopResolver } from '@common/tenant/shop-resolver';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  OptionalWebJwtAuthGuard,
  WebAuthOriginGuard,
  type WebAuthRequest,
} from '@modules/web-auth/public';
import { WebRentalEvaluationService } from '../../application/web-rental-evaluation.service';
import { WebRentalOrderService } from '../../application/web-rental-order.service';
import { WebRentalLookupService } from '../../application/web-rental-lookup.service';
import {
  WebAvailabilityQueryDto,
  WebAvailabilityResDto,
  WebRentalQuoteReqDto,
  WebRentalQuoteResDto,
} from './dto/web-rental-evaluation.dto';
import { WebCreateOrderReqDto, WebCreateOrderResDto } from './dto/web-rental-order.dto';
import { WebOrderLookupReqDto, WebOrderLookupResDto } from './dto/web-rental-lookup.dto';

@Public()
@ApiTags('Web - Rental Orders')
@ApiSurface('web')
@Controller('web')
export class WebRentalController {
  constructor(
    private readonly shopResolver: ShopResolver,
    private readonly evaluation: WebRentalEvaluationService,
    private readonly orders: WebRentalOrderService,
    private readonly lookups: WebRentalLookupService,
  ) {}

  @Get('availability')
  @ApiOperation({
    operationId: 'getWebAvailability',
    summary: 'Kiểm tra tình trạng trống của sản phẩm hoặc biến thể',
  })
  @ApiOkResponse({
    type: WebAvailabilityResDto,
    description: 'Tình trạng còn hàng của sản phẩm hoặc biến thể',
  })
  @ApiBadRequestResponse({
    type: ErrorResDto,
    description: 'Khoảng thời gian thuê không hợp lệ hoặc thiếu productId/variantId',
  })
  async checkAvailability(@Query() query: WebAvailabilityQueryDto): Promise<WebAvailabilityResDto> {
    const shopId = await this.shopResolver.resolveShopId();
    return this.evaluation.checkAvailability(shopId, query);
  }

  @Post('rental/quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'createWebRentalQuote',
    summary: 'Tính báo giá thuê tạm tính chính thức từ server',
  })
  @ApiOkResponse({
    type: WebRentalQuoteResDto,
    description: 'Báo giá thuê tạm tính chính thức từ server',
  })
  @ApiBadRequestResponse({
    type: ErrorResDto,
    description: 'Dữ liệu tính báo giá không hợp lệ hoặc khoảng ngày không đúng',
  })
  async calculateQuote(@Body() body: WebRentalQuoteReqDto): Promise<WebRentalQuoteResDto> {
    const shopId = await this.shopResolver.resolveShopId();
    return this.evaluation.calculateQuote(shopId, body);
  }

  @Post('rental-orders')
  @UseGuards(OptionalWebJwtAuthGuard, WebAuthOriginGuard)
  @Header('Cache-Control', 'no-store')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Opaque ASCII key (1-255 characters) created once per checkout intent and reused for retries.',
  })
  @ApiOperation({
    operationId: 'createWebRentalOrder',
    summary: 'Tạo đơn đặt thuê từ Web Storefront',
  })
  @ApiCreatedResponse({
    type: WebCreateOrderResDto,
    description: 'Đơn đặt thuê tạo thành công (trạng thái chờ thanh toán)',
  })
  @ApiBadRequestResponse({
    type: ErrorResDto,
    description:
      'Dữ liệu người thuê, khoảng ngày, phương thức thế chân hoặc Idempotency-Key không hợp lệ',
  })
  @ApiNotFoundResponse({
    type: ErrorResDto,
    description: 'Sản phẩm hoặc biến thể không khả dụng',
  })
  @ApiConflictResponse({
    type: ErrorResDto,
    description:
      'Sản phẩm không đủ tồn kho, thông tin khách hàng không thể dùng để đặt thuê, hoặc Idempotency-Key đang được dùng',
  })
  async createOrder(
    @Req() request: WebAuthRequest,
    @Body() body: WebCreateOrderReqDto,
  ): Promise<WebCreateOrderResDto> {
    const shopId = await this.shopResolver.resolveShopId();
    const idempotencyKeys = request.rawHeaders
      .filter((_, index) => index % 2 === 0)
      .map((header, index) => ({ header, value: request.rawHeaders[index * 2 + 1] }))
      .filter(({ header }) => header.toLowerCase() === 'idempotency-key')
      .map(({ value }) => value ?? '');
    return this.orders.createOrder(
      shopId,
      body,
      idempotencyKeys.length === 0
        ? undefined
        : idempotencyKeys.length === 1
          ? idempotencyKeys[0]
          : idempotencyKeys,
      { webAccountId: request.webUser?.id ?? null },
    );
  }

  @Post('rental-orders/lookup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'lookupWebRentalOrder',
    summary: 'Tra cứu trạng thái đơn thuê bảo mật bằng mã đơn và SĐT',
  })
  @ApiOkResponse({ type: WebOrderLookupResDto, description: 'Thông tin tóm tắt đơn thuê' })
  @ApiBadRequestResponse({
    type: ErrorResDto,
    description: 'Mã đơn hoặc số điện thoại không hợp lệ',
  })
  @ApiNotFoundResponse({
    type: ErrorResDto,
    description: 'Không tìm thấy đơn thuê hoặc số điện thoại không khớp',
  })
  async lookupOrder(@Body() body: WebOrderLookupReqDto): Promise<WebOrderLookupResDto> {
    const shopId = await this.shopResolver.resolveShopId();
    return this.lookups.lookupOrder(shopId, body);
  }
}
