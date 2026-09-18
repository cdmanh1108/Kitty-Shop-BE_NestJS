import * as fs from 'fs';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { generateProductSlug } from '@modules/catalog/domain/product-slug';
import { AUDIT_PORT, type AuditPort } from '@modules/audit/domain/audit.port';
import { normalizeToCode, parseLegacyBoolean } from './legacy-catalog.normalizer';
import { parseLegacyColors } from './legacy-color.parser';
import {
  mapLegacyProductRow,
  type MasterLookups,
  type PlannedProduct,
} from './legacy-catalog.mapper';
import { validateLegacyRows } from './legacy-catalog.validator';
import { parseLegacyWorkbook, type ParsedLegacyWorkbook } from './legacy-xlsx.parser';
import type {
  EntityMutationSummary,
  InventoryReconciliation,
  LegacyImportOptions,
  LegacyImportReport,
  ReconciliationMetrics,
  UnallocatedInventoryItem,
} from './legacy-catalog-import.types';

@Injectable()
export class LegacyCatalogImportService {
  private readonly logger = new Logger(LegacyCatalogImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
  ) {}

  async execute(options: LegacyImportOptions): Promise<LegacyImportReport> {
    const startTime = Date.now();
    const isApply = Boolean(options.apply && !options.dryRun);
    const mode: 'DRY_RUN' | 'APPLY' = isApply ? 'APPLY' : 'DRY_RUN';

    // 1. Validate File Path
    if (!fs.existsSync(options.filePath)) {
      throw new Error(`Không tìm thấy tệp Excel dữ liệu cũ tại: "${options.filePath}".`);
    }

    // 2. Resolve Shop
    const shop = await this.prisma.shop.findUnique({
      where: { code: options.shopCode },
    });
    if (!shop) {
      throw new Error(
        `Không tìm thấy cửa hàng có mã "${options.shopCode}" trong cơ sở dữ liệu. Vui lòng khởi tạo dữ liệu trước.`,
      );
    }

    // 3. Parse Workbook
    const workbook: ParsedLegacyWorkbook = parseLegacyWorkbook(options.filePath);

    // 4. Validate Rows
    const validation = validateLegacyRows(workbook.products, workbook.categories);

    // 5. Source Reconciliation Metrics
    const reconciliation = this.computeReconciliationMetrics(workbook);

    // 6. Resolve Master Data Lookups
    const lookups = await this.resolveMasterLookups(shop.id, workbook, isApply);

    // 7. Plan Product Aggregates
    const plannedProducts: PlannedProduct[] = [];
    for (const p of workbook.products) {
      const planned = mapLegacyProductRow(p, lookups.masterLookups);
      plannedProducts.push(planned);
    }

    // 8. Compute Inventory Reconciliation
    const inventory = this.computeInventoryReconciliation(
      reconciliation.legacyQuantitySum,
      plannedProducts,
    );

    // 9. Evaluate Mutations & Conflict / Idempotency Check
    const mutations: EntityMutationSummary = {
      categoriesCreated: lookups.createdCategoriesCount,
      categoriesExisting: lookups.existingCategoriesCount,
      sizesCreated: lookups.createdSizesCount,
      sizesExisting: lookups.existingSizesCount,
      colorsCreated: lookups.createdColorsCount,
      colorsExisting: lookups.existingColorsCount,
      productsCreated: 0,
      productsUnchanged: 0,
      productsConflicted: 0,
      variantsCreated: 0,
      variantsUnchanged: 0,
      inventoryItemsCreated: 0,
      inventoryItemsUnchanged: 0,
      rentalRatesCreated: 0,
      rentalRatesUnchanged: 0,
      mediaCreated: 0,
      mediaUnchanged: 0,
    };

    // Query existing products for this shop
    const productCodes = plannedProducts.map((p) => p.code);
    const existingProducts = await this.prisma.product.findMany({
      where: { shopId: shop.id, code: { in: productCodes } },
      include: {
        variants: {
          include: {
            inventoryItems: true,
            rentalRates: true,
          },
        },
        media: true,
      },
    });
    const existingProductByCode = new Map(existingProducts.map((p) => [p.code, p]));

    // Check conflicts and count planned vs unchanged
    for (const planned of plannedProducts) {
      const existing = existingProductByCode.get(planned.code);
      if (existing) {
        // Product already exists: Check conflict or unchanged
        if (existing.name.trim() !== planned.name.trim()) {
          mutations.productsConflicted++;
          validation.issues.push({
            severity: 'WARNING',
            code: 'EXISTING_PRODUCT_CONFLICT',
            sheet: 'Sản phẩm',
            row: planned.sourceRow,
            productCode: planned.code,
            field: 'Tên sản phẩm',
            rawValue: existing.name,
            message: `Sản phẩm trong cơ sở dữ liệu có tên "${existing.name}", khác với tên "${planned.name}" trong Excel. Bỏ qua ghi đè.`,
          });
        } else {
          mutations.productsUnchanged++;
        }

        // Check variants
        const existingVariantByCode = new Map(existing.variants.map((v) => [v.variantCode, v]));

        for (const pv of planned.variants) {
          const ev = existingVariantByCode.get(pv.variantCode);
          if (ev) {
            mutations.variantsUnchanged++;
            // Rental rates
            mutations.rentalRatesUnchanged += pv.rentalRates.length;
            // Inventory items
            const existingSkus = new Set(ev.inventoryItems.map((i) => i.sku));
            for (const pi of pv.inventoryItems) {
              if (existingSkus.has(pi.sku)) {
                mutations.inventoryItemsUnchanged++;
              } else {
                mutations.inventoryItemsCreated++;
              }
            }
          } else {
            mutations.variantsCreated++;
            mutations.rentalRatesCreated += pv.rentalRates.length;
            mutations.inventoryItemsCreated += pv.inventoryItems.length;
          }
        }

        // Media
        if (existing.media.length > 0) {
          mutations.mediaUnchanged += planned.media.length;
        } else {
          mutations.mediaCreated += planned.media.length;
        }
      } else {
        // Completely new product
        mutations.productsCreated++;
        mutations.variantsCreated += planned.variants.length;
        mutations.rentalRatesCreated += planned.variants.reduce(
          (acc, v) => acc + v.rentalRates.length,
          0,
        );
        mutations.inventoryItemsCreated += planned.allocatedInventoryCount;
        mutations.mediaCreated += planned.media.length;
      }
    }

    // 10. Execute Database Mutations if APPLY mode and no fatal validation errors
    if (isApply && validation.isValid) {
      await this.persistImport(shop.id, plannedProducts, existingProductByCode);

      // Record Audit Log
      await this.audit.log({
        shopId: shop.id,
        action: 'LEGACY_IMPORT',
        entityType: 'catalog',
        entityId: undefined,
        newValues: {
          productsImported: mutations.productsCreated,
          productsUnchanged: mutations.productsUnchanged,
          variantsCreated: mutations.variantsCreated,
          inventoryItemsCreated: mutations.inventoryItemsCreated,
        },
      });
    }

    const durationMs = Date.now() - startTime;
    return {
      shopId: shop.id,
      shopCode: shop.code,
      mode,
      filePath: options.filePath,
      reconciliation,
      inventory,
      mutations,
      validation,
      issues: validation.issues,
      durationMs,
      success: validation.isValid,
    };
  }

