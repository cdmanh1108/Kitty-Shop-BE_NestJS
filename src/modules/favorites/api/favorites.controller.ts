import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { Public } from '@common/decorators/public.decorator';
import { ErrorResDto } from '@common/dto/response.dto';
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CurrentWebUser,
  WebAuthOriginGuard,
  WebJwtAuthGuard,
  type WebAuthPrincipal,
} from '@modules/web-auth/public';
import { FavoritesMapper } from './favorites.mapper';
import { FavoriteProductListResDto } from './dto/favorite-products.dto';
import { FavoritesService } from '../application/favorites.service';
import {
  FavoritesListQueryDto,
  FavoriteMutationResDto,
  FavoriteSummaryResDto,
  FavoritesStatusQueryDto,
  FavoritesStatusResDto,
} from './dto/favorites.dto';

@Public()
@ApiTags('Web - Favorites')
@ApiSurface('web')
@Controller('web/favorites')
@UseGuards(WebJwtAuthGuard, WebAuthOriginGuard)
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get('summary')
  @ApiCookieAuth('web-access')
  @ApiOperation({ operationId: 'getFavoriteSummary', summary: 'Lấy tổng số sản phẩm yêu thích' })
  @ApiOkResponse({ type: FavoriteSummaryResDto })
  @ApiUnauthorizedResponse({ type: ErrorResDto })
  summary(@CurrentWebUser() user: WebAuthPrincipal): Promise<FavoriteSummaryResDto> {
    return this.favorites.summary(user.id);
  }

  @Get('status')
  @ApiCookieAuth('web-access')
  @ApiOperation({
    operationId: 'getFavoriteStatus',
    summary: 'Lấy trạng thái yêu thích theo sản phẩm',
  })
  @ApiOkResponse({ type: FavoritesStatusResDto })
  @ApiUnauthorizedResponse({ type: ErrorResDto })
  status(
    @CurrentWebUser() user: WebAuthPrincipal,
    @Query() query: FavoritesStatusQueryDto,
  ): Promise<FavoritesStatusResDto> {
    return this.favorites.status(user.id, query.productIds);
  }

  @Get()
  @ApiCookieAuth('web-access')
  @ApiOperation({ operationId: 'listFavorites', summary: 'Lấy sản phẩm yêu thích của tài khoản' })
  @ApiOkResponse({ type: FavoriteProductListResDto })
  @ApiUnauthorizedResponse({ type: ErrorResDto })
  async list(
    @CurrentWebUser() user: WebAuthPrincipal,
    @Query() query: FavoritesListQueryDto,
  ): Promise<FavoriteProductListResDto> {
    return FavoritesMapper.toProductListResponse(
      await this.favorites.list(user.id, query.page, query.limit),
    );
  }

  @Put(':productId')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('web-access')
  @ApiOperation({ operationId: 'addFavorite', summary: 'Lưu sản phẩm yêu thích (idempotent)' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiOkResponse({ type: FavoriteMutationResDto })
  @ApiNotFoundResponse({ type: ErrorResDto })
  @ApiUnauthorizedResponse({ type: ErrorResDto })
  async add(
    @CurrentWebUser() user: WebAuthPrincipal,
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
  ): Promise<FavoriteMutationResDto> {
    return this.favorites.add(user.id, productId);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('web-access')
  @ApiOperation({ operationId: 'removeFavorite', summary: 'Xóa sản phẩm yêu thích (idempotent)' })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiOkResponse({ type: FavoriteMutationResDto })
  @ApiUnauthorizedResponse({ type: ErrorResDto })
  async remove(
    @CurrentWebUser() user: WebAuthPrincipal,
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
  ): Promise<FavoriteMutationResDto> {
    return this.favorites.remove(user.id, productId);
  }
}
