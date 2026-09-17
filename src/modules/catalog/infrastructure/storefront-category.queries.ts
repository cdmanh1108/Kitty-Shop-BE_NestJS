import type { PrismaService } from '@database/prisma/prisma.service';
import type { StorefrontCategory } from '../domain/catalog.models';

/**
 * Retrieves public, active storefront categories scoped strictly to the current shop.
 * Results are ordered by sortOrder ascending, then name, then code.
 */
export async function listStorefrontCategories(
  prisma: PrismaService,
  shopId: string,
): Promise<StorefrontCategory[]> {
  const categories = await prisma.category.findMany({
    where: {
      shopId,
      isActive: true,
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { code: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      slug: true,
      parentId: true,
      sortOrder: true,
      description: true,
    },
  });

  return categories.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    slug: c.slug,
    parentId: c.parentId,
    sortOrder: c.sortOrder,
    description: c.description,
  }));
}
