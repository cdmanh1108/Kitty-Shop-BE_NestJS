import type { PrismaService } from '@database/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { serializableTransaction } from '@database/prisma/transaction';
import type { CatalogProductRepository } from '../domain/catalog-product.repository';
import type { UpdateProductVariantData } from '../domain/catalog-product.inputs';
import type { ProductVariantDetails } from '../domain/catalog.models';
import { CATALOG_ERROR_CODE, CatalogInvariantError } from '../domain/catalog-errors';

const COMBINATION_CONFLICT_MESSAGE =
  'Biến thể có cùng kích thước và màu sắc đã tồn tại trong sản phẩm.';

function translateVariantWriteError(
  error: unknown,
  foreignKeyFailure?: 'IN_USE' | 'SIZE' | 'COLOR',
): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = error.meta?.target;
      const targetText = Array.isArray(target)
        ? target.join(',')
        : typeof target === 'string'
          ? target
          : '';
      if (
        targetText.includes('variant_code') ||
        targetText.includes('product_variants_shop_id_variant_code')
      ) {
        throw new CatalogInvariantError(
          CATALOG_ERROR_CODE.PRODUCT_VARIANT_CODE_ALREADY_EXISTS,
          'Mã biến thể đã tồn tại trong cửa hàng.',
        );
      }
      throw new CatalogInvariantError(
        CATALOG_ERROR_CODE.PRODUCT_VARIANT_COMBINATION_DUPLICATE,
        COMBINATION_CONFLICT_MESSAGE,
      );
    }
    if (foreignKeyFailure === 'IN_USE' && (error.code === 'P2003' || error.code === 'P2014')) {
      throw new CatalogInvariantError(
        CATALOG_ERROR_CODE.PRODUCT_VARIANT_IN_USE,
        'Không thể xóa biến thể đang được tồn kho hoặc lịch sử đơn thuê sử dụng.',
      );
    }
    if (error.code === 'P2003' && foreignKeyFailure === 'SIZE') {
      throw new CatalogInvariantError(
        CATALOG_ERROR_CODE.SIZE_NOT_FOUND,
        'Không tìm thấy kích thước.',
      );
    }
    if (error.code === 'P2003' && foreignKeyFailure === 'COLOR') {
      throw new CatalogInvariantError(
        CATALOG_ERROR_CODE.COLOR_NOT_FOUND,
        'Không tìm thấy màu sắc.',
      );
    }
    if (error.code === 'P2025') {
      throw new CatalogInvariantError(
        CATALOG_ERROR_CODE.PRODUCT_VARIANT_NOT_FOUND,
        'Không tìm thấy biến thể trong sản phẩm thuộc cửa hàng.',
      );
    }
  }
  throw error;
}

export function mapProductVariantDeleteError(error: unknown): never {
  return translateVariantWriteError(error, 'IN_USE');
}

async function findScopedVariant(
  tx: Prisma.TransactionClient,
  shopId: string,
  productId: string,
  variantId: string,
) {
  const product = await tx.product.findFirst({
    where: { id: productId, shopId, archivedAt: null, status: { not: 'ARCHIVED' } },
    select: { id: true },
  });
  if (!product) return null;
  return tx.productVariant.findFirst({ where: { id: variantId, shopId, productId } });
}

async function findVariantDetails(
  tx: Prisma.TransactionClient,
  variantId: string,
): Promise<ProductVariantDetails> {
  const details = await tx.productVariant.findUnique({
    where: { id: variantId },
    select: {
      id: true,
      variantCode: true,
      sizeId: true,
      colorId: true,
      depositAmountOverride: true,
      status: true,
      archivedAt: true,
      size: { select: { id: true, code: true, name: true, sortOrder: true, isActive: true } },
      color: { select: { id: true, code: true, name: true, hexColor: true, isActive: true } },
      rentalRates: {
        where: { isActive: true },
        orderBy: { durationDays: 'asc' },
        select: { id: true, durationDays: true, price: true, currency: true, isActive: true },
      },
      _count: { select: { inventoryItems: { where: { isActive: true } } } },
    },
  });
  if (!details) {
    throw new CatalogInvariantError(
      CATALOG_ERROR_CODE.PRODUCT_VARIANT_NOT_FOUND,
      'Không tìm thấy biến thể trong sản phẩm thuộc cửa hàng.',
    );
  }
  return details;
}

async function assertActiveSizeColorReferences(
  tx: Prisma.TransactionClient,
  shopId: string,
  sizeId: string | null,
  colorId: string | null,
): Promise<void> {
  if (sizeId) {
    const size = await tx.size.findFirst({
      where: { id: sizeId, shopId },
      select: { isActive: true },
    });
    if (!size) {
      throw new CatalogInvariantError(
        CATALOG_ERROR_CODE.SIZE_NOT_FOUND,
        'Không tìm thấy kích thước.',
      );
    }
    if (!size.isActive) {
      throw new CatalogInvariantError(
        CATALOG_ERROR_CODE.SIZE_INACTIVE,
        'Kích thước đã ngừng hoạt động.',
      );
    }
  }
  if (colorId) {
    const color = await tx.color.findFirst({
      where: { id: colorId, shopId },
      select: { isActive: true },
    });
    if (!color) {
      throw new CatalogInvariantError(
        CATALOG_ERROR_CODE.COLOR_NOT_FOUND,
        'Không tìm thấy màu sắc.',
      );
    }
    if (!color.isActive) {
      throw new CatalogInvariantError(
        CATALOG_ERROR_CODE.COLOR_INACTIVE,
        'Màu sắc đã ngừng hoạt động.',
      );
    }
  }
}

