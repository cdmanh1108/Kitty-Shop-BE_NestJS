import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { Public } from '@common/decorators/public.decorator';
import { ErrorResDto } from '@common/dto/response.dto';
import { ShopResolver } from '@common/tenant/shop-resolver';
import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { WebRentalService } from '../../application/web-rental.service';
import {
  WebAvailabilityQueryDto,
  WebAvailabilityResDto,
  WebCreateOrderReqDto,
  WebCreateOrderResDto,
  WebOrderLookupReqDto,
  WebOrderLookupResDto,
  WebRentalQuoteReqDto,
  WebRentalQuoteResDto,
} from './dto/web-rental.dto';

@Public()
@ApiTags('Web - Rental Orders')
@ApiSurface('web')
@Controller('web')
export class WebRentalController {
  constructor(
    private readonly shopResolver: ShopResolver,
    private readonly rentalService: WebRentalService,
  ) {}

  @Get('availability')
  @ApiOperation({
    operationId: 'getWebAvailability',
    summary: 'Kiểm tra tình trạng trống của sản phẩm hoặc biến thể',
  })
  @ApiOkResponse({ type: WebAvailabilityResDto, description: 'Tình trạng còn hàng của sản phẩm hoặc biến thể' })
  @ApiBadRequestResponse({
    type: ErrorResDto,
    description: 'Khoảng thời gian thuê không hợp lệ hoặc thiếu productId/variantId',
  })
  async checkAvailability(
    @Req() request: Request,
    @Query() query: WebAvailabilityQueryDto,
  ): Promise<WebAvailabilityResDto> {
    const shopId = await this.shopResolver.resolveShopId(request);
    return this.rentalService.checkAvailability(shopId, query);
  }

  @Post('rental/quote')
  @ApiOperation({
    operationId: 'createWebRentalQuote',
    summary: 'Tính báo giá thuê tạm tính chính thức từ server',
  })
  @ApiOkResponse({ type: WebRentalQuoteResDto, description: 'Báo giá thuê tạm tính chính thức từ server' })
  @ApiBadRequestResponse({
    type: ErrorResDto,
    description: 'Dữ liệu tính báo giá không hợp lệ hoặc khoảng ngày không đúng',
  })
  async calculateQuote(
    @Req() request: Request,
    @Body() body: WebRentalQuoteReqDto,
  ): Promise<WebRentalQuoteResDto> {
    const shopId = await this.shopResolver.resolveShopId(request);
    return this.rentalService.calculateQuote(shopId, body);
  }

  @Post('rental-orders')
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
    description: 'Dữ liệu người thuê, khoảng ngày hoặc phương thức thế chân không hợp lệ',
  })
  @ApiNotFoundResponse({
    type: ErrorResDto,
    description: 'Sản phẩm hoặc biến thể không khả dụng',
  })
  @ApiConflictResponse({
    type: ErrorResDto,
    description: 'Sản phẩm không đủ tồn kho khả dụng trong khoảng ngày đã chọn',
  })
  async createOrder(
    @Req() request: Request,
    @Body() body: WebCreateOrderReqDto,
  ): Promise<WebCreateOrderResDto> {
    const shopId = await this.shopResolver.resolveShopId(request);
    return this.rentalService.createOrder(shopId, body);
  }

  @Post('rental-orders/lookup')
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
  async lookupOrder(
    @Req() request: Request,
    @Body() body: WebOrderLookupReqDto,
  ): Promise<WebOrderLookupResDto> {
    const shopId = await this.shopResolver.resolveShopId(request);
    return this.rentalService.lookupOrder(shopId, body);
  }
}
