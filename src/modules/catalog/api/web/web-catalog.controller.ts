import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { Public } from '@common/decorators/public.decorator';
import { ErrorResDto } from '@common/dto/response.dto';
import { ShopResolver } from '@common/tenant/shop-resolver';
import type { Request } from 'express';
import { WebCatalogService } from '../../application/web-catalog.service';
import { WebCatalogMapper } from './web-catalog.mapper';
import {
  WebCategoryDto,
  WebProductDetailDto,
  WebProductListQueryDto,
  WebProductListResDto,
  WebResolvedStorefrontSelectionDto,
  WebSelectionRequiredStorefrontSelectionDto,
  WebStorefrontSelectionResolveReqDto,
  WebStorefrontSelectionResolveResDto,
  WebUnavailableStorefrontSelectionDto,
} from './dto/web-catalog.dto';

@ApiTags('Web - Catalog')
@ApiSurface('web')
@Public()
@ApiExtraModels(
  WebResolvedStorefrontSelectionDto,
  WebSelectionRequiredStorefrontSelectionDto,
  WebUnavailableStorefrontSelectionDto,
)
@Controller('web')
export class WebCatalogController {
  constructor(
    private readonly shopResolver: ShopResolver,
    private readonly catalogService: WebCatalogService,
  ) {}

  @Get('categories')
  @ApiOperation({
    operationId: 'getWebCategories',
    summary: 'Danh sách danh mục sản phẩm cho storefront',
  })
  @ApiOkResponse({ type: [WebCategoryDto], description: 'Danh sách danh mục sản phẩm công khai' })
  async listCategories(@Req() request: Request): Promise<WebCategoryDto[]> {
    const shopId = await this.shopResolver.resolveShopId(request);
    const categories = await this.catalogService.listCategories(shopId);
    return WebCatalogMapper.toCategoryList(categories);
  }

  @Get('products')
  @ApiOperation({
    operationId: 'getWebProducts',
    summary: 'Danh sách sản phẩm công khai cho storefront có phân trang',
  })
  @ApiOkResponse({
    type: WebProductListResDto,
    description: 'Danh sách sản phẩm kèm siêu dữ liệu phân trang',
  })
  @ApiBadRequestResponse({
    type: ErrorResDto,
    description: 'Tham số bộ lọc hoặc phân trang không hợp lệ',
  })
  async listProducts(
    @Req() request: Request,
    @Query() query: WebProductListQueryDto,
  ): Promise<WebProductListResDto> {
    const shopId = await this.shopResolver.resolveShopId(request);
    const result = await this.catalogService.listProducts(shopId, query);
    return WebCatalogMapper.toProductListResponse(result);
  }

  @Post('products/resolve')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'resolveWebStorefrontSelections',
    summary: 'Resolve batch các dòng giỏ storefront theo product/variant đã chọn',
  })
  @ApiOkResponse({
    type: WebStorefrontSelectionResolveResDto,
    description:
      'Mỗi input hợp lệ có một result cùng index; metadata chỉ có với sản phẩm public eligible.',
  })
  @ApiBadRequestResponse({
    type: ErrorResDto,
    description: 'Body selection không hợp lệ hoặc vượt giới hạn batch.',
  })
  async resolveSelections(
    @Req() request: Request,
    @Body() body: WebStorefrontSelectionResolveReqDto,
  ): Promise<WebStorefrontSelectionResolveResDto> {
    const shopId = await this.shopResolver.resolveShopId(request);
    const items = await this.catalogService.resolveSelections(shopId, body.items);
    return WebCatalogMapper.toSelectionResolution(items);
  }

  @Get('products/:slug')
  @ApiOperation({
    operationId: 'getWebProductBySlug',
    summary: 'Chi tiết sản phẩm cho trang chi tiết storefront',
  })
  @ApiOkResponse({
    type: WebProductDetailDto,
    description: 'Thông tin chi tiết sản phẩm và các biến thể',
  })
  @ApiNotFoundResponse({
    type: ErrorResDto,
    description: 'Không tìm thấy sản phẩm với slug tương ứng',
  })
  async getProduct(
    @Req() request: Request,
    @Param('slug') slug: string,
  ): Promise<WebProductDetailDto> {
    const shopId = await this.shopResolver.resolveShopId(request);
    const product = await this.catalogService.getProduct(shopId, slug);
    return WebCatalogMapper.toProductDetail(product);
  }
}
