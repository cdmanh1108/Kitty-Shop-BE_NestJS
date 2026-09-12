import { Body, Controller, Module, Post, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import type { Server } from 'node:http';
import { configureApplication } from '../src/configure-application';
import { LoginReqDto } from '../src/modules/auth/api/auth.dto';
import { CreateRentalOrderReqDto } from '../src/modules/rentals/api/rental.dto';

@Controller('validation')
class ValidationController {
  @Post('login')
  login(@Body() body: LoginReqDto): LoginReqDto {
    return body;
  }

  @Post('rental')
  rental(@Body() body: CreateRentalOrderReqDto): CreateRentalOrderReqDto {
    return body;
  }
}

@Module({
  controllers: [ValidationController],
  providers: [
    {
      provide: ConfigService,
      useValue: new ConfigService({
        apiPrefix: 'api/v1',
        corsOrigins: [],
        trustProxy: false,
        swaggerEnabled: false,
      }),
    },
  ],
})
class ValidationModule {}

describe('Vietnamese API error messages', () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [ValidationModule] }).compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns actionable DTO messages through the real HTTP validation pipeline', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/validation/login')
      .send({ email: 'invalid', password: 'short', unexpected: true })
      .expect(400);
    expect(response.body).toHaveProperty('code', 'HTTP_400');
    expect(response.body).toHaveProperty('message', expect.stringContaining('Email không hợp lệ.'));
    expect(response.body).toHaveProperty(
      'details.message',
      expect.arrayContaining([
        'Email không hợp lệ.',
        'Mật khẩu phải có ít nhất 8 ký tự.',
        'Trường "unexpected" không được phép gửi trong yêu cầu.',
      ]),
    );
  });

  it('keeps Vietnamese nested messages and identifies unknown nested fields', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/validation/rental')
      .send({ items: [{ variantId: 'invalid', quantity: 0, unexpected: true }] })
      .expect(400);
    expect(response.body).toHaveProperty(
      'details.message',
      expect.arrayContaining([
        'Mã biến thể phải là UUID hợp lệ.',
        'Số lượng phải lớn hơn hoặc bằng 1.',
        'Trường "items.0.unexpected" không được phép gửi trong yêu cầu.',
      ]),
    );
  });

  it('returns a Vietnamese message for malformed JSON', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/validation/login')
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400);
    expect(response.body).toMatchObject({
      message: 'Nội dung yêu cầu không đúng định dạng JSON. Vui lòng kiểm tra và gửi lại.',
    });
  });

  it('returns a Vietnamese message for an unknown route', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/missing').expect(404);
    expect(response.body).toMatchObject({ message: 'Không tìm thấy đường dẫn được yêu cầu.' });
  });
});