  /**
   * Resolves existing and missing Master Data (Categories, Sizes, Colors).
   * In APPLY mode, inserts any newly discovered master entities into the database.
   */
  private async resolveMasterLookups(
    shopId: string,
    workbook: ParsedLegacyWorkbook,
    isApply: boolean,
  ): Promise<{
    masterLookups: MasterLookups;
    createdCategoriesCount: number;
    existingCategoriesCount: number;
    createdSizesCount: number;
    existingSizesCount: number;
    createdColorsCount: number;
    existingColorsCount: number;
  }> {
    // 1. Categories
    const existingCategories = await this.prisma.category.findMany({ where: { shopId } });
    const catByName = new Map<string, { id: string; code: string; name: string }>();
    for (const c of existingCategories) {
      catByName.set(c.name.trim().toLowerCase(), { id: c.id, code: c.code, name: c.name });
    }

    let createdCategoriesCount = 0;
    const categoryNamesToEnsure = new Set<string>();

    // From Danh mục sheet
    for (const c of workbook.categories) {
      categoryNamesToEnsure.add(c.name);
    }
    // From Sản phẩm sheet (e.g. "Đầm")
    for (const p of workbook.products) {
      if (p.productGroup) {
        categoryNamesToEnsure.add(p.productGroup);
      }
    }

    for (const catName of categoryNamesToEnsure) {
      const key = catName.trim().toLowerCase();
      if (!catByName.has(key)) {
        const code = normalizeToCode(catName);
        if (isApply) {
          const created = await this.prisma.category.upsert({
            where: { shopId_code: { shopId, code } },
            update: { name: catName, isActive: true },
            create: { shopId, code, name: catName, isActive: true },
          });
          catByName.set(key, { id: created.id, code: created.code, name: created.name });
        } else {
          catByName.set(key, { id: `dry-run-cat-${code}`, code, name: catName });
        }
        createdCategoriesCount++;
      }
    }

    // 2. Sizes
    const existingSizes = await this.prisma.size.findMany({ where: { shopId } });
    const sizeByName = new Map<string, { id: string; code: string; name: string }>();
    for (const s of existingSizes) {
      sizeByName.set(s.name.trim().toLowerCase(), { id: s.id, code: s.code, name: s.name });
      sizeByName.set(s.code.trim().toLowerCase(), { id: s.id, code: s.code, name: s.name });
    }

    let createdSizesCount = 0;
    let sizeSortOrder = (existingSizes.length + 1) * 10;

    for (const s of workbook.sizes) {
      const key = s.name.trim().toLowerCase();
      const code = normalizeToCode(s.name);
      if (!sizeByName.has(key) && !sizeByName.has(code.toLowerCase())) {
        if (isApply) {
          const created = await this.prisma.size.upsert({
            where: { shopId_code: { shopId, code } },
            update: { name: s.name },
            create: { shopId, code, name: s.name, sortOrder: sizeSortOrder },
          });
          sizeByName.set(key, { id: created.id, code: created.code, name: created.name });
        } else {
          sizeByName.set(key, { id: `dry-run-size-${code}`, code, name: s.name });
        }
        sizeSortOrder += 10;
        createdSizesCount++;
      }
    }

    // 3. Colors
    const existingColors = await this.prisma.color.findMany({ where: { shopId } });
    const colorByCode = new Map<string, { id: string; code: string; name: string }>();
    for (const c of existingColors) {
      colorByCode.set(c.code, { id: c.id, code: c.code, name: c.name });
    }

    let createdColorsCount = 0;
    const colorsToEnsure = new Map<string, string>(); // code -> display name

    for (const p of workbook.products) {
      const colorResult = parseLegacyColors(p.rawColor);
      if (colorResult.valid && colorResult.colors.length > 0) {
        for (const c of colorResult.colors) {
          if (!colorsToEnsure.has(c.code)) {
            colorsToEnsure.set(c.code, c.name);
          }
        }
      }
    }

    for (const [code, name] of colorsToEnsure.entries()) {
      if (!colorByCode.has(code)) {
        if (isApply) {
          const created = await this.prisma.color.upsert({
            where: { shopId_code: { shopId, code } },
            update: { name },
            create: { shopId, code, name },
          });
          colorByCode.set(code, { id: created.id, code: created.code, name: created.name });
        } else {
          colorByCode.set(code, { id: `dry-run-color-${code}`, code, name });
        }
        createdColorsCount++;
      }
    }

    return {
      masterLookups: {
        categoryByName: catByName,
        sizeByName,
        colorByCode,
      },
      createdCategoriesCount,
      existingCategoriesCount: existingCategories.length,
      createdSizesCount,
      existingSizesCount: existingSizes.length,
      createdColorsCount,
      existingColorsCount: existingColors.length,
    };
  }

