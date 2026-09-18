import type {
  AddInventoryInput,
  AddVariantInput,
  AvailabilityQuery,
  CreateCategoryInput,
  CategoryListQuery,
  CreateColorInput,
  CreateProductInput,
  CreateSizeInput,
  UpdateCategoryInput,
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
  AddInventoryReqDto,
  AddVariantReqDto,
  AvailabilityQueryDto,
  CreateCategoryReqDto,
  CategoryListQueryDto,
  CreateColorReqDto,
  CreateProductReqDto,
  CreateSizeReqDto,
  UpdateCategoryReqDto,
  InventoryListQueryDto,
  ProductMediaReqDto,
  ProductVariantReqDto,
  RentalRateReqDto,
  UpdateInventoryStatusReqDto,
  UpdateProductReqDto,
  UpsertRentalRateReqDto,
} from './catalog.dto';
import type { ProductListQueryDto } from './admin/dto/product-query.dto';

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
