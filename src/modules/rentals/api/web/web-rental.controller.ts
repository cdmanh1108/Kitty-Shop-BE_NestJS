import { Public } from '@common/decorators/public.decorator';
import { ShopResolver } from '@common/tenant/shop-resolver';
import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
@Controller('web')
export class WebRentalController {
  constructor(
    private readonly shopResolver: ShopResolver,
    private readonly rentalService: WebRentalService,
  ) {}

  @Get('availability')
  @ApiOperation({ summary: 'Kiểm tra tình trạng trống của sản phẩm hoặc biến thể' })
  @ApiResponse({ status: 200, type: WebAvailabilityResDto })
  async checkAvailability(
    @Req() request: Request,
    @Query() query: WebAvailabilityQueryDto,
  ): Promise<WebAvailabilityResDto> {
    const shopId = await this.shopResolver.resolveShopId(request);
    return this.rentalService.checkAvailability(shopId, query);
  }

  @Post('rental/quote')
  @ApiOperation({ summary: 'Tính báo giá thuê tạm tính chính thức từ server' })
  @ApiResponse({ status: 200, type: WebRentalQuoteResDto })
  async calculateQuote(
    @Req() request: Request,
    @Body() body: WebRentalQuoteReqDto,
  ): Promise<WebRentalQuoteResDto> {
    const shopId = await this.shopResolver.resolveShopId(request);
    return this.rentalService.calculateQuote(shopId, body);
  }

  @Post('rental-orders')
  @ApiOperation({ summary: 'Tạo đơn đặt thuê từ Web Storefront' })
  @ApiResponse({ status: 201, type: WebCreateOrderResDto })
  async createOrder(
    @Req() request: Request,
    @Body() body: WebCreateOrderReqDto,
  ): Promise<WebCreateOrderResDto> {
    const shopId = await this.shopResolver.resolveShopId(request);
    return this.rentalService.createOrder(shopId, body);
  }

  @Post('rental-orders/lookup')
  @ApiOperation({ summary: 'Tra cứu trạng thái đơn thuê bảo mật bằng mã đơn và SĐT' })
  @ApiResponse({ status: 200, type: WebOrderLookupResDto })
  async lookupOrder(
    @Req() request: Request,
    @Body() body: WebOrderLookupReqDto,
  ): Promise<WebOrderLookupResDto> {
    const shopId = await this.shopResolver.resolveShopId(request);
    return this.rentalService.lookupOrder(shopId, body);
  }
}
