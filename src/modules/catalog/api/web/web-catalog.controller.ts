import { Controller, Get, NotFoundException, Param, Query, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { ShopResolver } from '@common/tenant/shop-resolver';
import { PrismaService } from '@database/prisma/prisma.service';
import type { Request } from 'express';
import {
  WebCategoryDto,
  WebProductDetailDto,
  WebProductListItemDto,
  WebProductListQueryDto,
} from './dto/web-catalog.dto';
import { toWebCategory, toWebProductDetail, toWebProductListItem } from './web-catalog.mapper';

@ApiTags('Web - Catalog')
@Public()
@Controller('web')
export class WebCatalogController {
  constructor(
    private readonly shopResolver: ShopResolver,
    private readonly prisma: PrismaService,
  ) {}

  @Get('categories')
  @ApiOperation({ summary: 'Danh sách danh mục sản phẩm cho storefront' })
  @ApiOkResponse({ type: [WebCategoryDto] })
  async listCategories(@Req() request: Request): Promise<WebCategoryDto[]> {
    const shopId = await this.shopResolver.resolveShopId(request);
    const categories = await this.prisma.category.findMany({
      where: {
        shopId,
        isActive: true,
      },
      orderBy: {
        sortOrder: 'asc',
      },
    });

    return categories.map(toWebCategory);
  }

  @Get('products')
  @ApiOperation({ summary: 'Danh sách sản phẩm công khai cho storefront' })
  @ApiOkResponse({ type: [WebProductListItemDto] })
  async listProducts(
    @Req() request: Request,
    @Query() query: WebProductListQueryDto,
  ): Promise<WebProductListItemDto[]> {
    const shopId = await this.shopResolver.resolveShopId(request);

    // Build filter criteria
    const where: NonNullable<Parameters<typeof this.prisma.product.findMany>[0]>['where'] = {
      shopId,
      archivedAt: null,
      status: { in: ['ACTIVE', 'AVAILABLE'] },
      isRentable: true,
    };

    if (query.category) {
      where.category = {
        OR: [
          { id: query.category },
          { code: query.category.toUpperCase() },
        ],
      };
    }

    if (query.q?.trim()) {
      const search = query.q.trim().toLowerCase();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.size) {
      where.variants = {
        some: {
          archivedAt: null,
          size: { name: { equals: query.size, mode: 'insensitive' } },
        },
      };
    }

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 50));
    const skip = (page - 1) * limit;

    const products = await this.prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        category: { select: { id: true, code: true, name: true } },
        media: { orderBy: { sortOrder: 'asc' } },
        rentalRates: { where: { isActive: true }, orderBy: { durationDays: 'asc' } },
        variants: {
          where: { archivedAt: null },
          include: {
            size: { select: { name: true } },
            color: { select: { name: true, hexColor: true } },
            rentalRates: { where: { isActive: true }, orderBy: { durationDays: 'asc' } },
          },
        },
      },
    });

    const items = products.map(toWebProductListItem);

    // In-memory sorting if requested
    if (query.sort === 'price-asc') {
      items.sort((a, b) => (a.rentalPrices[0]?.amount ?? 0) - (b.rentalPrices[0]?.amount ?? 0));
    } else if (query.sort === 'price-desc') {
      items.sort((a, b) => (b.rentalPrices[0]?.amount ?? 0) - (a.rentalPrices[0]?.amount ?? 0));
    } else if (query.sort === 'name') {
      items.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    }

    return items;
  }

  @Get('products/:slug')
  @ApiOperation({ summary: 'Chi tiết sản phẩm cho trang chi tiết storefront' })
  @ApiOkResponse({ type: WebProductDetailDto })
  async getProduct(
    @Req() request: Request,
    @Param('slug') slug: string,
  ): Promise<WebProductDetailDto> {
    const shopId = await this.shopResolver.resolveShopId(request);

    // First try by id or slug or code
    const product = await this.prisma.product.findFirst({
      where: {
        shopId,
        archivedAt: null,
        isRentable: true,
        OR: [
          { id: slug },
          { slug },
          { code: slug.toUpperCase() },
        ],
      },
      include: {
        category: { select: { id: true, code: true, name: true } },
        media: { orderBy: { sortOrder: 'asc' } },
        rentalRates: { where: { isActive: true }, orderBy: { durationDays: 'asc' } },
        variants: {
          where: { archivedAt: null },
          include: {
            size: { select: { name: true } },
            color: { select: { name: true, hexColor: true } },
            rentalRates: { where: { isActive: true }, orderBy: { durationDays: 'asc' } },
          },
        },
      },
    });

    if (!product) {
      // Also try matching slugified name if slug column is null
      const allProducts = await this.prisma.product.findMany({
        where: { shopId, archivedAt: null, isRentable: true },
        include: {
          category: { select: { id: true, code: true, name: true } },
          media: { orderBy: { sortOrder: 'asc' } },
          rentalRates: { where: { isActive: true }, orderBy: { durationDays: 'asc' } },
          variants: {
            where: { archivedAt: null },
            include: {
              size: { select: { name: true } },
              color: { select: { name: true, hexColor: true } },
              rentalRates: { where: { isActive: true }, orderBy: { durationDays: 'asc' } },
            },
          },
        },
      });

      const matched = allProducts.find((p) => toWebProductListItem(p).slug === slug);
      if (!matched) {
        throw new NotFoundException('Không tìm thấy sản phẩm.');
      }
      return toWebProductDetail(matched);
    }

    return toWebProductDetail(product);
  }
}
