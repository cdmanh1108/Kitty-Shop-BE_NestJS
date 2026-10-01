import type { Clock } from '../../src/common/clock/clock';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PrismaDeliveryRepository } from '../../src/modules/deliveries/infrastructure/prisma-delivery.repository';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import { rentalPolicies } from '../fixtures/rental-policy.fixture';
import { rentalScenario } from '../fixtures/rental.fixture';
import { uniqueCode } from '../fixtures/test-factories';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';

describe('Delivery status lifecycle persistence', () => {
  let prisma: PrismaService;
  let now = new Date('2026-09-22T03:00:00.000Z');
  const clock: Clock = { now: () => new Date(now) };
  let deliveries: PrismaDeliveryRepository;
  let rentals: PrismaRentalRepository;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    deliveries = new PrismaDeliveryRepository(prisma, clock);
    rentals = new PrismaRentalRepository(prisma, clock, rentalPolicies);
  });

  beforeEach(async () => {
    now = new Date('2026-09-22T03:00:00.000Z');
    await resetTestDatabase(prisma);
  });

  afterAll(disconnectTestDatabase);

  async function fixture() {
    const f = await rentalScenario(prisma);
    const order = await rentals.createOrder(f.data);
    if (!order) throw new Error('Expected rental order.');
    const delivery = await prisma.deliveryJob.create({
      data: {
        shopId: f.shop.id,
        orderId: order.id,
        direction: 'OUTBOUND',
        method: 'SHOP_DELIVERY',
        shippingFee: 0,
        createdBy: f.member.id,
      },
    });
    return { f, delivery };
  }

  async function transition(input: {
    shopId: string;
    id: string;
    status: 'READY' | 'PICKED_UP' | 'DELIVERING' | 'DELIVERED' | 'FAILED' | 'CANCELLED';
    trackingCode?: string;
  }) {
    const result = await deliveries.updateStatus(input);
    if (result.kind !== 'UPDATED')
      throw new Error(`Expected transition to commit, got ${result.kind}`);
    return result.delivery;
  }

  it('commits the allowed path and preserves timestamps from their committed transitions', async () => {
    const { f, delivery } = await fixture();
    await transition({ shopId: f.shop.id, id: delivery.id, status: 'READY' });

    now = new Date('2026-09-22T04:00:00.000Z');
    await transition({
      shopId: f.shop.id,
      id: delivery.id,
      status: 'PICKED_UP',
      trackingCode: 'TRACK-PICKUP',
    });
    const pickedUpAt = new Date(now);

    now = new Date('2026-09-22T05:00:00.000Z');
    await transition({ shopId: f.shop.id, id: delivery.id, status: 'DELIVERING' });

    now = new Date('2026-09-22T06:00:00.000Z');
    await transition({ shopId: f.shop.id, id: delivery.id, status: 'DELIVERED' });

    await expect(
      prisma.deliveryJob.findUniqueOrThrow({ where: { id: delivery.id } }),
    ).resolves.toMatchObject({
      status: 'DELIVERED',
      trackingCode: 'TRACK-PICKUP',
      pickedUpAt,
      deliveredAt: now,
    });
  });

  it('rejects terminal and backward transitions without changing metadata or timestamps', async () => {
    const { f, delivery } = await fixture();
    await transition({ shopId: f.shop.id, id: delivery.id, status: 'READY' });
    now = new Date('2026-09-22T04:00:00.000Z');
    await transition({ shopId: f.shop.id, id: delivery.id, status: 'PICKED_UP' });
    now = new Date('2026-09-22T05:00:00.000Z');
    await transition({
      shopId: f.shop.id,
      id: delivery.id,
      status: 'DELIVERED',
      trackingCode: 'WINNER',
    });
    const before = await prisma.deliveryJob.findUniqueOrThrow({ where: { id: delivery.id } });

    await expect(
      deliveries.updateStatus({
        shopId: f.shop.id,
        id: delivery.id,
        status: 'READY',
        trackingCode: 'REJECTED',
      }),
    ).resolves.toEqual({ kind: 'INVALID_TRANSITION' });

    await expect(
      prisma.deliveryJob.findUniqueOrThrow({ where: { id: delivery.id } }),
    ).resolves.toEqual(before);
  });

  it('keeps cancellation terminal and does not accept a normal retry from failed', async () => {
    const cancelled = await fixture();
    await transition({
      shopId: cancelled.f.shop.id,
      id: cancelled.delivery.id,
      status: 'CANCELLED',
      trackingCode: 'CANCELLED-WINNER',
    });
    await expect(
      deliveries.updateStatus({
        shopId: cancelled.f.shop.id,
        id: cancelled.delivery.id,
        status: 'READY',
        trackingCode: 'REJECTED',
      }),
    ).resolves.toEqual({ kind: 'INVALID_TRANSITION' });
    await expect(
      prisma.deliveryJob.findUniqueOrThrow({ where: { id: cancelled.delivery.id } }),
    ).resolves.toMatchObject({
      status: 'CANCELLED',
      trackingCode: 'CANCELLED-WINNER',
      pickedUpAt: null,
      deliveredAt: null,
    });

    const failed = await fixture();
    await transition({ shopId: failed.f.shop.id, id: failed.delivery.id, status: 'READY' });
    now = new Date('2026-09-22T04:00:00.000Z');
    await transition({ shopId: failed.f.shop.id, id: failed.delivery.id, status: 'PICKED_UP' });
    await transition({ shopId: failed.f.shop.id, id: failed.delivery.id, status: 'FAILED' });
    const failedBefore = await prisma.deliveryJob.findUniqueOrThrow({
      where: { id: failed.delivery.id },
    });

    await expect(
      deliveries.updateStatus({
        shopId: failed.f.shop.id,
        id: failed.delivery.id,
        status: 'READY',
      }),
    ).resolves.toEqual({ kind: 'INVALID_TRANSITION' });
    await expect(
      prisma.deliveryJob.findUniqueOrThrow({ where: { id: failed.delivery.id } }),
    ).resolves.toEqual(failedBefore);
  });

  it('scopes status writes to the shop and does not expose another shop delivery', async () => {
    const { delivery } = await fixture();
    const otherShop = await prisma.shop.create({
      data: { code: uniqueCode('shop'), name: 'Other shop', timezone: 'Asia/Ho_Chi_Minh' },
    });

    await expect(
      deliveries.updateStatus({ shopId: otherShop.id, id: delivery.id, status: 'READY' }),
    ).resolves.toEqual({ kind: 'NOT_FOUND' });
    await expect(
      prisma.deliveryJob.findUniqueOrThrow({ where: { id: delivery.id } }),
    ).resolves.toMatchObject({
      status: 'PENDING',
      pickedUpAt: null,
      deliveredAt: null,
    });
  });

  it('allows exactly one real database compare-and-swap winner after both requests read READY', async () => {
    const { f, delivery } = await fixture();
    await transition({ shopId: f.shop.id, id: delivery.id, status: 'READY' });
    const barrier = new ReadBarrier(2);
    const racingRepository = new PrismaDeliveryRepository(withReadBarrier(prisma, barrier), clock);

    const outcomes = await Promise.all([
      racingRepository.updateStatus({
        shopId: f.shop.id,
        id: delivery.id,
        status: 'PICKED_UP',
        trackingCode: 'PICKUP-WINNER',
      }),
      racingRepository.updateStatus({
        shopId: f.shop.id,
        id: delivery.id,
        status: 'CANCELLED',
        trackingCode: 'CANCEL-WINNER',
      }),
    ]);

    expect(outcomes.filter((outcome) => outcome.kind === 'UPDATED')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === 'CONCURRENT_MODIFICATION')).toHaveLength(
      1,
    );
    const persisted = await prisma.deliveryJob.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(['PICKED_UP', 'CANCELLED']).toContain(persisted.status);
    if (persisted.status === 'PICKED_UP') {
      expect(persisted).toMatchObject({ trackingCode: 'PICKUP-WINNER', pickedUpAt: now });
    } else {
      expect(persisted).toMatchObject({ trackingCode: 'CANCEL-WINNER', pickedUpAt: null });
    }
  });
});

class ReadBarrier {
  private waiting = 0;
  private readonly ready: Promise<void>;
  private release!: () => void;

  constructor(private readonly participants: number) {
    this.ready = new Promise<void>((resolve) => {
      this.release = resolve;
    });
  }

  wait(): Promise<void> {
    this.waiting += 1;
    if (this.waiting === this.participants) this.release();
    return this.ready;
  }
}

function withReadBarrier(prisma: PrismaService, barrier: ReadBarrier): PrismaService {
  return {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      prisma.$transaction(async (tx) => {
        let initialRead = true;
        const deliveryJob = {
          findFirst: async (...args: Parameters<typeof tx.deliveryJob.findFirst>) => {
            const result = await tx.deliveryJob.findFirst(...args);
            if (initialRead) {
              initialRead = false;
              await barrier.wait();
            }
            return result;
          },
          updateMany: tx.deliveryJob.updateMany.bind(tx.deliveryJob),
        };
        return callback({ deliveryJob });
      }),
  } as never;
}
