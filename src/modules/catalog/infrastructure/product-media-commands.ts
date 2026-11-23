import type { PublicMediaUrlResolver } from '@common/storage/public-url.resolver';
import type { PrismaService } from '@database/prisma/prisma.service';
import { serializableTransaction } from '@database/prisma/transaction';
import {
  claimIdempotencyRecord,
  completeIdempotencyClaim,
  lockIdempotencyClaim,
} from '@database/prisma/idempotency';
import type { RemovedProductMedia } from '../domain/catalog.models';
import type { ProductMediaData } from '../domain/catalog-product.inputs';
import type {
  CatalogProductRepository,
  ProductMediaUploadIntent,
  ProductMediaUploadOwner,
  ProductMediaUploadClaim,
} from '../domain/catalog-product.repository';
import { ProductMediaUploadConflictError } from '../application/catalog-application.errors';

export async function claimProductMediaUpload(
  prisma: PrismaService,
  mediaUrls: PublicMediaUrlResolver,
  shopId: string,
  productId: string,
  intent: ProductMediaUploadIntent,
  now: Date,
): Promise<ProductMediaUploadClaim> {
  const claim = await claimIdempotencyRecord(prisma, { now: () => now }, { shopId, ...intent });
  if (claim.state !== 'COMPLETED') return claim;
  const result = claim.responseBody;
  const mediaId =
    result && typeof result === 'object' && !Array.isArray(result) ? result.mediaId : undefined;
  const media =
    typeof mediaId === 'string'
      ? await prisma.productMedia.findFirst({ where: { id: mediaId, productId, shopId } })
      : null;
  return { state: 'COMPLETED', media: media ? { ...media, url: mediaUrls.resolve(media) } : null };
}

export async function addProductMedia(
  prisma: PrismaService,
  mediaUrls: PublicMediaUrlResolver,
  shopId: string,
  productId: string,
  input: ProductMediaData,
  intent?: ProductMediaUploadOwner,
): ReturnType<CatalogProductRepository['addProductMedia']> {
  const created = await serializableTransaction(prisma, async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, shopId, archivedAt: null },
      select: { id: true },
    });
    if (!product) return null;
    if (intent && !(await lockIdempotencyClaim(tx, shopId, intent))) {
      throw new ProductMediaUploadConflictError(
        'Lượt tải ảnh đang được xử lý lại.',
        'MEDIA_UPLOAD_IN_PROGRESS',
      );
    }
    if (input.isPrimary) {
      await tx.productMedia.updateMany({
        where: { shopId, productId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    const media = await tx.productMedia.create({
      data: { shopId, productId, ...input, storageKey: input.storageKey ?? null },
    });
    if (
      intent &&
      !(await completeIdempotencyClaim(tx, {
        ...intent,
        shopId,
        responseCode: 201,
        responseBody: { mediaId: media.id },
      }))
    ) {
      throw new ProductMediaUploadConflictError(
        'Lượt tải ảnh đang được xử lý lại.',
        'MEDIA_UPLOAD_IN_PROGRESS',
      );
    }
    return media;
  });
  if (!created) return null;
  return { ...created, url: mediaUrls.resolve(created) };
}

export async function setPrimaryProductMedia(
  prisma: PrismaService,
  mediaUrls: PublicMediaUrlResolver,
  shopId: string,
  productId: string,
  mediaId: string,
): ReturnType<CatalogProductRepository['setPrimaryProductMedia']> {
  const updated = await serializableTransaction(prisma, async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, shopId, archivedAt: null },
      select: { id: true },
    });
    if (!product) return null;
    const media = await tx.productMedia.findFirst({
      where: { id: mediaId, shopId, productId },
      select: { id: true },
    });
    if (!media) return null;
    await tx.productMedia.updateMany({
      where: { shopId, productId, isPrimary: true },
      data: { isPrimary: false },
    });
    await tx.productMedia.updateMany({
      where: { id: mediaId, shopId, productId },
      data: { isPrimary: true },
    });
    return tx.productMedia.findFirst({ where: { id: mediaId, shopId, productId } });
  });
  if (!updated) return null;
  return { ...updated, url: mediaUrls.resolve(updated) };
}

export async function removeProductMedia(
  prisma: PrismaService,
  shopId: string,
  productId: string,
  mediaId: string,
): Promise<RemovedProductMedia | null> {
  return serializableTransaction(prisma, async (tx) => {
    const media = await tx.productMedia.findFirst({
      where: { id: mediaId, shopId, productId },
      select: { storageKey: true },
    });
    if (!media) return null;
    const deleted = await tx.productMedia.deleteMany({
      where: { id: mediaId, shopId, productId },
    });
    if (deleted.count !== 1) return null;
    return { storageKey: media.storageKey };
  });
}
