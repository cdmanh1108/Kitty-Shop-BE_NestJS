import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import { Public } from '@common/decorators/public.decorator';
import { ShopResolver } from '@common/tenant/shop-resolver';
import type { Request } from 'express';
import { WebCatalogService } from '../../application/web-catalog.service';
import {
  WebCategoryDto,
  WebProductDetailDto,
  WebProductListQueryDto,
  WebProductListResDto,
} from './dto/web-catalog.dto';

@ApiTags('Web - Catalog')
@ApiSurface('web')
@Public()
@Controller('web')
export class WebCatalogController {
  constructor(
    private readonly shopResolver: ShopResolver,
    private readonly catalogService: WebCatalogService,
  ) {}

  @Get('categories')
  @ApiOperation({ summary: 'Danh sách danh mục sản phẩm cho storefront' })
  @ApiOkResponse({ type: [WebCategoryDto] })
  async listCategories(@Req() request: Request): Promise<WebCategoryDto[]> {
    const shopId = await this.shopResolver.resolveShopId(request);
    const categories = await this.catalogService.listCategories(shopId);
    return categories.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      slug: c.slug,
      description: c.description ?? undefined,
    }));
  }

  @Get('products')
  @ApiOperation({ summary: 'Danh sách sản phẩm công khai cho storefront có phân trang' })
  @ApiOkResponse({ type: WebProductListResDto })
  async listProducts(
    @Req() request: Request,
    @Query() query: WebProductListQueryDto,
  ): Promise<WebProductListResDto> {
    const shopId = await this.shopResolver.resolveShopId(request);
    return this.catalogService.listProducts(shopId, query);
  }

  @Get('products/:slug')
  @ApiOperation({ summary: 'Chi tiết sản phẩm cho trang chi tiết storefront' })
  @ApiOkResponse({ type: WebProductDetailDto })
  async getProduct(
    @Req() request: Request,
    @Param('slug') slug: string,
  ): Promise<WebProductDetailDto> {
    const shopId = await this.shopResolver.resolveShopId(request);
    const product = await this.catalogService.getProduct(shopId, slug);
    return {
      ...product,
      description: product.description ?? undefined,
      facebookPostUrl: product.facebookPostUrl ?? undefined,
      variants: product.variants.map((v) => ({
        id: v.id,
        code: v.code,
        size: v.size ?? undefined,
        color: v.color ?? undefined,
        depositAmount: v.depositAmount,
      })),
    };
  }
}
