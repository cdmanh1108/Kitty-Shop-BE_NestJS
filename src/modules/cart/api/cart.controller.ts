import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { Public } from '@common/decorators/public.decorator';
import { ErrorResDto } from '@common/dto/response.dto';
import { Body, Controller, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CurrentWebUser,
  WebAuthOriginGuard,
  WebJwtAuthGuard,
  type WebAuthPrincipal,
} from '@modules/web-auth/public';
import { CartService } from '../application/cart.service';
import { CartDraftDto, CartDto, CartGetResDto, CartReplaceReqDto } from './dto/cart.dto';

@Public()
@ApiTags('Web - Cart')
@ApiSurface('web')
@Controller('web/cart')
@UseGuards(WebJwtAuthGuard, WebAuthOriginGuard)
export class CartController {
  constructor(private readonly carts: CartService) {}

  @Get()
  @ApiCookieAuth('web-access')
  @ApiOperation({
    operationId: 'getCart',
    summary: 'Lấy giỏ thuê đã lưu của tài khoản đang đăng nhập',
  })
  @ApiOkResponse({ type: CartGetResDto })
  @ApiUnauthorizedResponse({ type: ErrorResDto })
  async get(@CurrentWebUser() user: WebAuthPrincipal): Promise<CartGetResDto> {
    return { cart: await this.carts.get(user.id) };
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('web-access')
  @ApiOperation({
    operationId: 'replaceCart',
    summary: 'Lưu snapshot giỏ thuê theo phiên bản chống ghi đè',
  })
  @ApiOkResponse({ type: CartDto })
  @ApiBadRequestResponse({ type: ErrorResDto })
  @ApiConflictResponse({ type: ErrorResDto })
  @ApiUnauthorizedResponse({ type: ErrorResDto })
  replace(
    @CurrentWebUser() user: WebAuthPrincipal,
    @Body() body: CartReplaceReqDto,
  ): Promise<CartDto> {
    return this.carts.replace(user.id, body.version, body);
  }

  @Put('merge-guest')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('web-access')
  @ApiOperation({
    operationId: 'mergeGuestCart',
    summary: 'Nhập giỏ khách vào giỏ của tài khoản đang đăng nhập',
  })
  @ApiOkResponse({ type: CartDto })
  @ApiBadRequestResponse({ type: ErrorResDto })
  @ApiConflictResponse({ type: ErrorResDto })
  @ApiUnauthorizedResponse({ type: ErrorResDto })
  mergeGuest(
    @CurrentWebUser() user: WebAuthPrincipal,
    @Body() body: CartDraftDto,
  ): Promise<CartDto> {
    return this.carts.mergeGuest(user.id, body);
  }
}
