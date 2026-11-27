import 'reflect-metadata';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import type { Server } from 'node:http';
import * as request from 'supertest';
import type { CurrentUser } from '@common/types/current-user';
import { AdminProductController } from '@modules/catalog/api/admin/admin-product.controller';
import { ProductMediaService } from '@modules/catalog/application/product-media.service';
import { ProductService } from '@modules/catalog/application/product.service';

describe('Admin product image multipart upload', () => {
  const user: CurrentUser = {
    userId: 'user-1',
    memberId: 'member-1',
    shopId: 'shop-1',
    email: 'admin@example.test',
    fullName: 'Admin',
    permissions: ['catalog.manage'],
  };
  const uploadProductMedia = jest.fn();
  const productId = 'product-1';
  const path = `/api/v1/admin/products/${productId}/media/upload`;
  const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
  const imageOptions = { filename: 'front.jpg', contentType: 'image/jpeg' };
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AdminProductController],
      providers: [
        { provide: ProductService, useValue: {} },
        { provide: ProductMediaService, useValue: { uploadProductMedia } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.currentUser = user;
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    server = app.getHttpServer() as Server;
  });

  beforeEach(() => {
    uploadProductMedia.mockReset().mockResolvedValue({ id: 'media-1' });
  });
  afterAll(async () => app.close());

  it('passes one image and all four fields from the Admin form to the service', async () => {
    const uploadIntentId = 'd0d40cbc-4d94-4892-96d8-e6f397811bb0';

    await request(server)
      .post(path)
      .attach('file', image, imageOptions)
      .field('uploadIntentId', uploadIntentId)
      .field('altText', 'Front view')
      .field('isPrimary', 'false')
      .field('sortOrder', '7')
      .expect(201);

    expect(uploadProductMedia).toHaveBeenCalledWith(user, productId, {
      file: { buffer: image, mimetype: 'image/jpeg' },
      uploadIntentId,
      altText: 'Front view',
      isPrimary: false,
      sortOrder: 7,
    });
  });

  it('rejects two images in the same request', async () => {
    await request(server)
      .post(path)
      .attach('file', image, imageOptions)
      .attach('file', image, imageOptions)
      .expect(400);

    expect(uploadProductMedia).not.toHaveBeenCalled();
  });
});
