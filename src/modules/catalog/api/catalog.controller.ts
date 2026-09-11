import { PERMISSIONS } from '@common/constants/permissions';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Permissions } from '@common/decorators/permissions.decorator';
import type { CurrentUser as CurrentUserType } from '@common/types/current-user';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CatalogService } from '../application/catalog.service';
import {
  AddInventoryReqDto,
  AddVariantReqDto,
  AvailabilityQueryDto,
  CatalogLookupsResDto,
  CreateCategoryReqDto,
  CreateColorReqDto,
  CreateProductReqDto,
  CreateSizeReqDto,
  InventoryItemResDto,
  InventoryListQueryDto,
  InventoryPageResDto,
  ProductListQueryDto,
  ProductMediaReqDto,
  ProductPageResDto,
  ProductResDto,
  UpdateInventoryStatusReqDto,
  UpdateProductReqDto,
  UpsertRentalRateReqDto,
} from './catalog.dto';
import {
  toAddInventoryInput,
  toAddVariantInput,
  toAvailabilityQuery,
  toCreateCategoryInput,
  toCreateColorInput,
  toCreateProductInput,
  toCreateSizeInput,
  toInventoryListQuery,
  toProductListQuery,
  toProductMediaInput,
  toUpdateInventoryStatusInput,
  toUpdateProductInput,
  toUpsertRentalRateInput,
} from './catalog.mapper';

@ApiTags('Catalog')
@ApiBearerAuth('access-token')
@Controller()
export class CatalogController {
  constructor(private readonly service: CatalogService) {}

  @Get('catalog/lookups')
  @Permissions(PERMISSIONS.CATALOG_VIEW)
  @ApiOperation({ summary: 'Categories, sizes, colors and locations for admin forms' })
  @ApiOkResponse({ type: CatalogLookupsResDto })
  lookups(@CurrentUser() user: CurrentUserType) {
    return this.service.lookups(user);
  }

  @Post('catalog/categories')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  createCategory(@CurrentUser() user: CurrentUserType, @Body() body: CreateCategoryReqDto) {
    return this.service.createCategory(user, toCreateCategoryInput(body));
  }

  @Post('catalog/sizes')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  createSize(@CurrentUser() user: CurrentUserType, @Body() body: CreateSizeReqDto) {
    return this.service.createSize(user, toCreateSizeInput(body));
  }

  @Post('catalog/colors')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  createColor(@CurrentUser() user: CurrentUserType, @Body() body: CreateColorReqDto) {
    return this.service.createColor(user, toCreateColorInput(body));
  }

  @Get('products')
  @Permissions(PERMISSIONS.CATALOG_VIEW)
  @ApiOkResponse({ type: ProductPageResDto })
  listProducts(@CurrentUser() user: CurrentUserType, @Query() query: ProductListQueryDto) {
    return this.service.listProducts(user, toProductListQuery(query));
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
  addVariant(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: AddVariantReqDto,
  ) {
    return this.service.addVariant(user, id, toAddVariantInput(body));
  }

  @Post('variants/:id/rental-rates')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  upsertRentalRate(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: UpsertRentalRateReqDto,
  ) {
    return this.service.upsertRentalRate(user, id, toUpsertRentalRateInput(body));
  }

  @Patch('products/:id')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
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

  @Get('inventory')
  @Permissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiOkResponse({ type: InventoryPageResDto })
  listInventory(@CurrentUser() user: CurrentUserType, @Query() query: InventoryListQueryDto) {
    return this.service.listInventory(user, toInventoryListQuery(query));
  }

  @Get('inventory/:id')
  @Permissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiOperation({
    summary:
      'Physical inventory detail with status history, service history and upcoming allocations',
  })
  @ApiOkResponse({ type: InventoryItemResDto })
  getInventory(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.service.getInventory(user, id);
  }

  @Post('products/:id/media')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
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

  @Post('inventory')
  @Permissions(PERMISSIONS.INVENTORY_MANAGE)
  @ApiCreatedResponse({ type: InventoryItemResDto })
  addInventory(@CurrentUser() user: CurrentUserType, @Body() body: AddInventoryReqDto) {
    return this.service.addInventory(user, toAddInventoryInput(body));
  }

  @Patch('inventory/:id/status')
  @Permissions(PERMISSIONS.INVENTORY_MANAGE)
  @ApiOkResponse({ type: InventoryItemResDto })
  updateInventoryStatus(
    @CurrentUser() user: CurrentUserType,
    @Param('id') id: string,
    @Body() body: UpdateInventoryStatusReqDto,
  ) {
    return this.service.updateInventoryStatus(user, id, toUpdateInventoryStatusInput(body));
  }

  @Get('inventory/availability/search')
  @Permissions(PERMISSIONS.INVENTORY_VIEW)
  @ApiOperation({
    summary: 'Find physical items not allocated in a half-open [from, until) interval',
  })
  @ApiOkResponse({ type: [InventoryItemResDto] })
  availability(@CurrentUser() user: CurrentUserType, @Query() query: AvailabilityQueryDto) {
    return this.service.availability(user, toAvailabilityQuery(query));
  }
}
