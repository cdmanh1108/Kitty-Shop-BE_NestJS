import { Module } from '@nestjs/common';
import { WebAuthModule } from '@modules/web-auth/web-auth.module';
import { CartController } from './api/cart.controller';
import { CartService } from './application/cart.service';
import { CART_REPOSITORY } from './domain/cart.repository';
import { PrismaCartRepository } from './infrastructure/prisma-cart.repository';

@Module({
  imports: [WebAuthModule],
  controllers: [CartController],
  providers: [CartService, { provide: CART_REPOSITORY, useClass: PrismaCartRepository }],
})
export class CartModule {}
