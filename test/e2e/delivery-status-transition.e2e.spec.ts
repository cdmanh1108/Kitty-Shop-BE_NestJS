import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import * as request from 'supertest';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import { PERMISSIONS } from '../../src/common/constants/permissions';
import { CLOCK, type Clock } from '../../src/common/clock/clock';
import { DELIVERY_REPOSITORY } from '../../src/modules/deliveries/domain/delivery.repository';
import { PrismaDeliveryRepository } from '../../src/modules/deliveries/infrastructure/prisma-delivery.repository';
import { PrismaRentalRepository } from '../../src/modules/rentals/infrastructure/prisma-rental.repository';
import { rentalPolicies } from '../fixtures/rental-policy.fixture';
import { rentalScenario } from '../fixtures/rental.fixture';
import { createTestUserAndMember, uniqueCode } from '../fixtures/test-factories';
import { generateTestAccessToken } from '../helpers/auth-helper';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { createTestApp } from '../helpers/test-app';

describe('Delivery status transition HTTP contract', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  const clock: Clock = { now: () => new Date('2026-09-22T03:00:00.000Z') };
  let rentals: PrismaRentalRepository;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    rentals = new PrismaRentalRepository(prisma, clock, rentalPolicies);
    app = await createTestApp();
    server = app.getHttpServer() as Server;
  });

  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });

  afterAll(async () => {
    if (app) await app.close();
    await disconnectTestDatabase();
  });

  async function fixture() {
    const rental = await rentalScenario(prisma);
    const order = await rentals.createOrder(rental.data);
    if (!order) throw new Error('Expected rental order.');
    const manager = await createTestUserAndMember(prisma, rental.shop.id, {
      permissions: [PERMISSIONS.DELIVERIES_MANAGE],
    });
    const delivery = await prisma.deliveryJob.create({
      data: {
        shopId: rental.shop.id,
        orderId: order.id,
        direction: 'OUTBOUND',
        method: 'SHOP_DELIVERY',
        shippingFee: 0,
        createdBy: manager.member.id,
      },
    });
    const managerToken = generateTestAccessToken({
      userId: manager.user.id,
      memberId: manager.member.id,
      shopId: rental.shop.id,
    });
    return { rental, manager, managerToken, delivery };
  }

  function patch(serverToUse: Server, token: string, id: string, body: object) {
    return request(serverToUse)
      .patch('/api/v1/admin/deliveries/' + id + '/status')
      .set('Authorization', 'Bearer ' + token)
      .send(body);
  }

  it('keeps invalid enum, valid transition, invalid transition, shop, and permission semantics distinct', async () => {
    const data = await fixture();
    await patch(server, data.managerToken, data.delivery.id, { status: 'UNKNOWN' }).expect(400);

    await patch(server, data.managerToken, data.delivery.id, {
      status: 'READY',
      trackingCode: 'TRACK-READY',
    }).expect(200);
    await expect(
      prisma.auditLog.findMany({
        where: { entityId: data.delivery.id, action: 'STATUS_CHANGE' },
        select: { oldValues: true, newValues: true },
      }),
    ).resolves.toEqual([{ oldValues: { status: 'PENDING' }, newValues: { status: 'READY' } }]);

    const invalid = await patch(server, data.managerToken, data.delivery.id, {
      status: 'READY',
      trackingCode: 'REJECTED',
    }).expect(409);
    expect(invalid.body).toMatchObject({ code: 'DELIVERY_INVALID_TRANSITION' });
    await expect(
      prisma.deliveryJob.findUniqueOrThrow({ where: { id: data.delivery.id } }),
    ).resolves.toMatchObject({
      status: 'READY',
      trackingCode: 'TRACK-READY',
    });

    const otherShop = await prisma.shop.create({
      data: { code: uniqueCode('shop'), name: 'Other shop', timezone: 'Asia/Ho_Chi_Minh' },
    });
    const foreignManager = await createTestUserAndMember(prisma, otherShop.id, {
      permissions: [PERMISSIONS.DELIVERIES_MANAGE],
    });
    await patch(
      server,
      generateTestAccessToken({
        userId: foreignManager.user.id,
        memberId: foreignManager.member.id,
        shopId: otherShop.id,
      }),
      data.delivery.id,
      { status: 'PICKED_UP' },
    ).expect(404);

    await patch(server, generateTestAccessToken(data.rental.principal), data.delivery.id, {
      status: 'PICKED_UP',
    }).expect(403);
  });

  it('lets one HTTP request win a forced persisted-state race and reports the other as a conflict', async () => {
    const data = await fixture();
    await patch(server, data.managerToken, data.delivery.id, { status: 'READY' }).expect(200);
    const barrier = new ReadBarrier(2);
    const racingRepository = new PrismaDeliveryRepository(withReadBarrier(prisma, barrier), clock);
    const racingApp = await createTestApp((builder) =>
      builder
        .overrideProvider(DELIVERY_REPOSITORY)
        .useValue(racingRepository)
        .overrideProvider(CLOCK)
        .useValue(clock),
    );
    try {
      const racingServer = racingApp.getHttpServer() as Server;
      const outcomes = await Promise.all([
        patch(racingServer, data.managerToken, data.delivery.id, {
          status: 'PICKED_UP',
          trackingCode: 'PICKUP-WINNER',
        }),
        patch(racingServer, data.managerToken, data.delivery.id, {
          status: 'CANCELLED',
          trackingCode: 'CANCEL-WINNER',
        }),
      ]);

      expect(outcomes.filter((outcome) => outcome.status === 200)).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === 409)).toHaveLength(1);
      const loser = outcomes.find((outcome) => outcome.status === 409);
      expect(loser?.body).toMatchObject({ code: 'DELIVERY_CONCURRENT_MODIFICATION' });

      const persisted = await prisma.deliveryJob.findUniqueOrThrow({
        where: { id: data.delivery.id },
      });
      if (persisted.status === 'PICKED_UP') {
        expect(persisted).toMatchObject({ trackingCode: 'PICKUP-WINNER', pickedUpAt: clock.now() });
      } else {
        expect(persisted).toMatchObject({ trackingCode: 'CANCEL-WINNER', pickedUpAt: null });
      }
    } finally {
      await racingApp.close();
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