  /**
   * Persists planned products, variants, rental rates, media, and inventory items atomically per product aggregate.
   */
  private async persistImport(
    shopId: string,
    plannedProducts: PlannedProduct[],
    existingProducts: Map<
      string,
      {
        id: string;
        code: string;
        name: string;
        variants: Array<{
          id: string;
          variantCode: string;
          inventoryItems: Array<{ id: string; sku: string }>;
          rentalRates: Array<{ id: string; durationDays: number }>;
        }>;
        media: Array<{ id: string; isPrimary: boolean }>;
      }
    >,
  ): Promise<void> {
    for (const planned of plannedProducts) {
      await this.prisma.$transaction(async (tx) => {
        let productId: string;
        const existing = existingProducts.get(planned.code);

        if (existing) {
          productId = existing.id;
          // Product already exists: Non-destructive, preserve existing record
        } else {
          // Create Product
          const createdProduct = await tx.product.create({
            data: {
              shopId,
              categoryId: planned.categoryId,
              code: planned.code,
              name: planned.name,
              slug: generateProductSlug(planned.name, planned.code),
              description: planned.description,
              defaultDepositAmount: planned.defaultDepositAmount,
              currency: planned.currency,
              status: planned.status,
              isRentable: planned.isRentable,
              isPublic: planned.isPublic,
              metadata: planned.metadata as never,
            },
          });
          productId = createdProduct.id;
        }

        // Upsert Variants
        const existingVariantMap = new Map(
          (existing?.variants ?? []).map((v) => [v.variantCode, v]),
        );

        for (const pv of planned.variants) {
          let variantId: string;
          const ev = existingVariantMap.get(pv.variantCode);

          if (ev) {
            variantId = ev.id;
          } else {
            const createdVariant = await tx.productVariant.create({
              data: {
                shopId,
                productId,
                variantCode: pv.variantCode,
                sizeId: pv.sizeId,
                colorId: pv.colorId,
                depositAmountOverride: pv.depositAmountOverride,
                status: 'ACTIVE',
              },
            });
            variantId = createdVariant.id;
          }

          // Rental Rates
          const existingRateDurations = new Set((ev?.rentalRates ?? []).map((r) => r.durationDays));
          for (const rate of pv.rentalRates) {
            if (!existingRateDurations.has(rate.durationDays)) {
              await tx.rentalRate.create({
                data: {
                  shopId,
                  productId,
                  variantId,
                  durationDays: rate.durationDays,
                  price: rate.price,
                  currency: rate.currency,
                  isActive: true,
                },
              });
            }
          }

          // Inventory Items
          const existingSkus = new Set((ev?.inventoryItems ?? []).map((i) => i.sku));
          for (const item of pv.inventoryItems) {
            if (!existingSkus.has(item.sku)) {
              await tx.inventoryItem.create({
                data: {
                  shopId,
                  variantId,
                  sku: item.sku,
                  currentStatus: item.currentStatus,
                  condition: item.condition,
                  notes: item.notes,
                },
              });
            }
          }
        }

        // Media
        if (!existing || existing.media.length === 0) {
          for (const m of planned.media) {
            await tx.productMedia.create({
              data: {
                shopId,
                productId,
                url: m.url,
                altText: m.altText,
                isPrimary: m.isPrimary,
                sortOrder: m.sortOrder,
                mediaType: 'IMAGE',
                metadata: m.metadata as never,
              },
            });
          }
        }
      });
    }
  }

