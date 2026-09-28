import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@database/prisma/prisma.service';
import { storefrontProductEligibility } from '@modules/catalog/domain/storefront-eligibility';
import type {
  FavoriteAddResult,
  FavoriteMutation,
  FavoritePage,
  FavoriteRepository,
  FavoriteStatus,
  FavoriteSummary,
} from '../domain/favorite.repository';

@Injectable()
export class PrismaFavoriteRepository implements FavoriteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listProductIds(
    accountId: string,
    shopId: string,
    page: number,
    limit: number,
  ): Promise<FavoritePage> {
    const skip = (page - 1) * limit;
    const where = storefrontFavoriteWhere(accountId, shopId);
    const [favorites, total] = await this.prisma.$transaction([
      this.prisma.favorite.findMany({
        where,
        select: { productId: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.favorite.count({ where }),
    ]);
    return { productIds: favorites.map((favorite) => favorite.productId), total };
  }

  async status(accountId: string, shopId: string, productIds: string[]): Promise<FavoriteStatus> {
    const where = storefrontFavoriteWhere(accountId, shopId);
    const [favorites, total] = await this.prisma.$transaction([
      this.prisma.favorite.findMany({
        where: productIds.length
          ? { ...where, productId: { in: [...new Set(productIds)] } }
          : where,
        select: { productId: true },
        orderBy: { productId: 'asc' },
      }),
      this.prisma.favorite.count({ where }),
    ]);
    return { productIds: favorites.map((favorite) => favorite.productId), total };
  }

  async summary(accountId: string, shopId: string): Promise<FavoriteSummary> {
    return {
      total: await this.prisma.favorite.count({
        where: storefrontFavoriteWhere(accountId, shopId),
      }),
    };
  }

  async add(accountId: string, shopId: string, productId: string): Promise<FavoriteAddResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.favorite.createMany({
          data: [{ accountId, productId }],
          skipDuplicates: true,
        });
        return {
          kind: 'stored',
          total: await tx.favorite.count({ where: storefrontFavoriteWhere(accountId, shopId) }),
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') return { kind: 'product_missing' };
      }
      throw error;
    }
  }

  async remove(accountId: string, shopId: string, productId: string): Promise<FavoriteMutation> {
    return this.prisma.$transaction(async (tx) => {
      await tx.favorite.deleteMany({ where: { accountId, productId } });
      return {
        total: await tx.favorite.count({ where: storefrontFavoriteWhere(accountId, shopId) }),
      };
    });
  }
}

function storefrontFavoriteWhere(accountId: string, shopId: string): Prisma.FavoriteWhereInput {
  return {
    accountId,
    product: { is: { shopId, ...storefrontProductEligibility } },
  };
}
