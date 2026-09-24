import { Module } from '@nestjs/common';
import { CatalogModule } from '@modules/catalog/catalog.module';
import { WebAuthModule } from '@modules/web-auth/web-auth.module';
import { FavoritesController } from './api/favorites.controller';
import { FavoritesService } from './application/favorites.service';
import { FAVORITE_REPOSITORY } from './domain/favorite.repository';
import { PrismaFavoriteRepository } from './infrastructure/prisma-favorite.repository';

@Module({
  imports: [CatalogModule, WebAuthModule],
  controllers: [FavoritesController],
  providers: [
    FavoritesService,
    { provide: FAVORITE_REPOSITORY, useClass: PrismaFavoriteRepository },
  ],
})
export class FavoritesModule {}