async function assertNoActiveCombinationConflict(
  tx: Prisma.TransactionClient,
  shopId: string,
  productId: string,
  variantId: string,
  sizeId: string | null,
  colorId: string | null,
): Promise<void> {
  const conflict = await tx.productVariant.findFirst({
    where: {
      shopId,
      productId,
      id: { not: variantId },
      archivedAt: null,
      sizeId,
      colorId,
    },
    select: { id: true },
  });
  if (conflict) {
    throw new CatalogInvariantError(
      CATALOG_ERROR_CODE.PRODUCT_VARIANT_COMBINATION_DUPLICATE,
      COMBINATION_CONFLICT_MESSAGE,
    );
  }
}

export async function updateProductVariant(
  prisma: PrismaService,
  shopId: string,
  productId: string,
  variantId: string,
  input: UpdateProductVariantData,
): ReturnType<CatalogProductRepository['updateProductVariant']> {
  try {
    return await serializableTransaction(prisma, async (tx) => {
      const existing = await findScopedVariant(tx, shopId, productId, variantId);
      if (!existing) return null;

      const nextSizeId = input.sizeId === undefined ? existing.sizeId : input.sizeId;
      const nextColorId = input.colorId === undefined ? existing.colorId : input.colorId;
      await assertActiveSizeColorReferences(
        tx,
        shopId,
        input.sizeId !== undefined && input.sizeId !== existing.sizeId ? input.sizeId : null,
        input.colorId !== undefined && input.colorId !== existing.colorId ? input.colorId : null,
      );

      const data: Prisma.ProductVariantUncheckedUpdateInput = {};
      if (input.variantCode !== undefined) data.variantCode = input.variantCode;
      if (input.sizeId !== undefined) data.sizeId = input.sizeId;
      if (input.colorId !== undefined) data.colorId = input.colorId;
      if (input.depositAmountOverride !== undefined) {
        data.depositAmountOverride = input.depositAmountOverride;
      }

      if (existing.archivedAt === null) {
        await assertNoActiveCombinationConflict(
          tx,
          shopId,
          productId,
          variantId,
          nextSizeId,
          nextColorId,
        );
      }
      const depositChanged =
        input.depositAmountOverride !== undefined &&
        (input.depositAmountOverride === null
          ? existing.depositAmountOverride !== null
          : existing.depositAmountOverride === null ||
            !existing.depositAmountOverride.equals(input.depositAmountOverride));
      const changed =
        (input.variantCode !== undefined && existing.variantCode !== input.variantCode) ||
        (input.sizeId !== undefined && existing.sizeId !== input.sizeId) ||
        (input.colorId !== undefined && existing.colorId !== input.colorId) ||
        depositChanged;
      const variant = changed
        ? await tx.productVariant.update({ where: { id: variantId }, data })
        : existing;
      return {
        before: existing,
        variant,
        details: await findVariantDetails(tx, variantId),
        changed,
      };
    });
  } catch (error) {
    const foreignKeyFailure =
      input.sizeId === undefined && input.colorId === undefined
        ? undefined
        : input.sizeId !== undefined
          ? 'SIZE'
          : 'COLOR';
    translateVariantWriteError(error, foreignKeyFailure);
  }
}

export async function setProductVariantArchived(
  prisma: PrismaService,
  shopId: string,
  productId: string,
  variantId: string,
  archived: boolean,
): ReturnType<CatalogProductRepository['setProductVariantArchived']> {
  try {
    return await serializableTransaction(prisma, async (tx) => {
      const existing = await findScopedVariant(tx, shopId, productId, variantId);
      if (!existing) return null;
      const currentlyArchived = existing.archivedAt !== null;
      if (currentlyArchived === archived) {
        return {
          before: existing,
          variant: existing,
          details: await findVariantDetails(tx, variantId),
          changed: false,
        };
      }

      if (!archived) {
        await assertActiveSizeColorReferences(tx, shopId, existing.sizeId, existing.colorId);
        const duplicateCode = await tx.productVariant.findFirst({
          where: { shopId, id: { not: variantId }, variantCode: existing.variantCode },
          select: { id: true },
        });
        if (duplicateCode) {
          throw new CatalogInvariantError(
            CATALOG_ERROR_CODE.PRODUCT_VARIANT_CODE_ALREADY_EXISTS,
            'Mã biến thể đã tồn tại trong cửa hàng.',
          );
        }
        await assertNoActiveCombinationConflict(
          tx,
          shopId,
          productId,
          variantId,
          existing.sizeId,
          existing.colorId,
        );
      }

      const variant = await tx.productVariant.update({
        where: { id: variantId },
        data: { archivedAt: archived ? new Date() : null },
      });
      return {
        before: existing,
        variant,
        details: await findVariantDetails(tx, variantId),
        changed: true,
      };
    });
  } catch (error) {
    translateVariantWriteError(error);
  }
}

export async function deleteProductVariant(
  prisma: PrismaService,
  shopId: string,
  productId: string,
  variantId: string,
): ReturnType<CatalogProductRepository['deleteProductVariant']> {
  try {
    return await serializableTransaction(prisma, async (tx) => {
      const variant = await findScopedVariant(tx, shopId, productId, variantId);
      if (!variant) return { kind: 'NOT_FOUND' as const };

      const inventoryReferences = await tx.inventoryItem.count({
        where: { shopId, variantId },
      });
      const orderReferences = await tx.rentalOrderItem.count({
        where: { shopId, variantId },
      });
      if (inventoryReferences > 0 || orderReferences > 0) {
        return { kind: 'IN_USE' as const, variant };
      }

      await tx.productVariant.delete({ where: { id: variantId } });
      return { kind: 'DELETED' as const, variant };
    });
  } catch (error) {
    mapProductVariantDeleteError(error);
  }
}
