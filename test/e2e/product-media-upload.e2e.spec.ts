import * as request from 'supertest';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../../src/database/prisma/prisma.service';
import {
  PUBLIC_MEDIA_URL_RESOLVER,
  type PublicMediaUrlResolver,
} from '../../src/common/storage/public-url.resolver';
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
import type { CurrentUser } from '../../src/common/types/current-user';

describe('Admin product media upload HTTP flow', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let storage: ObjectStoragePort;

  beforeAll(async () => {
    prisma = await connectTestDatabase();
    const mediaUrls: PublicMediaUrlResolver = {
      resolve: (media) =>
        media.storageKey ? `https://assets.test.example/${media.storageKey}` : media.url,
    };
    app = await createTestApp((builder) =>
      builder.overrideProvider(PUBLIC_MEDIA_URL_RESOLVER).useValue(mediaUrls),
    );
    server = app.getHttpServer() as Server;
    storage = app.get<ObjectStoragePort>(OBJECT_STORAGE_PORT);
  });
  beforeEach(async () => {
    await resetTestDatabase(prisma);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    if (app) await app.close();
    await disconnectTestDatabase();
  });

  it('stores a scoped image as managed media and transforms multipart options', async () => {
    const fixture = await rentalScenario(prisma);
    const admin = await createTestUserAndMember(prisma, fixture.shop.id, {
      permissions: ['catalog.manage'],
    });
    const principal: CurrentUser = {
      userId: admin.user.id,
      memberId: admin.member.id,
      shopId: fixture.shop.id,
      email: admin.user.email,
      fullName: admin.user.fullName,
      permissions: ['catalog.manage'],
    };
    const token = generateTestAccessToken(principal);
    const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
    const put = jest
      .spyOn(storage, 'putObject')
      .mockImplementation((input) =>
        Promise.resolve({ storageKey: input.key, publicUrl: 'stored' }),
      );

    const response = await request(server)
      .post(`/api/v1/admin/products/${fixture.product.id}/media/upload`)
      .set('Authorization', `Bearer ${token}`)
      .field('altText', 'Front view')
      .field('isPrimary', 'false')
      .field('sortOrder', '7')
      .attach('file', image, { filename: 'front.jpg', contentType: 'image/jpeg' })
      .expect(201);

    const body = response.body as {
      altText: string;
      isPrimary: boolean;
      sortOrder: number;
      storageKey: string;
      url: string;
    };
    expect(body.altText).toBe('Front view');
    expect(body.isPrimary).toBe(false);
    expect(body.sortOrder).toBe(7);
    expect(body.storageKey).toMatch(/^shops\//);
    expect(body.url).toContain(body.storageKey);
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({ body: image, contentType: 'image/jpeg' }),
    );
    const stored = await prisma.productMedia.findFirstOrThrow({
      where: { productId: fixture.product.id },
    });
    expect(stored.storageKey).toBe(body.storageKey);
    expect(stored.url).toBe('stored');

    const external = await request(server)
      .post(`/api/v1/admin/products/${fixture.product.id}/media`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        url: 'https://images.example.test/legacy.jpg',
        isPrimary: false,
        sortOrder: 8,
      })
      .expect(201);
    expect(external.body).toHaveProperty('url', 'https://images.example.test/legacy.jpg');
    expect(external.body).toHaveProperty('storageKey', null);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid image content and another shop product before storage', async () => {
    const fixture = await rentalScenario(prisma);
    const otherShop = await rentalScenario(prisma);
    const admin = await createTestUserAndMember(prisma, fixture.shop.id, {
      permissions: ['catalog.manage'],
    });
    const token = generateTestAccessToken({
      userId: admin.user.id,
      memberId: admin.member.id,
      shopId: fixture.shop.id,
    });
    const put = jest.spyOn(storage, 'putObject');

    await request(server)
      .post(`/api/v1/admin/products/${fixture.product.id}/media/upload`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('<html>'), { filename: 'bad.jpg', contentType: 'image/jpeg' })
      .expect(400);
    await request(server)
      .post(`/api/v1/admin/products/${otherShop.product.id}/media/upload`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), {
        filename: 'front.jpg',
        contentType: 'image/jpeg',
      })
      .expect(404);

    expect(put).not.toHaveBeenCalled();
    expect(await prisma.productMedia.count()).toBe(0);
  });
});
