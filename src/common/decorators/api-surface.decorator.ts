import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

export const API_SURFACE_KEY = 'api_surface';
export const API_SURFACE_METADATA_KEY = 'x-api-surface';
export type ApiSurfaceType = 'admin' | 'web' | 'system';

export const ApiSurface = (surface: ApiSurfaceType) =>
  applyDecorators(
    SetMetadata(API_SURFACE_KEY, surface),
    ApiExtension(API_SURFACE_METADATA_KEY, surface),
  );
