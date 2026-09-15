import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '@database/prisma/prisma.module';
import { ShopResolver } from './shop-resolver';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [ShopResolver],
  exports: [ShopResolver],
})
export class TenantModule {}
