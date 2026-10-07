import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { paginateMeta } from '@common/types/pagination';
import type { Prisma } from '@prisma/client';
import type {
  AdminWebAccountReader,
  AdminWebAccountRecord,
  AdminWebAccountListCriteria,
} from '../domain/admin-web-account-reader';

const contactSelect = {
  id: true,
  email: true,
  fullName: true,
  contactPhone: true,
  emailVerifiedAt: true,
  disabledAt: true,
  createdAt: true,
} satisfies Prisma.WebAccountSelect;
type AccountContact = Prisma.WebAccountGetPayload<{ select: typeof contactSelect }>;

@Injectable()
export class PrismaAdminWebAccountReader implements AdminWebAccountReader {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: AdminWebAccountListCriteria) {
    const compact = input.search?.replace(/[\s().-]/g, '');
    const phoneSearch = compact?.startsWith('+84') ? `0${compact.slice(3)}` : compact;
    const where: Prisma.WebAccountWhereInput = {
      ...(input.verification === 'verified' ? { emailVerifiedAt: { not: null } } : {}),
      ...(input.verification === 'unverified' ? { emailVerifiedAt: null } : {}),
      ...(input.customerId
        ? { rentalOrders: { some: { shopId: input.shopId, customerId: input.customerId } } }
        : {}),
      ...(input.search
        ? {
            OR: [
              { email: { contains: input.search, mode: 'insensitive' } },
              { fullName: { contains: input.search, mode: 'insensitive' } },
              ...(/^\d+$/.test(phoneSearch ?? '')
                ? [{ contactPhone: { contains: phoneSearch } }]
                : []),
            ],
          }
        : {}),
    };
    const [accounts, total] = await this.prisma.$transaction([
      this.prisma.webAccount.findMany({
        where,
        select: contactSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
      this.prisma.webAccount.count({ where }),
    ]);
    return {
      items: await this.withActivity(input.shopId, accounts),
      meta: paginateMeta(input.page, input.limit, total),
    };
  }

  async get(shopId: string, id: string) {
    const account = await this.prisma.webAccount.findUnique({
      where: { id },
      select: contactSelect,
    });
    return account ? (await this.withActivity(shopId, [account]))[0]! : null;
  }

  private async withActivity(
    shopId: string,
    accounts: AccountContact[],
  ): Promise<AdminWebAccountRecord[]> {
    if (!accounts.length) return [];
    const activity = await this.prisma.rentalOrder.groupBy({
      by: ['webAccountId'],
      where: { shopId, webAccountId: { in: accounts.map((account) => account.id) } },
      _count: { _all: true },
      _max: { createdAt: true },
    });
    const byAccount = new Map(activity.map((row) => [row.webAccountId, row]));
    return accounts.map(({ contactPhone, ...account }) => ({
      ...account,
      phone: contactPhone,
      rentalOrderCount: byAccount.get(account.id)?._count._all ?? 0,
      lastRentalAt: byAccount.get(account.id)?._max.createdAt ?? null,
    }));
  }
}
