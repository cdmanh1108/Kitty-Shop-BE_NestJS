import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
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
import { ShopResolver } from '@common/shop-context/shop-resolver';
import { WebCatalogService } from '../../application/web-catalog.service';
import { WebCatalogMapper } from './web-catalog.mapper';
import { WebCatalogFiltersQueryDto, WebCatalogFiltersResDto } from './dto/web-catalog-filters.dto';
import {
  WebCategoryDto,
  WebProductDetailDto,
  WebProductListQueryDto,
  WebProductListResDto,
} from './dto/web-product.dto';
import {
  WebResolvedStorefrontSelectionDto,
  WebSelectionRequiredStorefrontSelectionDto,
  WebStorefrontSelectionResolveReqDto,
  WebStorefrontSelectionResolveResDto,
  WebUnavailableStorefrontSelectionDto,
} from './dto/web-storefront-selection.dto';

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
  async listCategories(): Promise<WebCategoryDto[]> {
    const shopId = await this.shopResolver.resolveShopId();
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
  async listProducts(@Query() query: WebProductListQueryDto): Promise<WebProductListResDto> {
    const shopId = await this.shopResolver.resolveShopId();
    const result = await this.catalogService.listProducts(shopId, query);
    return WebCatalogMapper.toProductListResponse(result);
  }

  @Get('products/latest')
  @ApiOperation({
    operationId: 'getWebLatestProducts',
    summary: 'Tối đa 8 sản phẩm mới nhất không cho phép thuê kèm miễn phí',
    description:
      'Dành cho bộ sưu tập trang chủ. Chỉ lấy sản phẩm công khai, đang hoạt động, cho thuê và có allowFreeAccessory=false; sắp xếp ngày tạo giảm dần. Không nhận bộ lọc hoặc phân trang.',
  })
  @ApiOkResponse({
    type: WebProductListResDto,
    description: 'Tối đa 8 sản phẩm mới nhất; metadata cố định trang 1 và giới hạn 8.',
  })
  async listLatestProducts(): Promise<WebProductListResDto> {
    const shopId = await this.shopResolver.resolveShopId();
    const result = await this.catalogService.listLatestProducts(shopId);
    return WebCatalogMapper.toProductListResponse(result);
  }

  @Get('catalog/filters')
  @ApiOperation({
    operationId: 'getWebCatalogFilters',
    summary: 'Lựa chọn kích thước và màu cho bộ lọc storefront',
  })
  @ApiOkResponse({
    type: WebCatalogFiltersResDto,
    description: 'Lựa chọn đầy đủ theo danh mục, độc lập với trang sản phẩm',
  })
  @ApiBadRequestResponse({ type: ErrorResDto, description: 'Danh mục lọc không hợp lệ' })
  async listFilters(@Query() query: WebCatalogFiltersQueryDto): Promise<WebCatalogFiltersResDto> {
    const shopId = await this.shopResolver.resolveShopId();
    const filters = await this.catalogService.listFilters(shopId, {
      category: query.category,
      allowFreeAccessory: query.allowFreeAccessory,
    });
    return WebCatalogMapper.toFilters(filters);
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
    description: 'Phần dữ liệu lựa chọn không hợp lệ hoặc vượt quá giới hạn theo lô.',
  })
  async resolveSelections(
    @Body() body: WebStorefrontSelectionResolveReqDto,
  ): Promise<WebStorefrontSelectionResolveResDto> {
    const shopId = await this.shopResolver.resolveShopId();
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
  async getProduct(@Param('slug') slug: string): Promise<WebProductDetailDto> {
    const shopId = await this.shopResolver.resolveShopId();
    const product = await this.catalogService.getProduct(shopId, slug);
    return WebCatalogMapper.toProductDetail(product);
  }
}
