import type { ProductLookupPage } from './catalog.read-models';
import type {
  AddProductMediaResult,
  AddVariantResult,
  CreateProductResult,
  ProductDetails,
  ProductPage,
  UpdateProductResult,
  UpsertRentalRateResult,
} from './catalog.models';
import type {
  CatalogListProductsCriteria,
  CreateProductData,
  ProductMediaData,
  UpdateProductData,
} from './catalog.repository';

export const CATALOG_PRODUCT_REPOSITORY = Symbol('CATALOG_PRODUCT_REPOSITORY');

/** Admin product reads and transactional product/variant/rate writes. */
export interface CatalogProductRepository {
  lookupProducts(
    input: CatalogListProductsCriteria & { productId?: string },
  ): Promise<ProductLookupPage>;
  listProducts(input: CatalogListProductsCriteria): Promise<ProductPage>;
  findProduct(shopId: string, id: string): Promise<ProductDetails>;
  createProduct(shopId: string, input: CreateProductData): Promise<CreateProductResult>;
  addVariant(
    shopId: string,
    productId: string,
    input: CreateProductData['variants'][number],
  ): Promise<AddVariantResult>;
  upsertRentalRate(
    shopId: string,
    variantId: string,
    input: { durationDays: number; price: number },
  ): Promise<UpsertRentalRateResult>;
  updateProduct(shopId: string, id: string, input: UpdateProductData): Promise<UpdateProductResult>;
  archiveProduct(shopId: string, id: string): Promise<boolean>;
  addProductMedia(
    shopId: string,
    productId: string,
    input: ProductMediaData,
  ): Promise<AddProductMediaResult>;
  removeProductMedia(shopId: string, productId: string, mediaId: string): Promise<boolean>;
}
