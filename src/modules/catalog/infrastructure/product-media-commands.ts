import type { PublicMediaUrlResolver } from '@common/storage/public-url.resolver';
import type { PrismaService } from '@database/prisma/prisma.service';
import { serializableTransaction } from '@database/prisma/transaction';
import type { RemovedProductMedia } from '../domain/catalog.models';
import type { ProductMediaData } from '../domain/catalog-product.inputs';
import type { CatalogProductRepository } from '../domain/catalog-product.repository';

export async function addProductMedia(
  prisma: PrismaService,
  mediaUrls: PublicMediaUrlResolver,
  shopId: string,
  productId: string,
  input: ProductMediaData,
): ReturnType<CatalogProductRepository['addProductMedia']> {
  const created = await serializableTransaction(prisma, async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, shopId, archivedAt: null },
      select: { id: true },
    });
    if (!product) return null;
    if (input.isPrimary) {
      await tx.productMedia.updateMany({
        where: { shopId, productId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return tx.productMedia.create({
      data: { shopId, productId, ...input, storageKey: input.storageKey ?? null },
    });
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
