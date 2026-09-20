import { Prisma } from '@prisma/client';
import { BookingCustomerUnavailableError } from '../../src/modules/customers/domain/customer-errors';
import { PrismaCustomerRepository } from '../../src/modules/customers/infrastructure/prisma-customer.repository';

describe('PrismaCustomerRepository booking resolution', () => {
  const phoneConflict = () =>
    new Prisma.PrismaClientKnownRequestError('phone conflict', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['shop_id', 'normalized_phone'] },
    });

  it('rereads and reuses the eligible winner after only the phone unique conflict', async () => {
    const winner = { id: 'winner', status: 'ACTIVE', archivedAt: null };
    const customer = {
      findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(winner),
      create: jest.fn().mockRejectedValue(phoneConflict()),
    };
    const repository = new PrismaCustomerRepository({ customer } as never);

    await expect(
      repository.resolveForBooking({ shopId: 'shop-1', fullName: 'Guest', phone: '0912345678' }),
    ).resolves.toEqual({ id: 'winner' });
    expect(customer.findFirst).toHaveBeenCalledTimes(2);
  });

  it('does not treat another unique constraint as a normalized-phone winner', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('customer code conflict', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['shop_id', 'customer_code'] },
    });
    const customer = {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockRejectedValue(conflict),
    };
    const repository = new PrismaCustomerRepository({ customer } as never);

    await expect(
      repository.resolveForBooking({ shopId: 'shop-1', fullName: 'Guest', phone: '0912345678' }),
    ).rejects.toBe(conflict);
    expect(customer.findFirst).toHaveBeenCalledTimes(1);
  });

  it('rejects a blocked winner instead of reusing or restoring it', async () => {
    const customer = {
      findFirst: jest.fn().mockResolvedValue({
        id: 'blocked',
        status: 'BLOCKED',
        archivedAt: null,
      }),
      create: jest.fn(),
    };
    const repository = new PrismaCustomerRepository({ customer } as never);

    await expect(
      repository.resolveForBooking({ shopId: 'shop-1', fullName: 'Guest', phone: '0912345678' }),
    ).rejects.toBeInstanceOf(BookingCustomerUnavailableError);
    expect(customer.create).not.toHaveBeenCalled();
  });
});
