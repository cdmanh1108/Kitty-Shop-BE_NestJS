import type {
  AddInventoryInput,
  AddVariantInput,
  AvailabilityQuery,
  ColorListQuery,
  CreateCategoryInput,
  CategoryListQuery,
  CreateColorInput,
  CreateProductInput,
  CreateSizeInput,
  UpdateCategoryInput,
  UpdateColorInput,
  InventoryListQuery,
  ProductListQuery,
  ProductMediaInput,
  ProductVariantInput,
  RentalRateInput,
  UpdateInventoryStatusInput,
  UpdateProductInput,
  UpsertRentalRateInput,
} from '../application/catalog.contracts';
import type {
  CreateCategoryReqDto,
  CategoryListQueryDto,
  UpdateCategoryReqDto,
} from './admin/dto/category.dto';
import type { CreateColorReqDto } from './admin/dto/color.dto';
import type { UpdateColorReqDto } from './admin/dto/color.dto';
import type { ColorListQueryDto } from './admin/dto/color-query.dto';
import type { CreateSizeReqDto } from './admin/dto/size.dto';
import type {
  AddVariantReqDto,
  CreateProductReqDto,
  ProductMediaReqDto,
  ProductVariantReqDto,
  RentalRateReqDto,
  UpdateProductReqDto,
  UpsertRentalRateReqDto,
} from './admin/dto/product.dto';
import type {
  AddInventoryReqDto,
  AvailabilityQueryDto,
  InventoryListQueryDto,
  UpdateInventoryStatusReqDto,
} from './admin/dto/inventory.dto';
import type { ProductListQueryDto } from './admin/dto/product-query.dto';
import type { ColorRecord } from '../domain/catalog.records';
import type { ColorManagementItem } from '../domain/catalog.models';

export function toAddInventoryInput(dto: AddInventoryReqDto): AddInventoryInput {
  return { ...dto };
}
export function toAddVariantInput(dto: AddVariantReqDto): AddVariantInput {
  return {
    ...dto,
    rentalRates: Array.isArray(dto.rentalRates)
      ? dto.rentalRates.map(toRentalRateInput)
      : dto.rentalRates,
  };
}
export function toRentalRateInput(dto: RentalRateReqDto): RentalRateInput {
  return { ...dto };
}
export function toAvailabilityQuery(dto: AvailabilityQueryDto): AvailabilityQuery {
  return { ...dto };
}
export function toCreateCategoryInput(dto: CreateCategoryReqDto): CreateCategoryInput {
  return { ...dto };
}
export function toCategoryListQuery(dto: CategoryListQueryDto): CategoryListQuery {
  return { ...dto, search: dto.search?.trim() || undefined };
}
export function toUpdateCategoryInput(dto: UpdateCategoryReqDto): UpdateCategoryInput {
  return { ...dto };
}
export function toCreateColorInput(dto: CreateColorReqDto): CreateColorInput {
  return { ...dto };
}
export function toColorListQuery(dto: ColorListQueryDto): ColorListQuery {
  return { ...dto };
}
export function toUpdateColorInput(dto: UpdateColorReqDto): UpdateColorInput {
  return { ...dto };
}
export function toColorResponse(color: ColorRecord): ColorManagementItem {
  return {
    id: color.id,
    code: color.code,
    name: color.name,
    hexColor: color.hexColor,
    isActive: color.isActive,
    createdAt: color.createdAt,
    updatedAt: color.updatedAt,
  };
}
export function toCreateProductInput(dto: CreateProductReqDto): CreateProductInput {
  return {
    ...dto,
    variants: Array.isArray(dto.variants) ? dto.variants.map(toProductVariantInput) : dto.variants,
    media: Array.isArray(dto.media) ? dto.media.map(toProductMediaInput) : dto.media,
  };
}
export function toProductVariantInput(dto: ProductVariantReqDto): ProductVariantInput {
  return {
    ...dto,
    rentalRates: Array.isArray(dto.rentalRates)
      ? dto.rentalRates.map(toRentalRateInput)
      : dto.rentalRates,
  };
}
export function toProductMediaInput(dto: ProductMediaReqDto): ProductMediaInput {
  return { ...dto };
}
export function toCreateSizeInput(dto: CreateSizeReqDto): CreateSizeInput {
  return { ...dto };
}
export function toInventoryListQuery(dto: InventoryListQueryDto): InventoryListQuery {
  return { ...dto };
}
export function toProductListQuery(dto: ProductListQueryDto): ProductListQuery {
  return { ...dto };
}
export function toUpdateInventoryStatusInput(
  dto: UpdateInventoryStatusReqDto,
): UpdateInventoryStatusInput {
  return { ...dto };
}
export function toUpdateProductInput(dto: UpdateProductReqDto): UpdateProductInput {
  return { ...dto };
}
export function toUpsertRentalRateInput(dto: UpsertRentalRateReqDto): UpsertRentalRateInput {
  return { ...dto };
}
