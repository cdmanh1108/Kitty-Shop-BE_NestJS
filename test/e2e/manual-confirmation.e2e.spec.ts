import * as request from 'supertest';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import {
  OBJECT_STORAGE_PORT,
  type ObjectStoragePort,
} from '../../src/common/storage/object-storage.port';
import {
  connectTestDatabase,
  disconnectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { createTestApp } from '../helpers/test-app';
import { generateTestAccessToken } from '../helpers/auth-helper';
import { rentalScenario } from '../fixtures/rental.fixture';
import { createTestUserAndMember } from '../fixtures/test-factories';

describe('Admin confirmation HTTP flow', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  beforeAll(async () => {
    prisma = await connectTestDatabase();
    app = await createTestApp();
    server = app.getHttpServer() as Server;
  });
  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    if (app) await app.close();
    await disconnectTestDatabase();
  });

  async function fixture() {
    const f = await rentalScenario(prisma);
    const token = generateTestAccessToken(f.principal);
    await request(server)
      .post('/api/v1/admin/rental-orders')
      .set('Authorization', `Bearer ${token}`)
      .send(f.input)
      .expect(201);
    const order = await prisma.rentalOrder.findFirstOrThrow({ where: { shopId: f.shop.id } });
    return { ...f, token, order, url: `/api/v1/admin/rental-orders/${order.id}` };
  }

  it('creates RESERVED then confirms the cash deposit', async () => {
    const f = await fixture();
    const options = await request(server)
      .get(f.url + '/confirmation-options')
      .set('Authorization', `Bearer ${f.token}`)
      .expect(200);
    expect(options.body).toHaveProperty('expectedDeposit', f.order.depositRequired.toString());
    const response = await request(server)
      .post(f.url + '/confirm')
      .set('Authorization', 'Bearer ' + f.token)
      .field('collateralAmount', f.order.depositRequired.toString())
      .expect(200);
    expect(response.body).toMatchObject({
      status: 'CONFIRMED',
      confirmation: { confirmedBy: f.member.id, hasEvidence: false },
      paymentStatus: 'PAID',
    });
    expect(response.text).not.toContain('evidenceKey');
    await request(server)
      .post(f.url + '/confirm')
      .set('Authorization', `Bearer ${f.token}`)
      .field('collateralAmount', f.order.depositRequired.toString())
      .expect(400);
    expect(await prisma.rentalConfirmation.count()).toBe(1);
  });

  it('enforces granular permission and shop scope on confirm, options and evidence', async () => {
    const f = await fixture();
    const staff = await createTestUserAndMember(prisma, f.shop.id, {
      permissions: ['rentals.view', 'rentals.update'],
    });
    const token = generateTestAccessToken({
      userId: staff.user.id,
      memberId: staff.member.id,
      shopId: f.shop.id,
    });
    await request(server)
      .post(f.url + '/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ collateralAmount: 200000 })
      .expect(403);
    for (const suffix of ['/confirmation-options', '/confirmation/evidence'])
      await request(server)
        .get(f.url + suffix)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    await request(server)
      .post(f.url + '/confirm')
      .set(
        'Authorization',
        `Bearer ${generateTestAccessToken({ ...f.principal, shopId: '00000000-0000-4000-8000-000000000000' })}`,
      )
      .send({ collateralAmount: 200000 })
      .expect(401);
    await request(server)
      .post(f.url + '/confirm')
      .send({})
      .expect(401);
    await request(server)
      .patch(f.url + '/status')
      .set('Authorization', `Bearer ${f.token}`)
      .send({ status: 'CONFIRMED' })
      .expect(404);
    await request(server)
      .post(f.url + '/collateral/return')
      .set('Authorization', `Bearer ${f.token}`)
      .expect(404);
    expect((await prisma.rentalOrder.findUniqueOrThrow({ where: { id: f.order.id } })).status).toBe(
      'RESERVED',
    );
  });

  it('rejects invalid form fields and file content before persistence', async () => {
    const f = await fixture();
    for (const body of [
      {},
      { collateralAmount: -1 },
      { collateralAmount: '' },
      { collateralMethod: 'DOCUMENT', documentType: 'GPLX', collateralAmount: 200000 },
      { documentType: 'CCCD', collateralAmount: 200000 },
    ]) {
      await request(server)
        .post(f.url + '/confirm')
        .set('Authorization', `Bearer ${f.token}`)
        .send(body)
        .expect(400);
    }
    await request(server)
      .post(f.url + '/confirm')
      .set('Authorization', `Bearer ${f.token}`)
      .field('collateralAmount', '200000')
      .attach('evidence', Buffer.from('<html>'), { filename: 'bad.jpg', contentType: 'image/jpeg' })
      .expect(400);
    expect(await prisma.rentalConfirmation.count()).toBe(0);
  });

  it('accepts an optional upload and exposes it only via authenticated binary retrieval', async () => {
    const f = await fixture();
    const storage = app.get<ObjectStoragePort>(OBJECT_STORAGE_PORT);
    const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
    const upload = jest
      .spyOn(storage, 'putObject')
      .mockImplementation((input) => Promise.resolve({ storageKey: input.key, publicUrl: '' }));
    jest.spyOn(storage, 'getObject').mockResolvedValue(image);
    const response = await request(server)
      .post(f.url + '/confirm')
      .set('Authorization', `Bearer ${f.token}`)
      .field('collateralAmount', '200000')
      .field('note', 'Đã nhận tiền cọc')
      .attach('evidence', image, { filename: 'receipt.jpg', contentType: 'image/jpeg' })
      .expect(200);
    expect(response.body).toHaveProperty('confirmation.hasEvidence', true);
    expect(upload).toHaveBeenCalledTimes(1);
    const file = await request(server)
      .get(f.url + '/confirmation/evidence')
      .set('Authorization', `Bearer ${f.token}`)
      .expect(200);
    expect(file.headers['cache-control']).toBe('private, no-store');
    expect(file.headers['content-type']).toContain('image/jpeg');
    expect(file.body).toEqual(image);
    const receipts = await prisma.paymentTransaction.findMany({
      select: { purpose: true },
      orderBy: { purpose: 'asc' },
    });
    expect(receipts).toEqual([{ purpose: 'DEPOSIT' }, { purpose: 'RENTAL_PAYMENT' }]);
  });
});
