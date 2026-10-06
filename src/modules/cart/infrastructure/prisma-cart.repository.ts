import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@database/prisma/prisma.service';
import { RENTAL_BILLING_ROLE } from '@modules/rentals/public/rental-billing-role';
import type {
  CartDraft,
  CartReplaceResult,
  CartRepository,
  CartSelection,
  CartSnapshot,
} from '../domain/cart.repository';

@Injectable()
export class PrismaCartRepository implements CartRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(accountId: string, shopId: string): Promise<CartSnapshot | null> {
    const cart = await this.prisma.cart.findUnique({
      where: { accountId_shopId: { accountId, shopId } },
    });
    return cart ? mapCart(cart) : null;
  }

  async replace(
    accountId: string,
    shopId: string,
    expectedVersion: number,
    draft: CartDraft,
  ): Promise<CartReplaceResult> {
    const data = {
      items: toJsonItems(draft.items),
      pickupDate: dateOnly(draft.pickupDate),
      returnDate: dateOnly(draft.returnDate),
    };
    if (expectedVersion === 0) {
      try {
        const cart = await this.prisma.cart.create({ data: { accountId, shopId, ...data } });
        return { kind: 'updated', cart: mapCart(cart) };
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
          throw error;
        return { kind: 'conflict', cart: await this.find(accountId, shopId) };
      }
    }

    const updated = await this.prisma.cart.updateMany({
      where: { accountId, shopId, version: expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    if (updated.count !== 1) return { kind: 'conflict', cart: await this.find(accountId, shopId) };
    return { kind: 'updated', cart: (await this.find(accountId, shopId))! };
  }
}

type PrismaCart = {
  version: number;
  pickupDate: Date;
  returnDate: Date;
  items: Prisma.JsonValue;
};

function mapCart(cart: PrismaCart): CartSnapshot {
  return {
    version: cart.version,
    pickupDate: formatDate(cart.pickupDate),
    returnDate: formatDate(cart.returnDate),
    items: parseItems(cart.items),
  };
}

function parseItems(value: Prisma.JsonValue): CartSelection[] {
  if (!Array.isArray(value)) throw new Error('Các mục giỏ hàng đã lưu không hợp lệ.');
  const items: CartSelection[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new Error('Mục giỏ hàng đã lưu không hợp lệ.');
    const candidate = item as Record<string, Prisma.JsonValue>;
    if (
      typeof candidate.productId !== 'string' ||
      typeof candidate.variantId !== 'string' ||
      typeof candidate.quantity !== 'number' ||
      !Number.isSafeInteger(candidate.quantity) ||
      (candidate.billingRole !== undefined &&
        candidate.billingRole !== RENTAL_BILLING_ROLE.PAID &&
        candidate.billingRole !== RENTAL_BILLING_ROLE.FREE_ACCESSORY)
    )
      throw new Error('Mục giỏ hàng đã lưu không hợp lệ.');
    items.push({
      productId: candidate.productId,
      variantId: candidate.variantId,
      quantity: candidate.quantity,
      ...(candidate.billingRole === undefined ? {} : { billingRole: candidate.billingRole }),
    });
  }
  return items;
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toJsonItems(items: readonly CartSelection[]): Prisma.InputJsonArray {
  return items.map((item) => ({
    productId: item.productId,
    variantId: item.variantId,
    quantity: item.quantity,
    ...(item.billingRole === undefined ? {} : { billingRole: item.billingRole }),
  }));
}
