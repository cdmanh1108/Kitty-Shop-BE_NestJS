import { ProductLookupPageResDto } from '../catalog-read.dto';
import { PERMISSIONS } from '@common/constants/permissions';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import { ApiSurface } from '@common/decorators/api-surface.decorator';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ProductService } from '../../application/product.service';
import {
  AddVariantReqDto,
  CreateProductReqDto,
  ProductMediaReqDto,
  ProductMediaResDto,
  ProductPageResDto,
  ProductResDto,
  ProductVariantResDto,
  RentalRateResDto,
  UpdateProductReqDto,
  UpsertRentalRateReqDto,
} from './dto/product.dto';
import { ProductListQueryDto, ProductLookupQueryDto } from './dto/product-query.dto';
import {
  toAddVariantInput,
  toCreateProductInput,
  toProductListQuery,
  toProductMediaInput,
  toUpdateProductInput,
  toUpsertRentalRateInput,
} from '../catalog.mapper';

@ApiTags('Admin - Catalog')
@ApiSurface('admin')
@ApiBearerAuth('access-token')
@Controller('admin')
export class AdminProductController {
  constructor(private readonly service: ProductService) {}

  @Get('products')
  @Permissions(PERMISSIONS.CATALOG_VIEW)
  @ApiOkResponse({ type: ProductPageResDto })
  listProducts(@CurrentUser() user: CurrentUserType, @Query() query: ProductListQueryDto) {
    return this.service.listProducts(user, toProductListQuery(query));
  }

  @Get('products/lookup')
  @Permissions(PERMISSIONS.CATALOG_VIEW)
  @ApiOkResponse({ type: ProductLookupPageResDto })
  lookupProducts(@CurrentUser() user: CurrentUserType, @Query() query: ProductLookupQueryDto) {
    return this.service.lookupProducts(user, {
      ...toProductListQuery(query),
      productId: query.productId,
    });
  }

  @Get('products/:id')
  @Permissions(PERMISSIONS.CATALOG_VIEW)
  @ApiOkResponse({ type: ProductResDto })
  getProduct(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.getProduct(user, id);
  }

  @Post('products')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  @ApiOperation({
    summary: 'Create product, variants, rates and initial physical inventory atomically',
  })
  @ApiCreatedResponse({ type: ProductResDto })
  createProduct(@CurrentUser() user: CurrentUserType, @Body() body: CreateProductReqDto) {
    return this.service.createProduct(user, toCreateProductInput(body));
  }

  @Post('products/:id/variants')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  @ApiCreatedResponse({ type: ProductVariantResDto })
  addVariant(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: AddVariantReqDto,
  ) {
    return this.service.addVariant(user, id, toAddVariantInput(body));
  }

  @Post('variants/:id/rental-rates')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  @ApiCreatedResponse({ type: RentalRateResDto })
  upsertRentalRate(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: UpsertRentalRateReqDto,
  ) {
    return this.service.upsertRentalRate(user, id, toUpsertRentalRateInput(body));
  }

  @Patch('products/:id')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  @ApiOkResponse({ type: ProductResDto })
  updateProduct(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: UpdateProductReqDto,
  ) {
    return this.service.updateProduct(user, id, toUpdateProductInput(body));
  }

  @Delete('products/:id')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  @ApiOperation({ summary: 'Safely archive a product if it has no active rental orders' })
  archiveProduct(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.archiveProduct(user, id);
  }

  @Post('products/:id/media')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  @ApiCreatedResponse({ type: ProductMediaResDto })
  @ApiOperation({
    summary: 'Add an image to a product; setting primary clears the previous primary image',
  })
  addProductMedia(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: ProductMediaReqDto,
  ) {
    return this.service.addProductMedia(user, id, toProductMediaInput(body));
  }

  @Delete('products/:id/media/:mediaId')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  @ApiOperation({ summary: 'Remove a product image' })
  removeProductMedia(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
  ) {
    return this.service.removeProductMedia(user, id, mediaId);
  }
}