  private computeReconciliationMetrics(workbook: ParsedLegacyWorkbook): ReconciliationMetrics {
    const products = workbook.products;
    const uniqueCodes = new Set(products.map((p) => p.productCode)).size;

    let totalQuantity = 0;
    let price50k = 0;
    let price30k = 0;
    let otherPrice = 0;
    let deposit200k = 0;
    let deposit0 = 0;
    let otherDeposit = 0;
    let withImageUrl = 0;
    let active = 0;

    for (const p of products) {
      if (p.quantity !== null && p.quantity !== undefined) {
        totalQuantity += p.quantity;
      }
      if (p.rentalPrice === 50000) {
        price50k++;
      } else if (p.rentalPrice === 30000) {
        price30k++;
      } else {
        otherPrice++;
      }

      if (p.depositAmount === 200000) {
        deposit200k++;
      } else if (p.depositAmount === 0) {
        deposit0++;
      } else {
        otherDeposit++;
      }

      if (p.imageUrl && p.imageUrl.startsWith('http')) {
        withImageUrl++;
      }

      const activeBool = parseLegacyBoolean(p.rawActive);
      if (activeBool === true) {
        active++;
      }
    }

    return {
      totalProductRows: products.length,
      uniqueProductCodes: uniqueCodes,
      legacyQuantitySum: totalQuantity,
      price50kCount: price50k,
      price30kCount: price30k,
      otherPriceCount: otherPrice,
      deposit200kCount: deposit200k,
      deposit0Count: deposit0,
      otherDepositCount: otherDeposit,
      imageUrlCount: withImageUrl,
      activeCount: active,
    };
  }

  private computeInventoryReconciliation(
    legacyTotalQuantity: number,
    plannedProducts: PlannedProduct[],
  ): InventoryReconciliation {
    let importedPhysical = 0;
    let unallocatedPhysical = 0;
    const unallocatedItems: UnallocatedInventoryItem[] = [];

    for (const p of plannedProducts) {
      importedPhysical += p.allocatedInventoryCount;
      if (p.unallocatedInventoryCount > 0) {
        unallocatedPhysical += p.unallocatedInventoryCount;
        unallocatedItems.push({
          productCode: p.code,
          productName: p.name,
          quantity: p.unallocatedInventoryCount,
          variants: p.variants.map((v) => v.variantCode),
          reason: `Multi-color product with ${p.variants.length} variants but only ${p.unallocatedInventoryCount} physical item(s). Source does not specify variant allocation.`,
        });
      }
    }

    const difference = legacyTotalQuantity - (importedPhysical + unallocatedPhysical);

    return {
      legacyTotalQuantity,
      importedPhysicalCount: importedPhysical,
      unallocatedPhysicalCount: unallocatedPhysical,
      difference,
      unallocatedItems,
    };
  }
}
